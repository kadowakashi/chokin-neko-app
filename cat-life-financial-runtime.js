(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ChokinCatLifeFinancialRuntime = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const clone = value => JSON.parse(JSON.stringify(value));
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  function create({ storage, lifeRuntime, eventRuntime, model, transactions, events, financialKey }) {
    const LIFE = lifeRuntime.key, EVENT = eventRuntime.key, FIN = financialKey;
    const rawBundle = () => Object.fromEntries([LIFE, FIN, EVENT].map(key => [key, storage.getItem(key)]));
    const parse = raw => raw === null ? null : JSON.parse(raw);
    function validLife(value) {
      const checked = lifeRuntime.validateRoot(value);
      return checked.valid || (checked.errors.length > 0 && checked.errors.every(item => item.path?.endsWith('.goalBasisAmount')));
    }
    function validateBundle(raw, context) {
      try {
        const value = { life: parse(raw[LIFE]), financial: parse(raw[FIN]), events: parse(raw[EVENT]) };
        if (!value.life || !validLife(value.life) || !events.validateState(value.events).valid) return false;
        if (value.financial && !model.validateSidecar(value.financial).valid) return false;
        if (value.financial && !model.validateProjectionLink(value.financial, value.events).valid) return false;
        if (context.phase === 'before') return true;
        const before = { life: parse(context.before[LIFE]), financial: parse(context.before[FIN]) || model.emptySidecar(), events: parse(context.before[EVENT]) };
        const records = value.financial?.records;
        if (!records || records.length !== before.financial.records.length + 1 || !same(records.slice(0, -1), before.financial.records)) return false;
        const { projection, snapshot } = records.at(-1);
        if (projection.occurrenceId !== context.occurrenceId || snapshot.occurrenceId !== context.occurrenceId) return false;
        if (before.events.history.some(item => item.occurrenceId === context.occurrenceId)) return false;
        if (before.financial.records.some(item => item.projection.occurrenceId === context.occurrenceId)) return false;
        if (before.events.lastProcessedDayKey >= projection.localDayKey || before.financial.lastSettledDayKey >= projection.localDayKey) return false;
        const expectedEvents = { ...before.events, lastProcessedDayKey: projection.localDayKey, history: [...before.events.history, projection].slice(-events.HISTORY_LIMIT) };
        if (!same(expectedEvents, value.events)) return false;
        const priorCat = before.life.cats[projection.catId], nextCat = value.life.cats[projection.catId];
        if (!priorCat || !nextCat || priorCat.currentBalance !== snapshot.balanceBefore || nextCat.currentBalance !== snapshot.balanceAfter) return false;
        if (nextCat.totalSaved !== priorCat.totalSaved + Math.max(0, snapshot.delta) || nextCat.totalSpent !== priorCat.totalSpent + Math.max(0, -snapshot.delta) + snapshot.goalSpentAmount) return false;
        const mutable = new Set(['currentBalance','totalSaved','totalSpent','updatedAt',...(snapshot.goalCompleted ? ['currentGoal','completedGoals','longTermSavingMode','goalProgress'] : [])]);
        if (!Object.keys(priorCat).every(key => mutable.has(key) || same(priorCat[key], nextCat[key]))) return false;
        if (snapshot.goalCompleted && (nextCat.completedGoals.length !== priorCat.completedGoals.length + 1 || !same(nextCat.completedGoals.slice(0,-1), priorCat.completedGoals))) return false;
        if (snapshot.delta === 0 && (!same(priorCat, nextCat) || value.life.updatedAt !== before.life.updatedAt)) return false;
        if (snapshot.delta !== 0 && (nextCat.updatedAt !== projection.occurredAt || value.life.updatedAt !== projection.occurredAt)) return false;
        if (!same(Object.keys(before.life.cats), Object.keys(value.life.cats))) return false;
        return Object.keys(before.life.cats).every(id => id === projection.catId || same(before.life.cats[id], value.life.cats[id]));
      } catch { return false; }
    }
    const journal = transactions.create({ storage, validateBundle });
    function loadFinancial() {
      try {
        if (journal.pending()) return { status: 'recovery_required', state: null };
        const raw = storage.getItem(FIN);
        if (raw === null) return { status: 'empty', state: null };
        const value = parse(raw), checked = model.validateSidecar(value);
        return checked.valid ? { status: 'ok', state: value } : { status: 'corrupted', state: null };
      } catch { return { status: 'storage_error', state: null }; }
    }
    function loadEvents() {
      const loaded = eventRuntime.loadState(), financial = loadFinancial();
      if (!['empty', 'ok'].includes(financial.status)) return { ...loaded, status: 'corrupted', financialCorrupted: true, state: null };
      if (financial.state && !model.validateProjectionLink(financial.state, loaded.state).valid) return { ...loaded, status: 'corrupted', financialCorrupted: true, state: null };
      return { ...loaded, financialState: financial.state };
    }
    // Caller owns the origin-wide exclusive lock, including OFF daily writes and recovery.
    function processDay({ enabled, timestamp, collectionData, mainState }) {
      if (journal.pending()) return { status: 'recovery_required', committed: false, event: null };
      let life = lifeRuntime.loadRoot(new Date(timestamp).toISOString());
      // A missing/invalid basis is the frozen zero-effect case, not permission to repair it.
      if (enabled && life.status === 'corrupted' && life.raw !== null) {
        try { const candidate = parse(life.raw); if (validLife(candidate)) life = { ...life, status: 'basis_unavailable', root: candidate }; } catch { /* preserve corrupt raw */ }
      }
      if (!life.root) return { status: life.status, committed: false, event: null };
      const input = { catWorld: lifeRuntime.catWorld, catLifeRoot: life.root, collectionData, timestamp };
      if (!enabled) return eventRuntime.processDaySync(input);
      const loaded = eventRuntime.loadState(), financial = loadFinancial();
      if (!['ok', 'empty'].includes(financial.status)) return { status: 'financial_safe_stop', committed: false, event: null };
      if (loaded.status === 'empty') return eventRuntime.processDaySync(input); // Bootstrap is not a financial occurrence.
      if (loaded.status !== 'ok' || !events.inspectMaster(input.catWorld).valid) return { status: 'invalid_state', committed: false, event: null };
      const ledger = financial.state || model.emptySidecar();
      if (!model.validateProjectionLink(ledger, loaded.state).valid) return { status: 'financial_safe_stop', committed: false, event: null };
      const day = events.localDayKey(timestamp);
      if (ledger.lastSettledDayKey !== null && day <= ledger.lastSettledDayKey) return { status: 'already_settled', committed: false, event: null };
      const planned = events.planDay({ ...input, state: loaded.state });
      if (!planned.changed || !planned.event) return eventRuntime.processDaySync(input);
      const before = rawBundle();
      if (before[LIFE] !== life.raw || before[EVENT] !== loaded.raw) return { status: 'conflict', committed: false, event: null };
      // Only this newly selected event can create a sidecar. Existing history is never replayed.
      const computed = model.simulateOccurrence({ catWorld: input.catWorld, catLifeRoot: life.root, occurrence: { ...planned.event, effectMode: 'financial_v1' }, appliedOccurrenceIds: ledger.records.map(item => item.projection.occurrenceId), mainState });
      if (!computed.applicationProposed) return { status: 'already_settled', committed: false, event: null };
      const next = clone(ledger);
      next.records.push({ projection: clone(planned.event), snapshot: computed.snapshot });
      next.lastSettledDayKey = planned.event.localDayKey;
      const after = { [LIFE]: JSON.stringify(computed.root), [FIN]: JSON.stringify(next), [EVENT]: JSON.stringify(planned.state) };
      const result = journal.commit({ occurrenceId: planned.event.occurrenceId, before, after });
      return { ...result, status: result.committed ? 'financial_event_created' : result.status, event: result.committed ? planned.event : null };
    }
    return Object.freeze({ key: FIN, processDay, loadFinancial, loadEvents, recover: journal.recover, pending: journal.pending, inspect: journal.inspect, validateBundle });
  }
  return Object.freeze({ create });
});
