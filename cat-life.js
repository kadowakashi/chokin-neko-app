(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ChokinCatLife = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const CAT_LIFE_SCHEMA_VERSION = 1;
  const ECONOMY_FORMULA_VERSION = 1;
  const GOAL_FORMULA_VERSION = 1;
  const CAT_LIFE_STORAGE_KEY = 'chokin-event-app.catLife.v1';
  const FEATURE_FLAG = Object.freeze({ name: 'catLife', defaultEnabled: false });
  const LEVEL_COEFFICIENTS = Object.freeze({ 1: 0.30, 2: 0.50, 3: 0.75, 4: 1.00, 5: 1.30 });
  const GOAL_SCALE_MULTIPLIERS = Object.freeze({ 1: 5, 2: 8, 3: 12, 4: 18, 5: 25 });
  const GOAL_SPEND_RATES = Object.freeze({ none: 0, light: 0.20, medium: 0.40, large: 0.70, very_large: 0.90 });
  const GOAL_BASIS_SOURCES = Object.freeze({
    ZERO_START_BOOTSTRAP: 'zero_start_bootstrap',
    ACQUISITION_SCALE: 'acquisition_scale',
    ROLLING_MEDIAN: 'rolling_median'
  });
  const LOOKBACK_MODES = Object.freeze({ RECENT: 'recent_30d', EXTENDED: 'extended_180d', BALANCE: 'balance_fallback', ZERO: 'zero_start' });
  const DAY_MS = 24 * 60 * 60 * 1000;

  const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
  const isPlainObject = value => !!value && typeof value === 'object' && !Array.isArray(value);
  const validDate = value => {
    if (typeof value !== 'string' && !(value instanceof Date)) return null;
    const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  };
  const requireDate = (value, name) => {
    const date = validDate(value);
    if (!date) throw new TypeError(`${name} must be a valid date`);
    return date;
  };
  const safeMoney = value => {
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return 0;
    return Math.min(value, Number.MAX_SAFE_INTEGER);
  };
  const requireNonNegativeInteger = (value, name) => {
    if (!Number.isSafeInteger(value) || value < 0) throw new RangeError(`${name} must be a non-negative safe integer`);
    return value;
  };
  const requirePositiveNumber = (value, name) => {
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) throw new RangeError(`${name} must be a positive finite number`);
    return value;
  };
  const safeAddMoney = (left, right, name) => {
    const value = left + right;
    if (!Number.isSafeInteger(value) || value < 0) throw new RangeError(`${name} exceeds the safe money range`);
    return value;
  };

  function isConfirmedPositiveSavingEntry(entry) {
    if (!isPlainObject(entry) || typeof entry.id !== 'string' || entry.id.length === 0) return false;
    if (entry.type !== 'save' || !Number.isSafeInteger(entry.amount) || entry.amount <= 0) return false;
    if (entry.category !== null || typeof entry.memo !== 'string' || !validDate(entry.createdAt)) return false;
    if (entry.cancelled === true || entry.canceled === true || entry.invalid === true || entry.rolledBack === true || entry.rollback === true) return false;
    if (entry.test === true || entry.isTest === true || entry.internal === true || entry.isInternal === true) return false;
    if (typeof entry.status === 'string' && ['cancelled', 'canceled', 'invalid', 'rolled_back', 'rollback', 'test'].includes(entry.status)) return false;
    return true;
  }

  function calculateCurrentSavingsBalance(entries) {
    if (!Array.isArray(entries)) return 0;
    return entries.reduce((total, entry) => {
      if (!isConfirmedPositiveSavingEntry(entry)) return total;
      return Math.min(Number.MAX_SAFE_INTEGER, total + entry.amount);
    }, 0);
  }

  function calculateMedian(values) {
    if (!Array.isArray(values) || values.length === 0) return null;
    const sorted = values.map(Number).filter(Number.isFinite).sort((a, b) => a - b);
    if (sorted.length !== values.length) throw new TypeError('median values must be finite numbers');
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
  }

  function localWindowStart(now, days) {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    start.setDate(start.getDate() - (days - 1));
    return start;
  }

  function collectEconomySample(entries, nowValue) {
    const now = requireDate(nowValue, 'now');
    const records = (Array.isArray(entries) ? entries : [])
      .map((entry, index) => ({ entry, index, date: validDate(entry?.createdAt) }))
      .filter(item => item.date && item.date <= now && isConfirmedPositiveSavingEntry(item.entry))
      .sort((a, b) => b.date.getTime() - a.date.getTime() || a.index - b.index);
    const start30 = localWindowStart(now, 30);
    const recent = records.filter(item => item.date >= start30);
    if (recent.length >= 5) {
      return { amounts: recent.map(item => item.entry.amount), sampleCount: recent.length, lookbackMode: LOOKBACK_MODES.RECENT };
    }
    const start180 = localWindowStart(now, 180);
    const extended = records.filter(item => item.date >= start180).slice(0, 10);
    if (extended.length) {
      return { amounts: extended.map(item => item.entry.amount), sampleCount: extended.length, lookbackMode: LOOKBACK_MODES.EXTENDED };
    }
    return { amounts: [], sampleCount: 0, lookbackMode: null };
  }

  function calculateEconomyScale({ currentBalance, entries, calculatedAt }) {
    const now = requireDate(calculatedAt, 'calculatedAt');
    const B = safeMoney(currentBalance);
    const sample = collectEconomySample(entries, now);
    let M;
    let lookbackMode = sample.lookbackMode;
    if (sample.sampleCount > 0) M = calculateMedian(sample.amounts);
    else if (B > 0) { M = B / 20; lookbackMode = LOOKBACK_MODES.BALANCE; }
    else { M = 0; lookbackMode = LOOKBACK_MODES.ZERO; }
    const E = M > 0 ? Math.min(B, M * 100) : 0;
    const S = E * 0.75 + M * 5;
    return Object.freeze({
      currentSavingsBalance: B,
      representativeSavingAmount: M,
      effectiveBalance: E,
      baseAmount: S,
      sampleCount: sample.sampleCount,
      lookbackMode,
      calculatedAt: now.toISOString()
    });
  }

  function roundingUnitFor(rawValue) {
    const raw = safeMoney(rawValue);
    if (raw === 0) return 1;
    if (raw < 100) return 1;
    if (raw < 1000) return 10;
    if (raw < 10000) return 100;
    if (raw < 100000) return 500;
    if (raw < 1000000) return 1000;
    return 10000;
  }

  function roundCatAmount(rawValue) {
    const raw = safeMoney(rawValue);
    if (raw === 0) return 0;
    const unit = roundingUnitFor(raw);
    const rounded = Math.floor(raw / unit + 0.5) * unit;
    return Math.max(1, Math.min(Number.MAX_SAFE_INTEGER, rounded));
  }

  function calculateInitialBalance({ baseAmount, initialAssetLevel, initialBalanceBias }) {
    const S = safeMoney(baseAmount);
    const L = LEVEL_COEFFICIENTS[initialAssetLevel];
    if (typeof L !== 'number') throw new RangeError('initialAssetLevel must be 1..5');
    if (typeof initialBalanceBias !== 'number' || !Number.isFinite(initialBalanceBias) || initialBalanceBias < 0.90 || initialBalanceBias > 1.10) {
      throw new RangeError('initialBalanceBias must be 0.90..1.10');
    }
    const effectiveCoefficient = L * initialBalanceBias;
    const rawInitialBalance = S * effectiveCoefficient;
    return Object.freeze({
      initialAssetLevel,
      levelCoefficient: L,
      initialBalanceBias,
      effectiveCoefficient,
      rawInitialBalance,
      roundingUnit: roundingUnitFor(rawInitialBalance),
      initialBalance: roundCatAmount(rawInitialBalance)
    });
  }

  function getGoalScaleMultiplier(goalScale) {
    const multiplier = GOAL_SCALE_MULTIPLIERS[goalScale];
    if (typeof multiplier !== 'number') throw new RangeError('goalScale must be 1..5');
    return multiplier;
  }

  function getGoalSpendRate(spendingBehavior) {
    const rate = GOAL_SPEND_RATES[spendingBehavior];
    if (typeof rate !== 'number') throw new RangeError('invalid spendingBehavior');
    return rate;
  }

  function calculateGoalBasisAmount(representativeSavingAmount) {
    return typeof representativeSavingAmount === 'number' && Number.isFinite(representativeSavingAmount) && representativeSavingAmount > 0
      ? representativeSavingAmount
      : 1;
  }

  function requireGoalBasisSource(value, name = 'goalBasisSource') {
    if (!Object.values(GOAL_BASIS_SOURCES).includes(value)) throw new RangeError(`invalid ${name}`);
    return value;
  }

  function calculateFirstGoalBasis(representativeSavingAmount) {
    const hasPositiveAcquisitionScale = typeof representativeSavingAmount === 'number'
      && Number.isFinite(representativeSavingAmount)
      && representativeSavingAmount > 0;
    return Object.freeze({
      goalBasisAmount: calculateGoalBasisAmount(representativeSavingAmount),
      goalBasisSource: hasPositiveAcquisitionScale
        ? GOAL_BASIS_SOURCES.ACQUISITION_SCALE
        : GOAL_BASIS_SOURCES.ZERO_START_BOOTSTRAP
    });
  }

  function calculateRequiredIncrease({ goalBasisAmount, goalScale }) {
    const basis = requirePositiveNumber(goalBasisAmount, 'goalBasisAmount');
    return roundCatAmount(basis * getGoalScaleMultiplier(goalScale));
  }

  function buildGoalState({ goal, goalBasisAmount, goalBasisSource, startBalance, startedAt }) {
    if (!isPlainObject(goal) || typeof goal.goalId !== 'string' || !goal.goalId) throw new TypeError('goal must contain goalId');
    const start = requireNonNegativeInteger(startBalance, 'startBalance');
    const basis = requirePositiveNumber(goalBasisAmount, 'goalBasisAmount');
    const requiredIncrease = calculateRequiredIncrease({ goalBasisAmount: basis, goalScale: goal.goalScale });
    return {
      goalId: goal.goalId,
      goalScale: goal.goalScale,
      goalBasisAmount: basis,
      goalBasisSource: requireGoalBasisSource(goalBasisSource),
      startBalance: start,
      requiredIncrease,
      targetBalance: safeAddMoney(start, requiredIncrease, 'targetBalance'),
      startedAt: requireDate(startedAt, 'startedAt').toISOString(),
      goalFormulaVersion: GOAL_FORMULA_VERSION
    };
  }

  function createGoalIfAbsent(state, { goal, goalBasisAmount, goalBasisSource, startedAt }) {
    const next = clone(state);
    if (!isPlainObject(next)) throw new TypeError('state is required');
    if (isPlainObject(next.currentGoal)) return next;
    if (next.longTermSavingMode?.active === true) return next;
    next.currentGoal = buildGoalState({ goal, goalBasisAmount, goalBasisSource, startBalance: next.currentBalance, startedAt });
    next.updatedAt = next.currentGoal.startedAt;
    return next;
  }

  function isGoalCompleted({ currentBalance, currentGoal }) {
    if (!isPlainObject(currentGoal)) return false;
    return requireNonNegativeInteger(currentBalance, 'currentBalance') >= requireNonNegativeInteger(currentGoal.targetBalance, 'currentGoal.targetBalance');
  }

  function calculateGoalSpendAmount({ requiredIncrease, spendingBehavior, currentBalance }) {
    const required = requireNonNegativeInteger(requiredIncrease, 'requiredIncrease');
    const balance = requireNonNegativeInteger(currentBalance, 'currentBalance');
    const spendRate = getGoalSpendRate(spendingBehavior);
    const rawSpendAmount = required * spendRate;
    const roundedSpendAmount = spendRate === 0 ? 0 : roundCatAmount(rawSpendAmount);
    return Object.freeze({
      spendingBehavior,
      spendRate,
      rawSpendAmount,
      roundedSpendAmount,
      spentAmount: Math.min(balance, roundedSpendAmount)
    });
  }

  function calculateNextGoalBasis({ previousGoalBasisAmount, previousGoalBasisSource, entries, calculatedAt }) {
    const previous = requirePositiveNumber(previousGoalBasisAmount, 'previousGoalBasisAmount');
    const previousSource = requireGoalBasisSource(previousGoalBasisSource, 'previousGoalBasisSource');
    const sample = collectEconomySample(entries, calculatedAt);
    const currentRepresentativeSavingAmount = sample.sampleCount > 0 ? calculateMedian(sample.amounts) : 0;
    const lowerBound = previous * 0.5;
    const upperBound = previous * 2;
    const bootstrapTransitionApplied = currentRepresentativeSavingAmount > 0
      && previousSource === GOAL_BASIS_SOURCES.ZERO_START_BOOTSTRAP;
    const goalBasisAmount = currentRepresentativeSavingAmount === 0
      ? previous
      : bootstrapTransitionApplied
        ? currentRepresentativeSavingAmount
        : Math.max(lowerBound, Math.min(currentRepresentativeSavingAmount, upperBound));
    const goalBasisSource = currentRepresentativeSavingAmount === 0
      ? previousSource
      : GOAL_BASIS_SOURCES.ROLLING_MEDIAN;
    return Object.freeze({
      previousGoalBasisAmount: previous,
      previousGoalBasisSource: previousSource,
      currentRepresentativeSavingAmount,
      lowerBound,
      upperBound,
      goalBasisAmount,
      goalBasisSource,
      bootstrapTransitionApplied,
      sampleCount: sample.sampleCount,
      lookbackMode: sample.lookbackMode || LOOKBACK_MODES.ZERO,
      calculatedAt: requireDate(calculatedAt, 'calculatedAt').toISOString()
    });
  }

  function economyInputFromMainState(mainState) {
    const entries = Array.isArray(mainState?.entries) ? mainState.entries : [];
    return { currentBalance: calculateCurrentSavingsBalance(entries), entries };
  }

  function normalizedAcquiredAt(value) {
    const date = validDate(value);
    return date ? date.toISOString() : null;
  }

  function buildInitialCatLifeState({ catId, masterCat, mainState, acquiredAt, lifeStartedAt, lifeStartReason }) {
    if (typeof catId !== 'string' || !catId || masterCat?.id !== catId) throw new TypeError('catId/masterCat mismatch');
    if (!['first_acquisition', 'legacy_activation'].includes(lifeStartReason)) throw new RangeError('invalid lifeStartReason');
    const started = requireDate(lifeStartedAt, 'lifeStartedAt');
    const economy = masterCat.economyProfile || {};
    const input = economyInputFromMainState(mainState);
    const scale = calculateEconomyScale({ ...input, calculatedAt: started });
    const initial = calculateInitialBalance({
      baseAmount: scale.baseAmount,
      initialAssetLevel: economy.initialAssetLevel,
      initialBalanceBias: economy.initialBalanceBias
    });
    const firstGoal = Array.isArray(masterCat.goals) ? masterCat.goals[0] : null;
    const stamp = started.toISOString();
    const firstGoalBasis = calculateFirstGoalBasis(scale.representativeSavingAmount);
    return {
      schemaVersion: CAT_LIFE_SCHEMA_VERSION,
      catId,
      acquiredAt: normalizedAcquiredAt(acquiredAt),
      lifeStartedAt: stamp,
      lifeStartReason,
      economyFormulaVersion: ECONOMY_FORMULA_VERSION,
      economyScaleAtAcquisition: { ...scale, ...initial },
      initialBalance: initial.initialBalance,
      currentBalance: initial.initialBalance,
      currentGoal: firstGoal ? buildGoalState({ goal: firstGoal, ...firstGoalBasis, startBalance: initial.initialBalance, startedAt: stamp }) : null,
      completedGoals: [],
      goalProgress: 0,
      totalSaved: 0,
      totalSpent: 0,
      recentEvents: [],
      eventCooldowns: {},
      lastLifeEventAt: null,
      longTermSavingMode: { active: false, startedAt: null, progressUnits: 0 },
      updatedAt: stamp
    };
  }

  function runFailureCheckpoint(failureAt, checkpoint) {
    if (failureAt === checkpoint) throw new Error(`simulated ${checkpoint} failure`);
  }

  function prepareGoalCompletion({ state, masterCat, mainState, expectedGoalId, completedAt, failureAt = null }) {
    if (!isPlainObject(state) || state.catId !== masterCat?.id) throw new TypeError('state/masterCat mismatch');
    if (typeof expectedGoalId !== 'string' || !expectedGoalId) throw new TypeError('expectedGoalId is required');
    const stamp = requireDate(completedAt, 'completedAt').toISOString();
    const completedGoals = Array.isArray(state.completedGoals) ? state.completedGoals : [];
    if (completedGoals.some(goal => goal?.goalId === expectedGoalId)) {
      return { status: 'already_completed', committed: false, state: clone(state), events: [] };
    }
    if (!isPlainObject(state.currentGoal)) return { status: 'no_current_goal', committed: false, state: clone(state), events: [] };
    if (state.currentGoal.goalId !== expectedGoalId) return { status: 'goal_mismatch', committed: false, state: clone(state), events: [] };
    if (!isGoalCompleted({ currentBalance: state.currentBalance, currentGoal: state.currentGoal })) {
      return { status: 'not_ready', committed: false, state: clone(state), events: [] };
    }

    const goals = Array.isArray(masterCat.goals) ? masterCat.goals : [];
    const goalMaster = goals.find(goal => goal.goalId === expectedGoalId);
    if (!goalMaster) throw new RangeError(`missing goal master: ${expectedGoalId}`);
    const next = clone(state);
    const spend = calculateGoalSpendAmount({
      requiredIncrease: next.currentGoal.requiredIncrease,
      spendingBehavior: goalMaster.spendingBehavior,
      currentBalance: next.currentBalance
    });
    const completionRecord = {
      goalId: next.currentGoal.goalId,
      startedAt: next.currentGoal.startedAt,
      completedAt: stamp,
      startBalance: next.currentGoal.startBalance,
      targetBalance: next.currentGoal.targetBalance,
      requiredIncrease: next.currentGoal.requiredIncrease,
      goalBasisAmount: next.currentGoal.goalBasisAmount,
      goalBasisSource: next.currentGoal.goalBasisSource,
      spendingBehavior: goalMaster.spendingBehavior,
      spentAmount: spend.spentAmount,
      goalFormulaVersion: next.currentGoal.goalFormulaVersion
    };
    next.completedGoals.push(completionRecord);
    runFailureCheckpoint(failureAt, 'completedGoals');

    next.currentBalance -= spend.spentAmount;
    next.totalSpent = safeAddMoney(requireNonNegativeInteger(next.totalSpent, 'totalSpent'), spend.spentAmount, 'totalSpent');
    requireNonNegativeInteger(next.currentBalance, 'currentBalance');
    runFailureCheckpoint(failureAt, 'currentBalance');

    const events = [{ type: 'goal_completed', catId: next.catId, goalId: expectedGoalId, occurredAt: stamp }];
    if (spend.spentAmount > 0) {
      events.push({ type: 'goal_spending', catId: next.catId, goalId: expectedGoalId, spendingBehavior: goalMaster.spendingBehavior, spentAmount: spend.spentAmount, occurredAt: stamp });
    }

    if (goalMaster.nextGoalId) {
      const nextGoalMaster = goals.find(goal => goal.goalId === goalMaster.nextGoalId);
      if (!nextGoalMaster) throw new RangeError(`missing next goal master: ${goalMaster.nextGoalId}`);
      const basis = calculateNextGoalBasis({
        previousGoalBasisAmount: next.currentGoal.goalBasisAmount,
        previousGoalBasisSource: next.currentGoal.goalBasisSource,
        entries: Array.isArray(mainState?.entries) ? mainState.entries : [],
        calculatedAt: stamp
      });
      next.currentGoal = buildGoalState({ goal: nextGoalMaster, goalBasisAmount: basis.goalBasisAmount, goalBasisSource: basis.goalBasisSource, startBalance: next.currentBalance, startedAt: stamp });
      next.longTermSavingMode = { active: false, startedAt: null, progressUnits: 0 };
      events.push({ type: 'next_goal_started', catId: next.catId, goalId: next.currentGoal.goalId, occurredAt: stamp });
      runFailureCheckpoint(failureAt, 'nextGoal');
    } else {
      next.currentGoal = null;
      next.longTermSavingMode = { active: true, startedAt: stamp, progressUnits: 0 };
      events.push({ type: 'long_term_saving_started', catId: next.catId, occurredAt: stamp });
      runFailureCheckpoint(failureAt, 'nextGoal');
    }
    next.goalProgress = 0;
    next.updatedAt = stamp;
    return { status: 'completed', committed: true, state: next, completedGoal: completionRecord, spend, events };
  }

  function validateStorage(storage) {
    if (!storage || typeof storage.get !== 'function' || typeof storage.createIfAbsent !== 'function') {
      throw new TypeError('storage must provide get() and createIfAbsent()');
    }
  }

  function validateTransactionalStorage(storage) {
    validateStorage(storage);
    if (typeof storage.transact !== 'function') throw new TypeError('storage must provide atomic transact()');
  }

  function createCatLifeStateIfAbsent({ enabled = FEATURE_FLAG.defaultEnabled, storage, catId, masterCat, collectionRecord, mainState, now, lifeStartReason }) {
    if (enabled !== true) return { status: 'disabled', created: false, state: null };
    validateStorage(storage);
    if (collectionRecord?.obtained !== true) return { status: 'not_owned', created: false, state: null };
    const existing = storage.get(catId);
    if (existing) return { status: 'exists', created: false, state: existing };
    const started = requireDate(now, 'now');
    const acquiredAt = lifeStartReason === 'first_acquisition'
      ? (normalizedAcquiredAt(collectionRecord.firstObtainedAt) || started.toISOString())
      : normalizedAcquiredAt(collectionRecord.firstObtainedAt);
    const lifeStartedAt = lifeStartReason === 'first_acquisition' ? acquiredAt : started.toISOString();
    const candidate = buildInitialCatLifeState({ catId, masterCat, mainState, acquiredAt, lifeStartedAt, lifeStartReason });
    const result = storage.createIfAbsent(catId, candidate);
    return { status: result.created ? 'created' : 'exists', created: result.created, state: result.value };
  }

  function createFirstAcquisitionCatLife(options) {
    return createCatLifeStateIfAbsent({ ...options, lifeStartReason: 'first_acquisition' });
  }

  function activateOwnedLegacyCats({ enabled = FEATURE_FLAG.defaultEnabled, storage, catWorld, collectionData, mainState, now }) {
    if (enabled !== true) return { status: 'disabled', created: [], existing: [], skippedUnowned: [] };
    validateStorage(storage);
    const created = [], existing = [], skippedUnowned = [];
    const records = isPlainObject(collectionData?.cats) ? collectionData.cats : {};
    for (const masterCat of Array.isArray(catWorld?.cats) ? catWorld.cats : []) {
      const record = records[masterCat.id];
      if (record?.obtained !== true) { skippedUnowned.push(masterCat.id); continue; }
      const result = createCatLifeStateIfAbsent({ enabled: true, storage, catId: masterCat.id, masterCat, collectionRecord: record, mainState, now, lifeStartReason: 'legacy_activation' });
      (result.created ? created : existing).push(masterCat.id);
    }
    return { status: 'ok', created, existing, skippedUnowned };
  }

  function completeGoalTransaction({ enabled = FEATURE_FLAG.defaultEnabled, storage, catId, masterCat, mainState, expectedGoalId, completedAt, failureAt = null }) {
    if (enabled !== true) return { status: 'disabled', committed: false, state: null, events: [] };
    validateTransactionalStorage(storage);
    return storage.transact(catId, state => {
      if (!state) return { commit: false, result: { status: 'missing_state', committed: false, state: null, events: [] } };
      const prepared = prepareGoalCompletion({ state, masterCat, mainState, expectedGoalId, completedAt, failureAt });
      return { commit: prepared.committed, value: prepared.state, result: prepared };
    });
  }

  function createMemoryStorage(initial = {}) {
    const map = new Map(Object.entries(isPlainObject(initial) ? initial : {}).map(([key, value]) => [key, clone(value)]));
    let failCommit = false;
    return {
      get(key) { return map.has(key) ? clone(map.get(key)) : null; },
      createIfAbsent(key, value) {
        if (map.has(key)) return { created: false, value: clone(map.get(key)) };
        map.set(key, clone(value));
        return { created: true, value: clone(value) };
      },
      transact(key, updater) {
        if (typeof updater !== 'function') throw new TypeError('updater must be a function');
        const before = map.has(key) ? clone(map.get(key)) : null;
        const transaction = updater(clone(before));
        if (!isPlainObject(transaction) || typeof transaction.commit !== 'boolean') throw new TypeError('invalid transaction result');
        if (transaction.commit) {
          if (failCommit) { failCommit = false; throw new Error('simulated storage commit failure'); }
          map.set(key, clone(transaction.value));
        }
        return clone(transaction.result);
      },
      failNextCommit() { failCommit = true; },
      snapshot() { return Object.fromEntries([...map.entries()].map(([key, value]) => [key, clone(value)])); },
      serialize() { return JSON.stringify(Object.fromEntries(map)); },
      size() { return map.size; }
    };
  }

  return Object.freeze({
    CAT_LIFE_SCHEMA_VERSION,
    ECONOMY_FORMULA_VERSION,
    GOAL_FORMULA_VERSION,
    CAT_LIFE_STORAGE_KEY,
    FEATURE_FLAG,
    LEVEL_COEFFICIENTS,
    GOAL_SCALE_MULTIPLIERS,
    GOAL_SPEND_RATES,
    GOAL_BASIS_SOURCES,
    LOOKBACK_MODES,
    DAY_MS,
    isConfirmedPositiveSavingEntry,
    calculateCurrentSavingsBalance,
    calculateMedian,
    collectEconomySample,
    calculateEconomyScale,
    roundingUnitFor,
    roundCatAmount,
    calculateInitialBalance,
    getGoalScaleMultiplier,
    getGoalSpendRate,
    calculateGoalBasisAmount,
    calculateFirstGoalBasis,
    calculateRequiredIncrease,
    buildGoalState,
    createGoalIfAbsent,
    isGoalCompleted,
    calculateGoalSpendAmount,
    calculateNextGoalBasis,
    economyInputFromMainState,
    buildInitialCatLifeState,
    prepareGoalCompletion,
    createCatLifeStateIfAbsent,
    createFirstAcquisitionCatLife,
    activateOwnedLegacyCats,
    completeGoalTransaction,
    createMemoryStorage
  });
});
