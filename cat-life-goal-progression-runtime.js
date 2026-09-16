(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ChokinCatLifeGoalProgressionRuntime = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const MAIN_KEY = 'chokin-event-app.v0.1';
  const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const object = value => !!value && typeof value === 'object' && !Array.isArray(value);
  function validMain(value) {
    return object(value) && Array.isArray(value.entries) && value.entries.every(entry => object(entry) && typeof entry.id === 'string' && ['save', 'spend'].includes(entry.type) && Number.isSafeInteger(entry.amount) && entry.amount > 0 && typeof entry.createdAt === 'string' && Number.isFinite(Date.parse(entry.createdAt)));
  }
  function entryMutations(beforeMain, afterMain) {
    const before = new Map(beforeMain.entries.map(entry => [entry.id, entry]));
    const after = new Map(afterMain.entries.map(entry => [entry.id, entry]));
    const mutations = [];
    for (const [id, entry] of before) {
      if (!after.has(id)) mutations.push({ kind: 'delete', id });
      else if (!same(entry, after.get(id))) mutations.push({ kind: 'edit', id, entry: clone(after.get(id)) });
    }
    for (const [id, entry] of after) if (!before.has(id)) mutations.push({ kind: 'add', id, entry: clone(entry) });
    return { kind: 'batch', mutations };
  }
  function create({ storage, lifeRuntime, model, progression, transactions }) {
    const LIFE = lifeRuntime.key, SIDE = progression.STORAGE_KEY;
    const parse = raw => raw === null ? null : JSON.parse(raw);
    const rawBundle = () => Object.fromEntries([MAIN_KEY, LIFE, SIDE].map(key => [key, storage.getItem(key)]));
    function validateBundle(raw, context) {
      try {
        const values = { main: parse(raw[MAIN_KEY]), life: parse(raw[LIFE]), side: parse(raw[SIDE]) };
        if (!validMain(values.main) || !lifeRuntime.validateRoot(values.life).valid || !model.validateState(values.side).valid) return false;
        if (context.phase === 'before') return true;
        const before = { main: parse(context.before[MAIN_KEY]), life: parse(context.before[LIFE]), side: parse(context.before[SIDE]) };
        if (!validMain(before.main) || !lifeRuntime.validateRoot(before.life).valid || !model.validateState(before.side).valid) return false;
        if (context.occurrenceId.startsWith('gp1.clock.')) return same(before.life, values.life) && same(before.side, values.side);
        const timestamp = values.side.lastObservedAt;
        const mutation = entryMutations(before.main, values.main);
        const expected = model.mutateEntry({ progression: before.side, catLifeRoot: before.life, mainStateBefore: before.main, timestamp, mutation });
        return same(expected.progression, values.side) && same(expected.catLifeRoot, values.life);
      } catch { return false; }
    }
    const journal = transactions.createProgression({ storage, validateBundle });
    function loadActivation() {
      try { return progression.parseActivation(storage.getItem(progression.ACTIVATION_KEY)); }
      catch { return { status: 'storage_error', state: null }; }
    }
    function loadState() {
      try {
        if (journal.pending()) return { status: 'recovery_required', state: null };
        return progression.parseState(storage.getItem(SIDE));
      } catch { return { status: 'storage_error', state: null }; }
    }
    function isEnabled() {
      const activation = loadActivation();
      return activation.status === 'ok' && activation.state.enabled === true;
    }
    function prepareCommit({ afterMain = null, timestamp }) {
      if (journal.pending()) return { status: 'recovery_required', committed: false };
      const activation = loadActivation();
      if (!['empty', 'ok'].includes(activation.status)) return { status: 'activation_safe_stop', committed: false };
      if (activation.state.enabled !== true) return { status: 'disabled', committed: false };
      const before = rawBundle(), beforeMain = parse(before[MAIN_KEY]), beforeLife = parse(before[LIFE]), beforeSide = parse(before[SIDE]);
      if (!validMain(beforeMain) || !lifeRuntime.validateRoot(beforeLife).valid || !model.validateState(beforeSide).valid) return { status: 'invalid_state', committed: false };
      const targetMain = afterMain === null ? beforeMain : clone(afterMain);
      if (!validMain(targetMain)) return { status: 'invalid_main', committed: false };
      const mutation = entryMutations(beforeMain, targetMain);
      const computed = model.mutateEntry({ progression: beforeSide, catLifeRoot: beforeLife, mainStateBefore: beforeMain, timestamp, mutation });
      const after = { [MAIN_KEY]: JSON.stringify(targetMain), [LIFE]: JSON.stringify(computed.catLifeRoot), [SIDE]: JSON.stringify(computed.progression) };
      if (Object.keys(after).every(key => after[key] === before[key])) return { status: computed.status, committed: false, settlement: computed.settlement, mainState: targetMain };
      const mutationIds = mutation.mutations.map(item => item.id).sort().join('.');
      const prefix = computed.status === 'clock_regression' ? 'gp1.clock' : 'gp1';
      const occurrenceId = `${prefix}.${computed.progression.currentWeekKey}.${mutationIds || 'settle'}.${computed.progression.eligibleNetHighWater}`.slice(0, 256);
      return { status: 'prepared', before, after, occurrenceId, computed, mainState: targetMain };
    }
    function commitMain({ afterMain, timestamp }) {
      const prepared = prepareCommit({ afterMain, timestamp });
      if (prepared.status !== 'prepared') return prepared;
      const result = journal.commit(prepared);
      return { ...result, status: result.committed ? 'progression_committed' : result.status, settlement: result.committed ? prepared.computed.settlement : null, mainState: result.committed ? prepared.mainState : null };
    }
    function settle({ timestamp }) {
      const prepared = prepareCommit({ timestamp });
      if (prepared.status !== 'prepared') return prepared;
      const result = journal.commit(prepared);
      return { ...result, status: result.committed ? 'progression_settled' : result.status, settlement: result.committed ? prepared.computed.settlement : null };
    }
    function prepareAcquisition({ catId, catLifeRaw }) {
      const activation = loadActivation();
      if (activation.status !== 'ok' || activation.state.enabled !== true) return { status: 'disabled', included: false };
      const loaded = loadState();
      if (loaded.status !== 'ok') return { status: loaded.status, included: false };
      const catLifeRoot = parse(catLifeRaw);
      if (!lifeRuntime.validateRoot(catLifeRoot).valid) return { status: 'invalid_life', included: false };
      const prepared = model.prepareAcquisition({ progression: loaded.state, catLifeRoot, catId });
      return { ...prepared, key: SIDE, raw: JSON.stringify(prepared.progression) };
    }
    return Object.freeze({
      key: SIDE, activationKey: progression.ACTIVATION_KEY, loadActivation, loadState, isEnabled,
      commitMain, settle, prepareAcquisition, recover: journal.recover, pending: journal.pending,
      inspect: journal.inspect, validateBundle, entryMutations
    });
  }
  return Object.freeze({ MAIN_KEY, create, validMain, entryMutations });
});
