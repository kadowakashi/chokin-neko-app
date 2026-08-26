(function (root, factory) {
  'use strict';
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ChokinCatLifeRuntimeLoader = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  const STORAGE_KEY = 'chokin-event-app.catLife.v1';
  const SCHEMA_VERSION = 1;
  const ECONOMY_FORMULA_VERSION = 1;
  const GOAL_FORMULA_VERSION = 1;
  const CAT_ID = /^[a-z][a-z0-9_]*$/;
  const SPENDING = new Set(['none', 'light', 'medium', 'large', 'very_large']);
  const GOAL_BASIS = new Set(['zero_start_bootstrap', 'acquisition_scale', 'rolling_median']);
  const LOOKBACK = new Set(['recent_30d', 'extended_180d', 'balance_fallback', 'zero_start']);
  const LIFE_START = new Set(['first_acquisition', 'legacy_activation']);
  const STATE_KEYS = new Set([
    'schemaVersion', 'catId', 'acquiredAt', 'lifeStartedAt', 'lifeStartReason',
    'economyFormulaVersion', 'economyScaleAtAcquisition', 'initialBalance',
    'currentBalance', 'currentGoal', 'completedGoals', 'goalProgress', 'totalSaved',
    'totalSpent', 'recentEvents', 'eventCooldowns', 'lastLifeEventAt',
    'longTermSavingMode', 'updatedAt'
  ]);
  const SCALE_KEYS = new Set([
    'currentSavingsBalance', 'representativeSavingAmount', 'effectiveBalance',
    'baseAmount', 'sampleCount', 'lookbackMode', 'calculatedAt', 'initialAssetLevel',
    'levelCoefficient', 'initialBalanceBias', 'effectiveCoefficient',
    'rawInitialBalance', 'roundingUnit', 'initialBalance'
  ]);
  const GOAL_KEYS = new Set([
    'goalId', 'goalScale', 'goalBasisAmount', 'goalBasisSource', 'startBalance',
    'requiredIncrease', 'targetBalance', 'startedAt', 'goalFormulaVersion'
  ]);
  const COMPLETED_GOAL_KEYS = new Set([
    'goalId', 'startedAt', 'completedAt', 'startBalance', 'targetBalance',
    'requiredIncrease', 'goalBasisAmount', 'goalBasisSource', 'spendingBehavior',
    'spentAmount', 'goalFormulaVersion'
  ]);
  let browserLoadPromise = null;
  let browserLoadCount = 0;
  let browserMasterLoadCount = 0;

  const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
  const object = value => !!value && typeof value === 'object' && !Array.isArray(value);
  const validDate = value => typeof value === 'string' && Number.isFinite(Date.parse(value));
  const nonNegative = value => typeof value === 'number' && Number.isFinite(value) && value >= 0;
  const nonNegativeInteger = value => Number.isSafeInteger(value) && value >= 0;
  const exactKeys = (value, keys) => object(value) && Object.keys(value).length === keys.size && Object.keys(value).every(key => keys.has(key));
  const result = (errors, isolation = null) => Object.freeze({ valid: errors.length === 0, errors, isolation });

  function validateGoalState(goal, path, errors, completed = false) {
    const keys = completed ? COMPLETED_GOAL_KEYS : GOAL_KEYS;
    if (!exactKeys(goal, keys)) { errors.push({ path, code: 'invalid_keys' }); return; }
    if (typeof goal.goalId !== 'string' || !goal.goalId) errors.push({ path: `${path}.goalId`, code: 'invalid' });
    if (!validDate(goal.startedAt)) errors.push({ path: `${path}.startedAt`, code: 'invalid' });
    if (!nonNegativeInteger(goal.startBalance) || !nonNegativeInteger(goal.targetBalance) || !nonNegativeInteger(goal.requiredIncrease)) errors.push({ path, code: 'invalid_amount' });
    if (!(typeof goal.goalBasisAmount === 'number' && Number.isFinite(goal.goalBasisAmount) && goal.goalBasisAmount > 0)) errors.push({ path: `${path}.goalBasisAmount`, code: 'invalid' });
    if (!GOAL_BASIS.has(goal.goalBasisSource)) errors.push({ path: `${path}.goalBasisSource`, code: 'invalid' });
    if (goal.goalFormulaVersion !== GOAL_FORMULA_VERSION) errors.push({ path: `${path}.goalFormulaVersion`, code: 'invalid' });
    if (completed) {
      if (!validDate(goal.completedAt)) errors.push({ path: `${path}.completedAt`, code: 'invalid' });
      if (!SPENDING.has(goal.spendingBehavior)) errors.push({ path: `${path}.spendingBehavior`, code: 'invalid' });
      if (!nonNegativeInteger(goal.spentAmount)) errors.push({ path: `${path}.spentAmount`, code: 'invalid' });
    } else if (!Number.isInteger(goal.goalScale) || goal.goalScale < 1 || goal.goalScale > 5) errors.push({ path: `${path}.goalScale`, code: 'invalid' });
  }

  function validateCatState(state, catId, path, errors) {
    if (!exactKeys(state, STATE_KEYS)) { errors.push({ path, code: 'invalid_keys' }); return; }
    if (state.schemaVersion !== SCHEMA_VERSION || state.catId !== catId || !CAT_ID.test(state.catId)) errors.push({ path, code: 'identity' });
    if (state.acquiredAt !== null && !validDate(state.acquiredAt)) errors.push({ path: `${path}.acquiredAt`, code: 'invalid' });
    if (!validDate(state.lifeStartedAt) || !validDate(state.updatedAt) || (state.lastLifeEventAt !== null && !validDate(state.lastLifeEventAt))) errors.push({ path, code: 'invalid_date' });
    if (!LIFE_START.has(state.lifeStartReason) || state.economyFormulaVersion !== ECONOMY_FORMULA_VERSION) errors.push({ path, code: 'invalid_version_or_reason' });
    if (!exactKeys(state.economyScaleAtAcquisition, SCALE_KEYS)) errors.push({ path: `${path}.economyScaleAtAcquisition`, code: 'invalid_keys' });
    else {
      const scale = state.economyScaleAtAcquisition;
      for (const key of ['currentSavingsBalance', 'representativeSavingAmount', 'effectiveBalance', 'baseAmount', 'levelCoefficient', 'initialBalanceBias', 'effectiveCoefficient', 'rawInitialBalance']) if (!nonNegative(scale[key])) errors.push({ path: `${path}.economyScaleAtAcquisition.${key}`, code: 'invalid' });
      if (!nonNegativeInteger(scale.sampleCount) || !nonNegativeInteger(scale.initialBalance) || !Number.isInteger(scale.initialAssetLevel) || scale.initialAssetLevel < 1 || scale.initialAssetLevel > 5 || ![0.3, 0.5, 0.75, 1, 1.3].includes(scale.levelCoefficient) || scale.initialBalanceBias < 0.9 || scale.initialBalanceBias > 1.1 || !(scale.effectiveCoefficient > 0) || !LOOKBACK.has(scale.lookbackMode) || !validDate(scale.calculatedAt) || ![1, 10, 100, 500, 1000, 10000].includes(scale.roundingUnit)) errors.push({ path: `${path}.economyScaleAtAcquisition`, code: 'invalid' });
    }
    for (const key of ['initialBalance', 'currentBalance', 'goalProgress', 'totalSaved', 'totalSpent']) if (!nonNegativeInteger(state[key])) errors.push({ path: `${path}.${key}`, code: 'invalid' });
    if (state.currentGoal !== null) validateGoalState(state.currentGoal, `${path}.currentGoal`, errors, false);
    if (!Array.isArray(state.completedGoals)) errors.push({ path: `${path}.completedGoals`, code: 'invalid' });
    else state.completedGoals.forEach((goal, index) => validateGoalState(goal, `${path}.completedGoals[${index}]`, errors, true));
    const completedIds = Array.isArray(state.completedGoals) ? state.completedGoals.map(goal => goal?.goalId) : [];
    if (new Set(completedIds).size !== completedIds.length || (state.currentGoal && completedIds.includes(state.currentGoal.goalId))) errors.push({ path, code: 'duplicate_goal' });
    if (!Array.isArray(state.recentEvents) || state.recentEvents.some(event => !object(event) || Object.keys(event).sort().join(',') !== 'amount,eventId,occurredAt' || typeof event.eventId !== 'string' || !validDate(event.occurredAt) || !nonNegativeInteger(event.amount))) errors.push({ path: `${path}.recentEvents`, code: 'invalid' });
    if (!object(state.eventCooldowns) || Object.values(state.eventCooldowns).some(value => !validDate(value))) errors.push({ path: `${path}.eventCooldowns`, code: 'invalid' });
    if (!object(state.longTermSavingMode) || Object.keys(state.longTermSavingMode).sort().join(',') !== 'active,progressUnits,startedAt' || typeof state.longTermSavingMode.active !== 'boolean' || !nonNegativeInteger(state.longTermSavingMode.progressUnits) || (state.longTermSavingMode.startedAt !== null && !validDate(state.longTermSavingMode.startedAt))) errors.push({ path: `${path}.longTermSavingMode`, code: 'invalid' });
  }

  function validateCatWorld(catWorld) {
    const errors = [];
    if (!object(catWorld) || catWorld.schemaVersion !== SCHEMA_VERSION || !Array.isArray(catWorld.cats) || !catWorld.cats.length) return result([{ path: '$', code: 'invalid_master_root' }]);
    const ids = new Set();
    for (const [index, cat] of catWorld.cats.entries()) {
      const path = `$.cats[${index}]`;
      if (!object(cat) || typeof cat.id !== 'string' || !CAT_ID.test(cat.id) || ids.has(cat.id)) { errors.push({ path, code: 'invalid_cat_id' }); continue; }
      ids.add(cat.id);
      const economy = cat.economyProfile;
      if (!object(economy) || !Number.isInteger(economy.initialAssetLevel) || economy.initialAssetLevel < 1 || economy.initialAssetLevel > 5 || typeof economy.initialBalanceBias !== 'number' || economy.initialBalanceBias < 0.9 || economy.initialBalanceBias > 1.1) errors.push({ path: `${path}.economyProfile`, code: 'invalid' });
      if (!Array.isArray(cat.goals) || cat.goals.length !== 3) { errors.push({ path: `${path}.goals`, code: 'invalid_count' }); continue; }
      const goalIds = new Set();
      for (const goal of cat.goals) {
        if (!object(goal) || typeof goal.goalId !== 'string' || !goal.goalId || goalIds.has(goal.goalId) || !Number.isInteger(goal.goalScale) || goal.goalScale < 1 || goal.goalScale > 5 || !SPENDING.has(goal.spendingBehavior) || !(goal.nextGoalId === null || typeof goal.nextGoalId === 'string')) errors.push({ path: `${path}.goals`, code: 'invalid_goal' });
        else goalIds.add(goal.goalId);
      }
      for (const goal of cat.goals) if (goal.nextGoalId !== null && !goalIds.has(goal.nextGoalId)) errors.push({ path: `${path}.goals`, code: 'missing_next_goal', goalId: goal.nextGoalId });
    }
    return result(errors);
  }

  function analyzeCatLifeRoot(rootValue, catWorld) {
    const masters = new Map(catWorld.cats.map(cat => [cat.id, cat]));
    const unknownCatIds = [], missingGoalReferences = [], usableCatIds = [];
    for (const [catId, state] of Object.entries(rootValue.cats)) {
      const master = masters.get(catId);
      if (!master) { unknownCatIds.push(catId); continue; }
      const goalIds = new Set(master.goals.map(goal => goal.goalId));
      const missing = [];
      if (state.currentGoal && !goalIds.has(state.currentGoal.goalId)) missing.push(state.currentGoal.goalId);
      for (const goal of state.completedGoals) if (!goalIds.has(goal.goalId)) missing.push(goal.goalId);
      if (missing.length) missingGoalReferences.push({ catId, goalIds: [...new Set(missing)] });
      else usableCatIds.push(catId);
    }
    return Object.freeze({ usableCatIds, unknownCatIds, missingGoalReferences, isolatedCatIds: [...new Set([...unknownCatIds, ...missingGoalReferences.map(item => item.catId)])] });
  }

  function validateCatLifeRoot(rootValue, catWorld) {
    const errors = [];
    const rootKeys = new Set(['schemaVersion', 'economyFormulaVersion', 'goalFormulaVersion', 'updatedAt', 'cats']);
    if (!exactKeys(rootValue, rootKeys)) return result([{ path: '$', code: 'invalid_root_keys' }]);
    if (rootValue.schemaVersion !== SCHEMA_VERSION || rootValue.economyFormulaVersion !== ECONOMY_FORMULA_VERSION || rootValue.goalFormulaVersion !== GOAL_FORMULA_VERSION || !validDate(rootValue.updatedAt) || !object(rootValue.cats)) errors.push({ path: '$', code: 'invalid_root' });
    if (object(rootValue.cats)) for (const [catId, state] of Object.entries(rootValue.cats)) {
      if (!CAT_ID.test(catId)) errors.push({ path: `$.cats.${catId}`, code: 'invalid_cat_id' });
      else validateCatState(state, catId, `$.cats.${catId}`, errors);
    }
    return result(errors, errors.length || !object(rootValue.cats) ? null : analyzeCatLifeRoot(rootValue, catWorld));
  }

  function createEmptyRoot(timestamp) {
    return { schemaVersion: SCHEMA_VERSION, economyFormulaVersion: ECONOMY_FORMULA_VERSION, goalFormulaVersion: GOAL_FORMULA_VERSION, updatedAt: timestamp, cats: {} };
  }

  function createRuntime(options = {}) {
    const catLife = options.catLife;
    const catWorld = clone(options.catWorld);
    const storage = options.storage;
    if (!catLife || typeof catLife.buildInitialCatLifeState !== 'function') throw new TypeError('catLife is required');
    if (!storage || typeof storage.getItem !== 'function' || typeof storage.setItem !== 'function') throw new TypeError('storage is required');
    const masterValidation = validateCatWorld(catWorld);
    if (!masterValidation.valid) throw new TypeError('invalid cat-world master');
    const masters = new Map(catWorld.cats.map(cat => [cat.id, cat]));

    function loadRoot(timestamp) {
      let raw;
      try { raw = storage.getItem(STORAGE_KEY); }
      catch (error) { return { status: 'storage_error', raw: null, root: null, error }; }
      if (raw === null) return { status: 'empty', raw: null, root: createEmptyRoot(timestamp) };
      let rootValue;
      try { rootValue = JSON.parse(raw); }
      catch (error) { return { status: 'corrupted', raw, root: null, error }; }
      const validation = validateCatLifeRoot(rootValue, catWorld);
      return validation.valid ? { status: 'ok', raw, root: rootValue, isolation: validation.isolation } : { status: 'corrupted', raw, root: null, errors: validation.errors };
    }

    function prepareFirstAcquisition({ catId, collectionRecord, mainState, timestamp }) {
      const stamp = new Date(timestamp).toISOString();
      if (collectionRecord?.obtained !== true) return { status: 'not_owned', included: false };
      const masterCat = masters.get(catId);
      if (!masterCat) return { status: 'unknown_master_cat', included: false };
      const loaded = loadRoot(stamp);
      if (!loaded.root) return { status: 'blocked', reason: loaded.status, included: false, errors: loaded.errors || [] };
      if (loaded.root.cats[catId]) return { status: 'exists', included: false, root: clone(loaded.root), isolation: loaded.isolation };
      try {
        const candidate = clone(loaded.root);
        candidate.cats[catId] = catLife.buildInitialCatLifeState({ catId, masterCat, mainState, acquiredAt: stamp, lifeStartedAt: stamp, lifeStartReason: 'first_acquisition' });
        candidate.updatedAt = stamp;
        const validation = validateCatLifeRoot(candidate, catWorld);
        if (!validation.valid) return { status: 'validation_failed', included: false, errors: validation.errors };
        return { status: 'prepared', included: true, key: STORAGE_KEY, raw: JSON.stringify(candidate), root: candidate, beforeRaw: loaded.raw, state: clone(candidate.cats[catId]), isolation: validation.isolation };
      } catch (error) { return { status: 'prepare_failed', included: false, error }; }
    }

    function activateLegacy({ collectionData, mainState, timestamp }) {
      const stamp = new Date(timestamp).toISOString();
      const loaded = loadRoot(stamp);
      if (!loaded.root) return { status: 'blocked', committed: false, reason: loaded.status, created: [], errors: loaded.errors || [] };
      const candidate = clone(loaded.root), created = [], existing = [], skippedUnowned = [];
      try {
        const records = object(collectionData?.cats) ? collectionData.cats : {};
        for (const masterCat of catWorld.cats) {
          const record = records[masterCat.id];
          if (record?.obtained !== true) { skippedUnowned.push(masterCat.id); continue; }
          if (candidate.cats[masterCat.id]) { existing.push(masterCat.id); continue; }
          const acquiredAt = validDate(record.firstObtainedAt) ? new Date(record.firstObtainedAt).toISOString() : null;
          candidate.cats[masterCat.id] = catLife.buildInitialCatLifeState({ catId: masterCat.id, masterCat, mainState, acquiredAt, lifeStartedAt: stamp, lifeStartReason: 'legacy_activation' });
          created.push(masterCat.id);
        }
        if (!created.length) return { status: 'unchanged', committed: false, created, existing, skippedUnowned, root: clone(loaded.root), isolation: loaded.isolation };
        candidate.updatedAt = stamp;
        const validation = validateCatLifeRoot(candidate, catWorld);
        if (!validation.valid) return { status: 'validation_failed', committed: false, created: [], existing, skippedUnowned, errors: validation.errors, root: clone(loaded.root) };
        if (storage.getItem(STORAGE_KEY) !== loaded.raw) return { status: 'concurrent_modification', committed: false, created: [], existing, skippedUnowned, root: clone(loaded.root) };
        const raw = JSON.stringify(candidate);
        storage.setItem(STORAGE_KEY, raw);
        if (storage.getItem(STORAGE_KEY) !== raw) return { status: 'write_verification_failed', committed: false, created: [], existing, skippedUnowned, root: clone(loaded.root) };
        return { status: 'committed', committed: true, created, existing, skippedUnowned, root: candidate, bytes: new TextEncoder().encode(raw).length, isolation: validation.isolation };
      } catch (error) { return { status: 'transaction_failed', committed: false, created: [], existing, skippedUnowned, error, root: clone(loaded.root) }; }
    }

    return Object.freeze({ key: STORAGE_KEY, catWorld: clone(catWorld), loadRoot, prepareFirstAcquisition, activateLegacy, validateRoot: value => validateCatLifeRoot(value, catWorld), analyzeRoot: value => analyzeCatLifeRoot(value, catWorld) });
  }

  async function load() {
    if (browserLoadPromise) return browserLoadPromise;
    browserLoadPromise = (async () => {
      browserLoadCount += 1;
      if (!root.ChokinCatLife) await import('./cat-life.js?v=1');
      if (!root.ChokinCatLife) throw new Error('cat-life.js could not be loaded');
      browserMasterLoadCount += 1;
      const response = await fetch(new URL('./assets/cats/cat-world.json?v=1', root.document?.baseURI || root.location?.href));
      if (!response.ok) throw new Error(`cat-world load failed: ${response.status}`);
      const catWorld = await response.json();
      const checked = validateCatWorld(catWorld);
      if (!checked.valid) throw new Error('cat-world validation failed');
      return createRuntime({ catLife: root.ChokinCatLife, catWorld, storage: root.localStorage });
    })().catch(error => { browserLoadPromise = null; throw error; });
    return browserLoadPromise;
  }

  return Object.freeze({ STORAGE_KEY, validateCatWorld, validateCatLifeRoot, analyzeCatLifeRoot, createEmptyRoot, createRuntime, load, diagnostics: () => ({ runtimeLoads: browserLoadCount, masterLoads: browserMasterLoadCount, loaded: !!browserLoadPromise }) });
});
