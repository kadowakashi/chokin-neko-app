(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ChokinCatLifeRestore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const KEYS = Object.freeze({main:'chokin-event-app.v0.1',collection:'chokin-event-app.catCollection.v1',coins:'chokin-event-app.catCoins.v1',goal:'chokin-event-app.savingsGoal.v1',history:'chokin-event-app.goalHistory.v1',badges:'chokin-event-app.badgeState.v1',notes:'chokin-event-app.dailyNotes.v1',life:'chokin-event-app.catLife.v1',financial:'chokin-event-app.catLifeFinancial.v1',events:'chokin-event-app.catLifeEvents.v1',activation:'chokin-event-app.catLifeFinancialActivation.v1'});
  function create({ storage, lifeRuntime, events, model, transactions, activation }) {
    const parse = raw => raw === null ? null : JSON.parse(raw);
    function validateBundle(raw, { phase }) {
      // Before may be corrupt: explicit user restore is not automatic repair.
      if (phase === 'before') return true;
      try {
        const values = Object.fromEntries(Object.entries(KEYS).map(([field,key]) => [field,parse(raw[key])]));
        if (!values.main || !Array.isArray(values.main.entries) || !values.collection?.cats || !values.coins || !Number.isSafeInteger(values.coins.balance) || values.coins.balance < 0) return false;
        if (!lifeRuntime.validateRoot(values.life).valid) return false;
        if (values.events !== null && !events.validateState(values.events).valid) return false;
        if (values.financial !== null && !model.validateProjectionLink(values.financial,values.events).valid) return false;
        if (values.activation !== null && !activation.validateState(values.activation).valid) return false;
        return true;
      } catch { return false; }
    }
    const journal = transactions.createRestore({storage,validateBundle});
    function commitCandidate(candidate) {
      if (candidate?.backup?.backupVersion !== 2 || candidate.restorable !== true) return {ok:false,committed:false,status:'invalid_restore_candidate'};
      const checked=candidate.inspections;
      if (!checked.catLife?.valid || (candidate.has.catLifeEvents && !checked.catLifeEvents?.valid) || (candidate.has.catLifeFinancial && !checked.catLifeFinancial?.valid)) return {ok:false,committed:false,status:'invalid_restore_candidate'};
      const values={main:candidate.mainState,collection:checked.collection.data,coins:checked.coins.data,goal:checked.goal.data,history:checked.history.data,badges:checked.badges.data,notes:checked.dailyNotes.data,life:checked.catLife.root,events:candidate.has.catLifeEvents?checked.catLifeEvents.state:null,financial:candidate.has.catLifeFinancial?checked.catLifeFinancial.state:null,activation:candidate.has.catLifeFinancialActivation?checked.catLifeFinancialActivation.state:null};
      const before=Object.fromEntries(Object.values(KEYS).map(key=>[key,storage.getItem(key)]));
      const after=Object.fromEntries(Object.entries(KEYS).map(([field,key])=>[key,values[field]==null?null:JSON.stringify(values[field])]));
      return journal.commit({occurrenceId:`restore:${Date.now()}`,before,after});
    }
    return Object.freeze({commitCandidate,recover:journal.recover,pending:journal.pending,inspect:journal.inspect,validateBundle});
  }
  return Object.freeze({KEYS,create});
});
