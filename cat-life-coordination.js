(function (root, factory) {
  'use strict';
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ChokinCatLifeCoordination = api.create();
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';
  const LOCK_NAME = 'chokin-cat-life-writers-v1';
  const JOURNAL_KEY = 'chokin-event-app.catLifeFinancialJournal.v1';
  const SIDECAR_KEY = 'chokin-event-app.catLifeFinancial.v1';
  const ACTIVATION_KEY = 'chokin-event-app.catLifeFinancialActivation.v1';
  const RESTORE_JOURNAL_KEY = 'chokin-event-app.catLifeRestoreJournal.v1';
  const PROGRESSION_JOURNAL_KEY = 'chokin-event-app.catLifeGoalProgressionJournal.v1';
  const PROGRESSION_KEY = 'chokin-event-app.catLifeGoalProgression.v1';
  const PROGRESSION_ACTIVATION_KEY = 'chokin-event-app.catLifeGoalProgressionActivation.v1';
  function create({ storage = root.localStorage, locks = root.navigator?.locks } = {}) {
    let owner = false;
    const pending = () => { try { return storage.getItem(JOURNAL_KEY) !== null || storage.getItem(RESTORE_JOURNAL_KEY) !== null || storage.getItem(PROGRESSION_JOURNAL_KEY) !== null; } catch { return true; } };
    const canWrite = () => owner && !pending();
    const canRead = () => { try { return !pending() && storage.getItem('chokin-event-app.gachaTransactionJournal.v2') === null && storage.getItem('chokin-event-app.gachaTransaction.v1') === null; } catch { return false; } };
    const activationEnabled = () => {
      try {
        const raw = storage.getItem(ACTIVATION_KEY);
        if (raw === null) return false;
        const value = JSON.parse(raw);
        return value?.schemaVersion !== 1 || value?.enabled !== false;
      } catch { return true; }
    };
    async function run(callback, { recovery = false, financial = false } = {}) {
      if (typeof callback !== 'function' || callback.constructor?.name === 'AsyncFunction') throw new TypeError('synchronous callback required');
      const execute = () => {
        if (owner) throw new Error('nested cat-life operation');
        if (pending() && !recovery) throw new Error('financial transaction recovery required');
        owner = true;
        try {
          // No awaits in this critical section: same-tab UI callbacks cannot observe partial writes.
          const value = callback();
          if (value && typeof value.then === 'function') throw new TypeError('async critical section is forbidden');
          return value;
        } finally { owner = false; }
      };
      if (locks?.request) return locks.request(LOCK_NAME, { mode: 'exclusive' }, execute);
      // No new financial mutation without an origin-wide lock. Legacy OFF behavior remains available.
      if (financial || pending() || storage.getItem(SIDECAR_KEY) !== null || activationEnabled() || storage.getItem(PROGRESSION_KEY) !== null || storage.getItem(PROGRESSION_ACTIVATION_KEY) !== null) throw new Error('origin-wide storage lock unavailable');
      return execute();
    }
    // Startup alone may await script loading. No application handlers exist until
    // recovery has finished; app.js loads last. Other tabs queue behind this lock.
    async function runStartup(callback) {
      const execute = async () => {
        if (owner) throw new Error('startup already running');
        owner = true;
        try { return await callback(); } finally { owner = false; }
      };
      if (locks?.request) return locks.request(LOCK_NAME, { mode: 'exclusive' }, execute);
      if (pending() || storage.getItem(SIDECAR_KEY) !== null || activationEnabled() || storage.getItem(PROGRESSION_KEY) !== null || storage.getItem(PROGRESSION_ACTIVATION_KEY) !== null) throw new Error('origin-wide startup lock unavailable');
      return execute();
    }
    return Object.freeze({ run, runStartup, pending, canWrite, canRead, isOwner: () => owner, supported: !!locks?.request, key: JOURNAL_KEY });
  }
  return Object.freeze({ create, LOCK_NAME, JOURNAL_KEY, SIDECAR_KEY, ACTIVATION_KEY, RESTORE_JOURNAL_KEY, PROGRESSION_JOURNAL_KEY, PROGRESSION_KEY, PROGRESSION_ACTIVATION_KEY });
});
