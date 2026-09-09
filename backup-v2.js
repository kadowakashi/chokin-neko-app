(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ChokinBackupV2 = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const V1_DATA_FIELDS = Object.freeze([
    'version', 'entries', 'settings', 'futureSettings', 'quickAmounts',
    'catCollection', 'catCoins', 'savingsGoal', 'goalHistory', 'badgeState', 'dailyNotes'
  ]);
  const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
  const object = value => !!value && typeof value === 'object' && !Array.isArray(value);
  const owns = (value, key) => Object.prototype.hasOwnProperty.call(value, key);

  function inspectFinancialProjection(financialState, eventState) {
    if (!object(eventState) || !Array.isArray(eventState.history) || !Array.isArray(financialState?.records)) return false;
    const history = new Map(eventState.history.map(record => [record.occurrenceId, record]));
    const firstRetainedDay = eventState.history.reduce((first, record) => !first || record.localDayKey < first ? record.localDayKey : first, null);
    return financialState.records.every(record => {
      const projection = record.projection;
      if (!object(projection)) return false;
      const retained = history.get(projection.occurrenceId);
      if (!retained) return firstRetainedDay !== null && projection.localDayKey < firstRetainedDay;
      const keys = Object.keys(projection);
      return keys.length === Object.keys(retained).length && keys.every(key => retained[key] === projection[key]);
    });
  }

  function inspectBackupV2(value, validateCatLifeRoot, validateEventState, validateFinancialState) {
    if (!object(value) || value.backupVersion !== 2 || !object(value.data)) return { valid: false, error: 'invalid_v2_shape' };
    const missingFields = V1_DATA_FIELDS.filter(key => !owns(value.data, key));
    if (!owns(value.data, 'catLife')) return { valid: false, error: 'cat_life_missing', missingFields };
    const catLife = typeof validateCatLifeRoot === 'function' ? validateCatLifeRoot(value.data.catLife) : { valid: false, errors: [{ code: 'validator_missing' }] };
    const eventStatePresent = owns(value.data, 'catLifeEvents');
    const events = eventStatePresent
      ? (typeof validateEventState === 'function' ? validateEventState(value.data.catLifeEvents) : { valid: false, errors: [{ code: 'validator_missing' }] })
      : { valid: true, errors: [], state: 'absent' };
    const financialStatePresent = owns(value.data, 'catLifeFinancial');
    const financial = financialStatePresent
      ? (typeof validateFinancialState === 'function' ? validateFinancialState(value.data.catLifeFinancial, value.data.catLifeEvents) : { valid: false, errors: [{ code: 'validator_missing' }] })
      : { valid: true, errors: [] };
    const financialValid = financial.valid === true && (!financialStatePresent || (eventStatePresent && events.valid === true && inspectFinancialProjection(value.data.catLifeFinancial, value.data.catLifeEvents)));
    const valid = missingFields.length === 0 && catLife.valid === true && events.valid === true && financialValid;
    return {
      valid,
      error: catLife.valid !== true ? 'cat_life_invalid' : events.valid !== true ? 'cat_life_events_invalid' : !financialValid ? 'cat_life_financial_invalid' : null,
      missingFields,
      catLife,
      root: catLife.valid === true ? clone(value.data.catLife) : null,
      eventStatePresent,
      catLifeEvents: { present: eventStatePresent, valid: events.valid === true, state: eventStatePresent && events.valid === true ? clone(value.data.catLifeEvents) : null, errors: events.errors || [] },
      financialStatePresent,
      catLifeFinancial: { present: financialStatePresent, valid: financialValid, state: financialStatePresent && financialValid ? clone(value.data.catLifeFinancial) : null, errors: financialValid ? [] : [...(financial.errors || []), { code: 'financial_projection_invalid' }] }
    };
  }

  function createBackupV2({ backupV1, catLifeRoot, validateCatLifeRoot, eventState, validateEventState, financialState, validateFinancialState }) {
    if (!object(backupV1) || backupV1.backupVersion !== 1 || !object(backupV1.data)) throw new TypeError('backupVersion 1 source is required');
    const missingFields = V1_DATA_FIELDS.filter(key => !owns(backupV1.data, key));
    if (missingFields.length) throw new TypeError(`backupVersion 1 fields are missing: ${missingFields.join(',')}`);
    const checked = validateCatLifeRoot(catLifeRoot);
    if (!checked?.valid) throw new TypeError('valid catLife root is required');
    const output = clone(backupV1);
    output.backupVersion = 2;
    output.data.catLife = clone(catLifeRoot);
    if (eventState !== undefined) {
      const eventChecked = typeof validateEventState === 'function' ? validateEventState(eventState) : { valid: false };
      if (!eventChecked?.valid) throw new TypeError('valid catLife event state is required');
      output.data.catLifeEvents = clone(eventState);
    }
    if (financialState !== undefined) {
      const checked = typeof validateFinancialState === 'function' ? validateFinancialState(financialState, eventState) : { valid: false };
      if (!checked?.valid || !inspectFinancialProjection(financialState, eventState)) throw new TypeError('valid financial state and compatibility projections are required');
      output.data.catLifeFinancial = clone(financialState);
    }
    return output;
  }

  // The caller holds the shared writer lock for this entire synchronous operation.
  function runSynchronous({ capture, apply, verify, rollback }) {
    const callbacks = [capture, apply, verify, rollback];
    if (callbacks.some(callback => typeof callback !== 'function' || callback.constructor?.name === 'AsyncFunction')) return { ok: false, rollbackOk: true, phase: 'capture', error: new TypeError('synchronous callbacks are required') };
    const synchronous = value => { if (value && typeof value.then === 'function') throw new TypeError('asynchronous callback result is not allowed'); return value; };
    let before;
    try { before = synchronous(capture()); }
    catch (error) { return { ok: false, rollbackOk: true, phase: 'capture', error }; }
    try {
      synchronous(apply(before));
      synchronous(verify());
      return { ok: true, rollbackOk: true, phase: 'committed' };
    } catch (error) {
      let rollbackOk = false;
      try { rollbackOk = synchronous(rollback(before)) === true; } catch { rollbackOk = false; }
      return { ok: false, rollbackOk, phase: 'rolled_back', error };
    }
  }

  async function runAtomic({ capture, apply, verify, rollback }) {
    let before;
    try { before = await capture(); }
    catch (error) { return { ok: false, rollbackOk: true, phase: 'capture', error }; }
    try {
      await apply(before);
      await verify();
      return { ok: true, rollbackOk: true, phase: 'committed' };
    } catch (error) {
      let rollbackOk = false;
      try { rollbackOk = await rollback(before) === true; }
      catch { rollbackOk = false; }
      return { ok: false, rollbackOk, phase: 'rolled_back', error };
    }
  }

  return Object.freeze({ V1_DATA_FIELDS, inspectBackupV2, createBackupV2, runAtomic, runSynchronous });
});
