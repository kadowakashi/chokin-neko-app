(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ChokinCatLifeGoalProgression = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const STORAGE_KEY = 'chokin-event-app.catLifeGoalProgression.v1';
  const ACTIVATION_KEY = 'chokin-event-app.catLifeGoalProgressionActivation.v1';
  const SCHEMA_VERSION = 1;
  const FORMULA_VERSION = 1;
  const RATE_BASIS_POINTS = 2500;
  const CAP_BASIS_POINTS = 5000;
  const SETTLEMENT_RETENTION = 104;
  const object = value => !!value && typeof value === 'object' && !Array.isArray(value);
  const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
  const safeMoney = value => Number.isSafeInteger(value) && value >= 0;
  const validDate = value => typeof value === 'string' && Number.isFinite(Date.parse(value));
  const exact = (value, keys) => object(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
  const ACTIVATION_KEYS = ['schemaVersion', 'enabled', 'activatedAt', 'activatedWeekKey'];
  const STATE_KEYS = ['schemaVersion', 'formulaVersion', 'rateBasisPoints', 'weeklyCapBasisPoints', 'activatedAt', 'currentWeekKey', 'eligibleNet', 'eligibleNetHighWater', 'entries', 'cats', 'appliedSettlementIds', 'lastObservedAt', 'latestSettlement'];
  const ENTRY_KEYS = ['signedAmount', 'recordedAt', 'mutationRevision'];
  const CAT_KEYS = ['joinedHighWater', 'weeklyCap', 'goalId', 'protectedAmount'];
  const SETTLEMENT_KEYS = ['settlementId', 'weekKey', 'settledAt', 'highWaterBefore', 'highWaterAfter', 'increment', 'credits'];
  const CREDIT_KEYS = ['catId', 'amount', 'completedGoalId'];

  function requireDate(value, name) {
    const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
    if (!Number.isFinite(date.getTime())) throw new TypeError(`${name} must be a valid date`);
    return date;
  }
  function dayKey(date) {
    const pad = value => String(value).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }
  function weekKeyAt(value) {
    const date = requireDate(value, 'timestamp');
    const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
    return dayKey(start);
  }
  function disabledActivation() {
    return { schemaVersion: 1, enabled: false, activatedAt: null, activatedWeekKey: null };
  }
  function enabledActivation(timestamp) {
    const stamp = requireDate(timestamp, 'timestamp').toISOString();
    return { schemaVersion: 1, enabled: true, activatedAt: stamp, activatedWeekKey: weekKeyAt(timestamp) };
  }
  function validateActivation(value) {
    if (!exact(value, ACTIVATION_KEYS) || value.schemaVersion !== 1 || typeof value.enabled !== 'boolean') return { valid: false, errors: [{ code: 'invalid_activation' }] };
    const valid = value.enabled ? validDate(value.activatedAt) && value.activatedWeekKey === weekKeyAt(value.activatedAt) : value.activatedAt === null && value.activatedWeekKey === null;
    return { valid, errors: valid ? [] : [{ code: 'invalid_activation_state' }], state: valid ? clone(value) : null };
  }
  function parseActivation(raw) {
    if (raw === null) return { status: 'empty', state: disabledActivation() };
    try {
      const value = JSON.parse(raw), checked = validateActivation(value);
      return checked.valid ? { status: 'ok', state: checked.state } : { status: 'invalid', state: null };
    } catch { return { status: 'invalid', state: null }; }
  }
  function catCap(life, state) {
    const representative = state?.economyScaleAtAcquisition?.representativeSavingAmount;
    const basis = Number.isFinite(representative) && representative > 0 ? representative : 1;
    return life.roundCatAmount(basis * CAP_BASIS_POINTS / 10000);
  }
  function catRecord(life, state, joinedHighWater) {
    return {
      joinedHighWater,
      weeklyCap: catCap(life, state),
      goalId: state?.currentGoal?.goalId ?? null,
      protectedAmount: 0
    };
  }
  function createInitialState({ activation, catLifeRoot, life }) {
    const checked = validateActivation(activation);
    if (!checked.valid || checked.state.enabled !== true) throw new TypeError('enabled activation is required');
    if (!object(catLifeRoot?.cats)) throw new TypeError('catLifeRoot is required');
    const cats = Object.fromEntries(Object.entries(catLifeRoot.cats).map(([catId, state]) => [catId, catRecord(life, state, 0)]));
    return {
      schemaVersion: SCHEMA_VERSION,
      formulaVersion: FORMULA_VERSION,
      rateBasisPoints: RATE_BASIS_POINTS,
      weeklyCapBasisPoints: CAP_BASIS_POINTS,
      activatedAt: checked.state.activatedAt,
      currentWeekKey: checked.state.activatedWeekKey,
      eligibleNet: 0,
      eligibleNetHighWater: 0,
      entries: {},
      cats,
      appliedSettlementIds: [],
      lastObservedAt: checked.state.activatedAt,
      latestSettlement: null
    };
  }
  function validateState(value) {
    const errors = [];
    if (!exact(value, STATE_KEYS)) return { valid: false, errors: [{ code: 'invalid_state_keys' }] };
    if (value.schemaVersion !== SCHEMA_VERSION || value.formulaVersion !== FORMULA_VERSION || value.rateBasisPoints !== RATE_BASIS_POINTS || value.weeklyCapBasisPoints !== CAP_BASIS_POINTS) errors.push({ code: 'invalid_versions' });
    const activatedWeekKey = validDate(value.activatedAt) ? weekKeyAt(value.activatedAt) : null;
    if (!validDate(value.activatedAt) || !validDate(value.lastObservedAt) || Date.parse(value.lastObservedAt) < Date.parse(value.activatedAt) || typeof value.currentWeekKey !== 'string' || weekKeyAt(`${value.currentWeekKey}T12:00:00`) !== value.currentWeekKey || activatedWeekKey !== null && value.currentWeekKey < activatedWeekKey) errors.push({ code: 'invalid_dates' });
    if (!Number.isSafeInteger(value.eligibleNet) || !safeMoney(value.eligibleNetHighWater)) errors.push({ code: 'invalid_net' });
    if (!object(value.entries) || !Object.entries(value.entries).every(([id, entry]) => typeof id === 'string' && id.length > 0 && exact(entry, ENTRY_KEYS) && Number.isSafeInteger(entry.signedAmount) && entry.signedAmount !== 0 && validDate(entry.recordedAt) && Number.isSafeInteger(entry.mutationRevision) && entry.mutationRevision > 0)) errors.push({ code: 'invalid_entries' });
    if (!object(value.cats) || !Object.entries(value.cats).every(([id, cat]) => typeof id === 'string' && id.length > 0 && exact(cat, CAT_KEYS) && safeMoney(cat.joinedHighWater) && cat.joinedHighWater <= Math.max(value.eligibleNetHighWater || 0, value.eligibleNet || 0) && safeMoney(cat.weeklyCap) && cat.weeklyCap > 0 && (cat.goalId === null || typeof cat.goalId === 'string') && safeMoney(cat.protectedAmount))) errors.push({ code: 'invalid_cats' });
    if (!Array.isArray(value.appliedSettlementIds) || value.appliedSettlementIds.length > SETTLEMENT_RETENTION || new Set(value.appliedSettlementIds).size !== value.appliedSettlementIds.length || !value.appliedSettlementIds.every(id => typeof id === 'string' && id.length > 0)) errors.push({ code: 'invalid_settlements' });
    if (value.latestSettlement !== null) {
      const latest = value.latestSettlement, creditIds = Array.isArray(latest?.credits) ? latest.credits.map(credit => credit?.catId) : [];
      const validLatest = exact(latest, SETTLEMENT_KEYS)
        && typeof latest.settlementId === 'string' && latest.settlementId.length > 0
        && typeof latest.weekKey === 'string' && weekKeyAt(`${latest.weekKey}T12:00:00`) === latest.weekKey && latest.weekKey <= value.currentWeekKey
        && validDate(latest.settledAt) && Date.parse(latest.settledAt) <= Date.parse(value.lastObservedAt)
        && safeMoney(latest.highWaterBefore) && safeMoney(latest.highWaterAfter) && latest.highWaterAfter >= latest.highWaterBefore
        && latest.increment === latest.highWaterAfter - latest.highWaterBefore && latest.highWaterAfter === value.eligibleNetHighWater
        && Array.isArray(latest.credits) && new Set(creditIds).size === creditIds.length
        && latest.credits.every(credit => exact(credit, CREDIT_KEYS) && typeof credit.catId === 'string' && Object.hasOwn(value.cats, credit.catId) && safeMoney(credit.amount) && (credit.completedGoalId === null || typeof credit.completedGoalId === 'string'))
        && value.appliedSettlementIds.includes(latest.settlementId);
      if (!validLatest) errors.push({ code: 'invalid_latest_settlement' });
    }
    const entryNet = object(value.entries) ? Object.values(value.entries).reduce((sum, entry) => sum + (Number.isSafeInteger(entry?.signedAmount) ? entry.signedAmount : 0), 0) : NaN;
    if (entryNet !== value.eligibleNet) errors.push({ code: 'eligible_net_mismatch' });
    return { valid: errors.length === 0, errors, state: errors.length ? null : clone(value) };
  }
  function parseState(raw) {
    if (raw === null) return { status: 'empty', state: null };
    try {
      const value = JSON.parse(raw), checked = validateState(value);
      return checked.valid ? { status: 'ok', state: checked.state } : { status: 'invalid', state: null, errors: checked.errors };
    } catch { return { status: 'invalid', state: null, errors: [{ code: 'invalid_json' }] }; }
  }
  function validMain(main) {
    return object(main) && Array.isArray(main.entries) && main.entries.every(entry => object(entry) && typeof entry.id === 'string' && ['save', 'spend'].includes(entry.type) && Number.isSafeInteger(entry.amount) && entry.amount > 0);
  }
  function signedEntry(entry) { return entry.type === 'save' ? entry.amount : -entry.amount; }

  function createModel({ life, catWorld }) {
    if (typeof life?.roundCatAmount !== 'function' || typeof life?.calculateGoalSpendAmount !== 'function' || !Array.isArray(catWorld?.cats)) throw new TypeError('goal progression dependencies are required');
    const masters = new Map(catWorld.cats.map(cat => [cat.id, cat]));
    function completeProtected(state, master, mainState, stamp) {
      const current = state.currentGoal, goalMaster = master.goals.find(goal => goal.goalId === current.goalId);
      if (!goalMaster) throw new RangeError(`missing goal master: ${current.goalId}`);
      const next = clone(state);
      const spend = life.calculateGoalSpendAmount({ requiredIncrease: current.requiredIncrease, spendingBehavior: goalMaster.spendingBehavior, currentBalance: next.currentBalance });
      next.completedGoals.push({
        goalId: current.goalId, startedAt: current.startedAt, completedAt: stamp,
        startBalance: current.startBalance, targetBalance: current.targetBalance,
        requiredIncrease: current.requiredIncrease, goalBasisAmount: current.goalBasisAmount,
        goalBasisSource: current.goalBasisSource, spendingBehavior: goalMaster.spendingBehavior,
        spentAmount: spend.spentAmount, goalFormulaVersion: current.goalFormulaVersion
      });
      next.currentBalance -= spend.spentAmount;
      next.totalSpent += spend.spentAmount;
      if (goalMaster.nextGoalId) {
        const nextMaster = master.goals.find(goal => goal.goalId === goalMaster.nextGoalId);
        if (!nextMaster) throw new RangeError(`missing next goal master: ${goalMaster.nextGoalId}`);
        const basis = life.calculateNextGoalBasis({ previousGoalBasisAmount: current.goalBasisAmount, previousGoalBasisSource: current.goalBasisSource, entries: mainState.entries, calculatedAt: stamp });
        next.currentGoal = life.buildGoalState({ goal: nextMaster, goalBasisAmount: basis.goalBasisAmount, goalBasisSource: basis.goalBasisSource, startBalance: next.currentBalance, startedAt: stamp });
        next.longTermSavingMode = { active: false, startedAt: null, progressUnits: 0 };
      } else {
        next.currentGoal = null;
        next.longTermSavingMode = { active: true, startedAt: stamp, progressUnits: 0 };
      }
      next.goalProgress = 0;
      next.updatedAt = stamp;
      return { state: next, spend };
    }
    function reconcile(next, catLifeRoot) {
      for (const [catId, state] of Object.entries(catLifeRoot.cats)) {
        if (!next.cats[catId]) next.cats[catId] = catRecord(life, state, Math.max(next.eligibleNetHighWater, next.eligibleNet));
        const record = next.cats[catId], goalId = state.currentGoal?.goalId ?? null;
        if (record.goalId !== goalId) { record.goalId = goalId; record.protectedAmount = 0; }
      }
    }
    function settle({ progression, catLifeRoot, mainState, timestamp }) {
      const stamp = requireDate(timestamp, 'timestamp').toISOString(), weekKey = weekKeyAt(timestamp);
      const next = clone(progression), lifeRoot = clone(catLifeRoot);
      if (Date.parse(stamp) < Date.parse(next.lastObservedAt) || weekKey < next.currentWeekKey) return { status: 'clock_regression', progression: next, catLifeRoot: lifeRoot, settlement: null };
      reconcile(next, lifeRoot);
      if (weekKey === next.currentWeekKey) { next.lastObservedAt = stamp; return { status: 'same_week', progression: next, catLifeRoot: lifeRoot, settlement: null }; }
      const before = next.eligibleNetHighWater, after = Math.max(before, next.eligibleNet), increment = Math.max(0, after - before);
      const settlementId = `gp1:${next.currentWeekKey}:${before}:${after}`;
      if (next.appliedSettlementIds.includes(settlementId)) return { status: 'already_applied', progression: next, catLifeRoot: lifeRoot, settlement: null };
      const credits = [];
      for (const [catId, state] of Object.entries(lifeRoot.cats)) {
        const record = next.cats[catId], catIncrement = Math.max(0, after - record.joinedHighWater);
        const amount = Math.min(life.roundCatAmount(catIncrement * RATE_BASIS_POINTS / 10000), record.weeklyCap);
        let catState = clone(state), completedGoalId = null;
        if (amount > 0) {
          catState.currentBalance += amount;
          catState.totalSaved += amount;
          catState.updatedAt = stamp;
          if (catState.currentGoal) record.protectedAmount += amount;
          if (catState.currentGoal && life.isGoalCompleted(catState)) {
            const completed = life.prepareGoalCompletion({ state: catState, masterCat: masters.get(catId), mainState, expectedGoalId: catState.currentGoal.goalId, completedAt: stamp });
            if (completed.status !== 'completed') throw new Error(`goal completion failed: ${catId}`);
            completedGoalId = completed.completedGoal.goalId;
            catState = completed.state;
            record.protectedAmount = 0;
          } else if (catState.currentGoal && record.protectedAmount >= catState.currentGoal.requiredIncrease) {
            completedGoalId = catState.currentGoal.goalId;
            catState = completeProtected(catState, masters.get(catId), mainState, stamp).state;
            record.protectedAmount = 0;
          }
          record.goalId = catState.currentGoal?.goalId ?? null;
          lifeRoot.cats[catId] = catState;
        }
        record.joinedHighWater = after;
        credits.push({ catId, amount, completedGoalId });
      }
      next.eligibleNetHighWater = after;
      next.currentWeekKey = weekKey;
      next.lastObservedAt = stamp;
      next.appliedSettlementIds = [settlementId, ...next.appliedSettlementIds.filter(id => id !== settlementId)].slice(0, SETTLEMENT_RETENTION);
      next.latestSettlement = { settlementId, weekKey: progression.currentWeekKey, settledAt: stamp, highWaterBefore: before, highWaterAfter: after, increment, credits };
      if (credits.some(item => item.amount > 0)) lifeRoot.updatedAt = stamp;
      return { status: increment > 0 ? 'settled' : 'settled_no_credit', progression: next, catLifeRoot: lifeRoot, settlement: clone(next.latestSettlement) };
    }
    function mutateEntry({ progression, catLifeRoot, mainStateBefore, timestamp, mutation }) {
      if (!validMain(mainStateBefore)) throw new TypeError('valid mainStateBefore is required');
      const advanced = settle({ progression, catLifeRoot, mainState: mainStateBefore, timestamp });
      if (advanced.status === 'clock_regression') return { ...advanced, entryStatus: 'excluded_clock_regression' };
      const next = advanced.progression;
      if (!object(mutation) || !['add', 'edit', 'delete', 'none', 'batch'].includes(mutation.kind)) throw new TypeError('valid mutation is required');
      const mutations = mutation.kind === 'batch' ? mutation.mutations : [mutation];
      if (!Array.isArray(mutations)) throw new TypeError('valid mutations are required');
      for (const item of mutations) {
        if (item.kind === 'none') continue;
        const current = next.entries[item.id];
        if (item.kind === 'add') {
          if (!object(item.entry) || item.entry.id !== item.id) throw new TypeError('entry mismatch');
          if (!current) {
            const signedAmount = signedEntry(item.entry);
            next.entries[item.id] = { signedAmount, recordedAt: requireDate(timestamp, 'timestamp').toISOString(), mutationRevision: 1 };
            next.eligibleNet += signedAmount;
          }
        } else if (item.kind === 'edit' && current) {
          const signedAmount = signedEntry(item.entry);
          next.eligibleNet += signedAmount - current.signedAmount;
          next.entries[item.id] = { signedAmount, recordedAt: requireDate(timestamp, 'timestamp').toISOString(), mutationRevision: current.mutationRevision + 1 };
        } else if (item.kind === 'delete' && current) {
          next.eligibleNet -= current.signedAmount;
          delete next.entries[item.id];
        }
      }
      next.lastObservedAt = requireDate(timestamp, 'timestamp').toISOString();
      return { ...advanced, progression: next, entryStatus: mutation.kind };
    }
    function prepareAcquisition({ progression, catLifeRoot, catId }) {
      const next = clone(progression), state = catLifeRoot?.cats?.[catId];
      if (!state || !masters.has(catId)) return { status: 'missing_cat', progression: next, included: false };
      if (next.cats[catId]) return { status: 'exists', progression: next, included: false };
      next.cats[catId] = catRecord(life, state, Math.max(next.eligibleNetHighWater, next.eligibleNet));
      return { status: 'prepared', progression: next, included: true };
    }
    return Object.freeze({ validateState, createInitialState: input => createInitialState({ ...input, life }), settle, mutateEntry, prepareAcquisition });
  }

  return Object.freeze({
    STORAGE_KEY, ACTIVATION_KEY, SCHEMA_VERSION, FORMULA_VERSION, RATE_BASIS_POINTS, CAP_BASIS_POINTS,
    weekKeyAt, disabledActivation, enabledActivation, validateActivation, parseActivation,
    validateState, parseState, createInitialState, createModel
  });
});
