(function (root, factory) {
  'use strict';
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ChokinCatLifeEvents = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  const STORAGE_KEY = 'chokin-event-app.catLifeEvents.v1';
  const SCHEMA_VERSION = 1;
  const ENGINE_VERSION = 1;
  const HISTORY_LIMIT = 365;
  const EFFECT_MODE = 'narrative_only';
  const STATE_FIELDS = Object.freeze(['schemaVersion', 'engineVersion', 'startedAt', 'seed', 'lastProcessedDayKey', 'history']);
  const RECORD_FIELDS = Object.freeze(['occurrenceId', 'eventId', 'catId', 'occurredAt', 'localDayKey', 'spendBehavior', 'effectMode', 'engineVersion']);
  const SPEND_BEHAVIORS = new Set(['none', 'light', 'medium', 'large', 'very_large']);
  const ID_PATTERN = /^[a-z][a-z0-9_]*$/;
  const EVENT_PATTERN = /^[a-z][a-z0-9_]*\.e[1-9][0-9]*$/;
  const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
  const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
  const object = value => !!value && typeof value === 'object' && !Array.isArray(value);
  const owns = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
  const validIso = value => typeof value === 'string' && Number.isFinite(Date.parse(value));
  const exactKeys = (value, fields) => object(value) && Object.keys(value).length === fields.length && fields.every(key => owns(value, key));

  function localDayKey(value = new Date()) {
    const date = value instanceof Date ? value : new Date(value);
    if (!Number.isFinite(date.getTime())) throw new TypeError('valid local date is required');
    const pad = number => String(number).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }

  function dayNumber(dayKey) {
    if (!DAY_PATTERN.test(dayKey)) return NaN;
    const [year, month, day] = dayKey.split('-').map(Number);
    const value = Date.UTC(year, month - 1, day) / 86400000;
    const check = new Date(value * 86400000);
    return check.getUTCFullYear() === year && check.getUTCMonth() + 1 === month && check.getUTCDate() === day ? value : NaN;
  }

  function validRecord(record) {
    return exactKeys(record, RECORD_FIELDS)
      && typeof record.occurrenceId === 'string' && record.occurrenceId.length > 0
      && EVENT_PATTERN.test(record.eventId)
      && ID_PATTERN.test(record.catId)
      && validIso(record.occurredAt)
      && Number.isFinite(dayNumber(record.localDayKey))
      && SPEND_BEHAVIORS.has(record.spendBehavior)
      && record.effectMode === EFFECT_MODE
      && record.engineVersion === ENGINE_VERSION;
  }

  function validateState(value) {
    const errors = [];
    if (!exactKeys(value, STATE_FIELDS)) return { valid: false, errors: [{ code: 'invalid_root_shape' }] };
    if (value.schemaVersion !== SCHEMA_VERSION) errors.push({ code: 'invalid_schema_version' });
    if (value.engineVersion !== ENGINE_VERSION) errors.push({ code: 'invalid_engine_version' });
    if (!validIso(value.startedAt)) errors.push({ code: 'invalid_started_at' });
    if (typeof value.seed !== 'string' || !/^[0-9a-f]{32}$/.test(value.seed)) errors.push({ code: 'invalid_seed' });
    if (value.lastProcessedDayKey !== null && !Number.isFinite(dayNumber(value.lastProcessedDayKey))) errors.push({ code: 'invalid_last_day' });
    if (!Array.isArray(value.history) || value.history.length > HISTORY_LIMIT) errors.push({ code: 'invalid_history' });
    else {
      const ids = new Set();
      value.history.forEach((record, index) => {
        if (!validRecord(record)) errors.push({ code: 'invalid_record', index });
        else if (ids.has(record.occurrenceId)) errors.push({ code: 'duplicate_occurrence', index });
        else ids.add(record.occurrenceId);
      });
    }
    return { valid: errors.length === 0, errors };
  }

  function inspectRaw(raw) {
    if (raw === null) return { status: 'empty', state: null, raw: null };
    let state;
    try { state = JSON.parse(raw); }
    catch { return { status: 'corrupted', state: null, raw }; }
    const checked = validateState(state);
    return checked.valid ? { status: 'ok', state: clone(state), raw } : { status: 'corrupted', state: null, raw, errors: checked.errors };
  }

  function createSeed() {
    const cryptoApi = root?.crypto;
    if (!cryptoApi?.getRandomValues) throw new Error('secure seed generation is unavailable');
    const values = new Uint32Array(4);
    cryptoApi.getRandomValues(values);
    return [...values].map(value => value.toString(16).padStart(8, '0')).join('');
  }

  function hash32(text) {
    let hash = 2166136261;
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function eventSpendBehavior(cat, event) {
    const ordinal = typeof event?.eventId === 'string' ? event.eventId.match(/\.e(\d+)$/)?.[1] : null;
    const goalId = ordinal ? `${cat?.id}.g${ordinal}` : null;
    const behavior = goalId && Array.isArray(cat?.goals)
      ? cat.goals.find(goal => goal?.goalId === goalId)?.spendingBehavior
      : null;
    return SPEND_BEHAVIORS.has(behavior) ? behavior : null;
  }

  function validMasterEvent(cat, event) {
    return object(event)
      && EVENT_PATTERN.test(event.eventId)
      && event.eventId.startsWith(`${cat.id}.e`)
      && typeof event.title === 'string' && event.title.length > 0
      && typeof event.narrative === 'string' && event.narrative.length > 0
      && Number.isFinite(event.weight) && event.weight > 0
      && Number.isInteger(event.cooldownDays) && event.cooldownDays >= 0
      && Array.isArray(event.requiredCats) && event.requiredCats.every(id => ID_PATTERN.test(id))
      && ['any', 'spring', 'summer', 'autumn', 'winter'].includes(event.seasonCondition)
      && eventSpendBehavior(cat, event) !== null;
  }

  function inspectMaster(catWorld) {
    const cats = Array.isArray(catWorld?.cats) ? catWorld.cats : [];
    const catIds = new Set(cats.map(cat => cat?.id).filter(id => ID_PATTERN.test(id)));
    const events = [];
    const errors = [];
    const eventIds = new Set();
    cats.forEach(cat => {
      if (!ID_PATTERN.test(cat?.id)) { errors.push({ code: 'invalid_cat_id', catId: cat?.id ?? null }); return; }
      if (!Array.isArray(cat.lifeEvents)) { errors.push({ code: 'missing_life_events', catId: cat.id }); return; }
      cat.lifeEvents.forEach(event => {
        if (!validMasterEvent(cat, event)) errors.push({ code: 'invalid_event', catId: cat.id, eventId: event?.eventId ?? null });
        if (eventIds.has(event?.eventId)) errors.push({ code: 'duplicate_event_id', eventId: event?.eventId });
        eventIds.add(event?.eventId);
        (event?.requiredCats || []).filter(id => !catIds.has(id)).forEach(id => errors.push({ code: 'unknown_required_cat', eventId: event?.eventId, catId: id }));
        events.push({ catId: cat.id, eventId: event?.eventId, spendBehavior: eventSpendBehavior(cat, event) });
      });
    });
    return { valid: errors.length === 0, catCount: cats.length, eventCount: events.length, events, errors };
  }

  function activeCats(catWorld, catLifeRoot, collectionData) {
    if (catLifeRoot?.schemaVersion !== 1
      || !Number.isInteger(catLifeRoot?.economyFormulaVersion)
      || !Number.isInteger(catLifeRoot?.goalFormulaVersion)
      || !object(catLifeRoot?.cats)
      || !object(collectionData?.cats)) return [];
    return (Array.isArray(catWorld?.cats) ? catWorld.cats : []).filter(cat => {
      const state = catLifeRoot.cats[cat?.id], goalIds = new Set((cat?.goals || []).map(goal => goal.goalId));
      const missingCurrentGoal = object(state?.currentGoal) && !goalIds.has(state.currentGoal.goalId);
      const missingCompletedGoal = Array.isArray(state?.completedGoals) && state.completedGoals.some(goal => !goalIds.has(goal?.goalId));
      return ID_PATTERN.test(cat?.id)
        && collectionData.cats[cat.id]?.obtained === true
        && object(state)
        && state.catId === cat.id
        && !missingCurrentGoal
        && !missingCompletedGoal;
    });
  }

  function seasonFor(month) {
    if ([3, 4, 5].includes(month)) return 'spring';
    if ([6, 7, 8].includes(month)) return 'summer';
    if ([9, 10, 11].includes(month)) return 'autumn';
    return 'winter';
  }

  function deterministicOrder(items, seed, scope, idOf) {
    return [...items].sort((left, right) => {
      const leftHash = hash32(`${seed}|${scope}|${idOf(left)}`), rightHash = hash32(`${seed}|${scope}|${idOf(right)}`);
      return leftHash - rightHash || idOf(left).localeCompare(idOf(right), 'en');
    });
  }

  function selectCat(cats, history, seed, dayKey) {
    const latest = new Map();
    history.forEach(record => latest.set(record.catId, Math.max(latest.get(record.catId) ?? -Infinity, dayNumber(record.localDayKey))));
    const oldest = Math.min(...cats.map(cat => latest.get(cat.id) ?? -Infinity));
    return deterministicOrder(cats.filter(cat => (latest.get(cat.id) ?? -Infinity) === oldest), seed, `cat|${dayKey}`, cat => cat.id)[0] || null;
  }

  function eventEligible(event, activeIds, history, dayKey, month) {
    if (!event.requiredCats.every(id => activeIds.has(id))) return false;
    const season = seasonFor(month);
    if (event.seasonCondition !== 'any' && event.seasonCondition !== season) return false;
    const previous = [...history].reverse().find(record => record.eventId === event.eventId);
    return !previous || dayNumber(dayKey) - dayNumber(previous.localDayKey) >= event.cooldownDays;
  }

  function selectEvent(cat, activeIds, history, seed, dayKey, month) {
    let candidates = cat.lifeEvents.filter(event => validMasterEvent(cat, event) && eventEligible(event, activeIds, history, dayKey, month));
    const lastForCat = [...history].reverse().find(record => record.catId === cat.id);
    const alternatives = candidates.filter(event => event.eventId !== lastForCat?.eventId);
    if (alternatives.length) candidates = alternatives;
    if (!candidates.length) return null;
    const ordered = deterministicOrder(candidates, seed, `event-order|${dayKey}|${cat.id}`, event => event.eventId);
    const total = ordered.reduce((sum, event) => sum + event.weight, 0);
    let cursor = hash32(`${seed}|event-pick|${dayKey}|${cat.id}`) % total;
    for (const event of ordered) {
      if (cursor < event.weight) return event;
      cursor -= event.weight;
    }
    return ordered[0];
  }

  function buildRecord(cat, event, timestamp, dayKey) {
    return {
      occurrenceId: `v${ENGINE_VERSION}:${dayKey}:${cat.id}:${event.eventId}`,
      eventId: event.eventId,
      catId: cat.id,
      occurredAt: new Date(timestamp).toISOString(),
      localDayKey: dayKey,
      spendBehavior: eventSpendBehavior(cat, event),
      effectMode: EFFECT_MODE,
      engineVersion: ENGINE_VERSION
    };
  }

  function createInitialState(timestamp, dayKey, seed) {
    return { schemaVersion: SCHEMA_VERSION, engineVersion: ENGINE_VERSION, startedAt: new Date(timestamp).toISOString(), seed, lastProcessedDayKey: dayKey, history: [] };
  }

  function planDay({ state, catWorld, catLifeRoot, collectionData, timestamp }) {
    const date = timestamp instanceof Date ? timestamp : new Date(timestamp);
    const dayKey = localDayKey(date);
    const cats = activeCats(catWorld, catLifeRoot, collectionData);
    if (!cats.length) return { status: 'not_started', changed: false, state, event: null };
    if (state.lastProcessedDayKey >= dayKey) return { status: state.lastProcessedDayKey === dayKey ? 'same_day' : 'clock_backward', changed: false, state, event: null };
    const cat = selectCat(cats, state.history, state.seed, dayKey);
    const activeIds = new Set(cats.map(item => item.id));
    const event = cat ? selectEvent(cat, activeIds, state.history, state.seed, dayKey, date.getMonth() + 1) : null;
    const next = clone(state);
    next.lastProcessedDayKey = dayKey;
    if (!event) return { status: 'no_event', changed: true, state: next, event: null };
    const record = buildRecord(cat, event, date, dayKey);
    if (!next.history.some(item => item.occurrenceId === record.occurrenceId)) next.history = [...next.history, record].slice(-HISTORY_LIMIT);
    return { status: 'event_created', changed: true, state: next, event: record };
  }

  function createRuntime(options = {}) {
    const storage = options.storage || root?.localStorage;
    const seedFactory = options.createSeed || createSeed;
    if (!storage?.getItem || !storage?.setItem || !storage?.removeItem) throw new TypeError('storage is required');
    let inFlight = null;

    function loadState() {
      if (root.ChokinCatLifeCoordination?.canRead() === false) return { status: 'recovery_required', state: null, raw: null };
      let raw;
      try { raw = storage.getItem(STORAGE_KEY); }
      catch (error) { return { status: 'storage_error', state: null, raw: null, error }; }
      return inspectRaw(raw);
    }

    function saveAtomic(beforeRaw, nextState) {
      const checked = validateState(nextState);
      if (!checked.valid) return { ok: false, rollbackOk: true, error: new Error('invalid event state') };
      const nextRaw = JSON.stringify(nextState);
      try {
        if (storage.getItem(STORAGE_KEY) !== beforeRaw) return { ok: false, rollbackOk: true, conflict: true };
        storage.setItem(STORAGE_KEY, nextRaw);
        if (storage.getItem(STORAGE_KEY) !== nextRaw) throw new Error('event state verification failed');
        return { ok: true, rollbackOk: true, raw: nextRaw };
      } catch (error) {
        let rollbackOk = false;
        try {
          if (beforeRaw === null) storage.removeItem(STORAGE_KEY); else storage.setItem(STORAGE_KEY, beforeRaw);
          rollbackOk = storage.getItem(STORAGE_KEY) === beforeRaw;
        } catch { rollbackOk = false; }
        return { ok: false, rollbackOk, error };
      }
    }

    function processDaySync(input) {
        if (root.ChokinCatLifeCoordination?.canWrite() === false) return { status: 'coordination_required', committed: false, event: null };
        const timestamp = input?.timestamp ?? new Date();
        const date = timestamp instanceof Date ? timestamp : new Date(timestamp);
        if (!Number.isFinite(date.getTime())) return { status: 'invalid_timestamp', committed: false, event: null };
        const master = inspectMaster(input?.catWorld);
        if (!master.valid) return { status: 'invalid_master', committed: false, event: null, errors: master.errors };
        const cats = activeCats(input.catWorld, input.catLifeRoot, input.collectionData);
        if (!cats.length) return { status: 'not_started', committed: false, event: null };
        const loaded = loadState();
        if (loaded.status !== 'ok' && loaded.status !== 'empty') return { status: loaded.status, committed: false, event: null, errors: loaded.errors, error: loaded.error };
        const dayKey = localDayKey(date);
        if (loaded.status === 'empty') {
          let seed;
          try { seed = seedFactory(); } catch (error) { return { status: 'seed_error', committed: false, event: null, error }; }
          const state = createInitialState(date, dayKey, seed);
          const saved = saveAtomic(null, state);
          return saved.ok ? { status: 'bootstrapped', committed: true, event: null, state: clone(state) } : { status: saved.conflict ? 'conflict' : 'save_failed', committed: false, event: null, rollbackOk: saved.rollbackOk, error: saved.error };
        }
        const planned = planDay({ state: loaded.state, catWorld: input.catWorld, catLifeRoot: input.catLifeRoot, collectionData: input.collectionData, timestamp: date });
        if (!planned.changed) return { status: planned.status, committed: false, event: null, state: clone(loaded.state) };
        const saved = saveAtomic(loaded.raw, planned.state);
        return saved.ok ? { status: planned.status, committed: true, event: clone(planned.event), state: clone(planned.state) } : { status: saved.conflict ? 'conflict' : 'save_failed', committed: false, event: null, rollbackOk: saved.rollbackOk, error: saved.error };
    }

    async function processDay(input) {
      if (inFlight) return inFlight;
      inFlight = Promise.resolve().then(() => processDaySync(input)).finally(() => { inFlight = null; });
      return inFlight;
    }

    return Object.freeze({ key: STORAGE_KEY, loadState, processDay, processDaySync });
  }

  return Object.freeze({
    STORAGE_KEY, SCHEMA_VERSION, ENGINE_VERSION, HISTORY_LIMIT, EFFECT_MODE, SPEND_BEHAVIORS,
    localDayKey, dayNumber, validateState, inspectRaw, inspectMaster, eventSpendBehavior,
    activeCats, selectCat, selectEvent, buildRecord, createInitialState, planDay, createRuntime
  });
});
