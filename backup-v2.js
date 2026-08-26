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

  function inspectBackupV2(value, validateCatLifeRoot) {
    if (!object(value) || value.backupVersion !== 2 || !object(value.data)) return { valid: false, error: 'invalid_v2_shape' };
    const missingFields = V1_DATA_FIELDS.filter(key => !owns(value.data, key));
    if (!owns(value.data, 'catLife')) return { valid: false, error: 'cat_life_missing', missingFields };
    const catLife = typeof validateCatLifeRoot === 'function' ? validateCatLifeRoot(value.data.catLife) : { valid: false, errors: [{ code: 'validator_missing' }] };
    return { valid: missingFields.length === 0 && catLife.valid === true, error: catLife.valid === true ? null : 'cat_life_invalid', missingFields, catLife, root: catLife.valid === true ? clone(value.data.catLife) : null };
  }

  function createBackupV2({ backupV1, catLifeRoot, validateCatLifeRoot }) {
    if (!object(backupV1) || backupV1.backupVersion !== 1 || !object(backupV1.data)) throw new TypeError('backupVersion 1 source is required');
    const missingFields = V1_DATA_FIELDS.filter(key => !owns(backupV1.data, key));
    if (missingFields.length) throw new TypeError(`backupVersion 1 fields are missing: ${missingFields.join(',')}`);
    const checked = validateCatLifeRoot(catLifeRoot);
    if (!checked?.valid) throw new TypeError('valid catLife root is required');
    const output = clone(backupV1);
    output.backupVersion = 2;
    output.data.catLife = clone(catLifeRoot);
    return output;
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

  return Object.freeze({ V1_DATA_FIELDS, inspectBackupV2, createBackupV2, runAtomic });
});
