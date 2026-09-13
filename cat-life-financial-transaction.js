(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ChokinCatLifeFinancialTransaction = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const JOURNAL_KEY = 'chokin-event-app.catLifeFinancialJournal.v1';
  const RESTORE_JOURNAL_KEY = 'chokin-event-app.catLifeRestoreJournal.v1';
  const TARGET_KEYS = Object.freeze([
    'chokin-event-app.catLife.v1',
    'chokin-event-app.catLifeFinancial.v1',
    'chokin-event-app.catLifeEvents.v1'
  ]);
  const LEGACY_RESTORE_TARGET_KEYS = Object.freeze([
    'chokin-event-app.v0.1',
    'chokin-event-app.catCollection.v1',
    'chokin-event-app.catCoins.v1',
    'chokin-event-app.savingsGoal.v1',
    'chokin-event-app.goalHistory.v1',
    'chokin-event-app.badgeState.v1',
    'chokin-event-app.dailyNotes.v1',
    'chokin-event-app.catLife.v1',
    'chokin-event-app.catLifeFinancial.v1',
    'chokin-event-app.catLifeEvents.v1'
  ]);
  const RESTORE_TARGET_KEYS = Object.freeze([
    ...LEGACY_RESTORE_TARGET_KEYS,
    'chokin-event-app.catLifeFinancialActivation.v1'
  ]);
  const JOURNAL_FIELDS = ['journalVersion', 'state', 'occurrenceId', 'before', 'after', 'checksum'];
  const isObject = value => !!value && typeof value === 'object' && !Array.isArray(value);
  const exactKeys = (value, keys) => isObject(value) && Object.keys(value).length === keys.length && keys.every(key => Object.prototype.hasOwnProperty.call(value, key));
  const validId = value => typeof value === 'string' && value.length > 0 && value.length <= 256 && /^[a-zA-Z0-9_.:-]+$/.test(value);
  const result = (status, extra = {}) => Object.assign({ ok: false, status, committed: null, recovered: false, pending: true, safeStop: true }, extra);

  // SHA-256 is used only as a corruption checksum, not as authentication. Keeping
  // it synchronous avoids yielding the writer lock between journal operations.
  function journalChecksum(value, targetKeys) {
    const copy = raw => Object.fromEntries(targetKeys.map(key => [key, raw[key]]));
    const input = new TextEncoder().encode(JSON.stringify({ journalVersion: value.journalVersion, state: value.state, occurrenceId: value.occurrenceId, before: copy(value.before), after: copy(value.after) }));
    const constants = [0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
    const hash = [0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19];
    const bytes = new Uint8Array(Math.ceil((input.length + 9) / 64) * 64);
    bytes.set(input); bytes[input.length] = 0x80;
    const view = new DataView(bytes.buffer);
    view.setUint32(bytes.length - 8, Math.floor(input.length / 0x20000000));
    view.setUint32(bytes.length - 4, (input.length * 8) >>> 0);
    const rotate = (n, bits) => (n >>> bits) | (n << (32 - bits));
    const words = new Uint32Array(64);
    for (let offset = 0; offset < bytes.length; offset += 64) {
      for (let i = 0; i < 16; i += 1) words[i] = view.getUint32(offset + i * 4);
      for (let i = 16; i < 64; i += 1) {
        const x = words[i - 15], y = words[i - 2];
        words[i] = (words[i - 16] + (rotate(x, 7) ^ rotate(x, 18) ^ (x >>> 3)) + words[i - 7] + (rotate(y, 17) ^ rotate(y, 19) ^ (y >>> 10))) >>> 0;
      }
      let [a,b,c,d,e,f,g,h] = hash;
      for (let i = 0; i < 64; i += 1) {
        const first = (h + (rotate(e, 6) ^ rotate(e, 11) ^ rotate(e, 25)) + ((e & f) ^ (~e & g)) + constants[i] + words[i]) >>> 0;
        const second = ((rotate(a, 2) ^ rotate(a, 13) ^ rotate(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) >>> 0;
        h = g; g = f; f = e; e = (d + first) >>> 0; d = c; c = b; b = a; a = (first + second) >>> 0;
      }
      [a,b,c,d,e,f,g,h].forEach((part, i) => { hash[i] = (hash[i] + part) >>> 0; });
    }
    return hash.map(part => part.toString(16).padStart(8, '0')).join('');
  }

  /**
   * Low-level synchronous transaction. The caller MUST hold the shared exclusive
   * state-writer lock for the complete commit/recover call. It must also block
   * related reads/writers while pending() is true. No asynchronous callback may
   * run inside validateBundle. This module deliberately does not acquire locks.
   *
   * validateBundle(rawMap, context) must return exactly true for a valid bundle;
   * context contains phase, occurrenceId, before and after. Besides each schema,
   * it must verify the authoritative occurrence, compatible projection, balance
   * and goal transition, and reject a newly applied duplicate occurrence.
   * Existing narrative-only records are not financial input.
   */
  function createCore({ storage, validateBundle } = {}, config) {
    const JOURNAL_KEY = config.journalKey, TARGET_KEYS = config.targetKeys;
    const otherJournalKey = config.otherJournalKey;
    const copyMap = value => Object.fromEntries(TARGET_KEYS.map(key => [key, value[key]]));
    const validMap = (value, nullable) => exactKeys(value, TARGET_KEYS) && TARGET_KEYS.every(key => typeof value[key] === 'string' || (nullable && value[key] === null));
    const checksum = value => journalChecksum(value, TARGET_KEYS);
    if (!storage || typeof storage.getItem !== 'function' || typeof storage.setItem !== 'function' || typeof storage.removeItem !== 'function') throw new TypeError('Financial transaction requires storage.');
    if (typeof validateBundle !== 'function') throw new TypeError('Financial transaction requires a bundle validator.');

    function validated(record) {
      if (!exactKeys(record, JOURNAL_FIELDS) || record.journalVersion !== 1 || !['prepared', 'committed'].includes(record.state) || !validId(record.occurrenceId) || !validMap(record.before, true) || !validMap(record.after, config.nullableAfter) || record.checksum !== checksum(record)) return false;
      const before = Object.freeze(copyMap(record.before));
      const after = Object.freeze(copyMap(record.after));
      if (!config.allowUnchanged && TARGET_KEYS.every(key => before[key] === after[key])) return false;
      try {
        return validateBundle(before, Object.freeze({ phase: 'before', occurrenceId: record.occurrenceId, before, after })) === true
          && validateBundle(after, Object.freeze({ phase: 'after', occurrenceId: record.occurrenceId, before, after })) === true;
      } catch (_) { return false; }
    }

    function readJournal() {
      const raw = storage.getItem(JOURNAL_KEY);
      if (raw === null) return { raw, record: null };
      let record;
      try { record = JSON.parse(raw); } catch (_) { return { raw, record: null, invalid: true }; }
      return validated(record) ? { raw, record } : { raw, record: null, invalid: true };
    }

    function readTargets() { return Object.fromEntries(TARGET_KEYS.map(key => [key, storage.getItem(key)])); }
    function matches(actual, expected) { return TARGET_KEYS.every(key => actual[key] === expected[key]); }
    function known(actual, record) { return TARGET_KEYS.every(key => actual[key] === record.before[key] || actual[key] === record.after[key]); }
    function writeChecked(key, raw) {
      if (raw === null) storage.removeItem(key);
      else storage.setItem(key, raw);
      if (storage.getItem(key) !== raw) throw new Error('Financial storage readback mismatch.');
    }
    function journalMatches(raw) {
      if (storage.getItem(JOURNAL_KEY) !== raw) throw new Error('Financial journal changed.');
    }
    function cleanup(raw) {
      journalMatches(raw);
      storage.removeItem(JOURNAL_KEY);
      if (storage.getItem(JOURNAL_KEY) !== null) throw new Error('Financial journal cleanup pending.');
    }
    function pending() {
      try { return storage.getItem(JOURNAL_KEY) !== null || storage.getItem(otherJournalKey) !== null; } catch (_) { return true; }
    }
    function inspect() {
      try {
        const journal = readJournal();
        if (journal.raw === null) return result('clean', { ok: true, committed: false, pending: false, safeStop: false });
        if (journal.invalid) return result('invalid_journal');
        if (storage.getItem(otherJournalKey) !== null) return result('competing_journals');
        const actual = readTargets();
        if (!known(actual, journal.record)) return result('foreign_state');
        if (journal.record.state === 'committed' && !matches(actual, journal.record.after)) return result('committed_state_mismatch');
        return result(journal.record.state, { committed: journal.record.state === 'committed', occurrenceId: journal.record.occurrenceId });
      } catch (_) { return result('storage_unavailable'); }
    }

    function recover() {
      let journal;
      let committed = null;
      let cleanupOnly = false;
      try {
        journal = readJournal();
        if (journal.raw === null) return result('clean', { ok: true, committed: false, pending: false, safeStop: false });
        if (journal.invalid) return result('invalid_journal');
        if (storage.getItem(otherJournalKey) !== null) return result('competing_journals');
        const record = journal.record;
        committed = record.state === 'committed';
        const actual = readTargets();
        if (!known(actual, record)) return result('foreign_state', { committed });
        if (committed) {
          if (!matches(actual, record.after)) return result('committed_state_mismatch', { committed: true });
          // A durable committed marker is irreversible, including cleanup errors.
          cleanupOnly = true;
          cleanup(journal.raw);
          return result('committed_recovered', { ok: true, committed: true, recovered: true, pending: false, safeStop: false });
        }
        // Roll back a prepared transaction in reverse target order. A crash here
        // leaves another known before/after mixture and the same journal.
        for (const key of [...TARGET_KEYS].reverse()) {
          journalMatches(journal.raw);
          const current = storage.getItem(key);
          if (current !== record.before[key] && current !== record.after[key]) return result('foreign_state', { committed: false });
          if (current !== record.before[key]) writeChecked(key, record.before[key]);
        }
        if (!matches(readTargets(), record.before)) return result('rollback_readback_mismatch', { committed: false });
        cleanup(journal.raw);
        return result('rolled_back', { ok: true, committed: false, recovered: true, pending: false, safeStop: false });
      } catch (_) {
        return cleanupOnly
          ? result('cleanup_pending', { ok: true, committed: true })
          : result('recovery_required', { committed });
      }
    }

    function commit({ occurrenceId, before, after } = {}) {
      let committed = false;
      try {
        if (storage.getItem(JOURNAL_KEY) !== null || storage.getItem(otherJournalKey) !== null) return result('pending_transaction');
        if (!validId(occurrenceId) || !validMap(before, true) || !validMap(after, config.nullableAfter)) return result('invalid_bundle', { committed: false, pending: false });
        // Freeze the caller's intended bytes into private maps before validation.
        const record = { journalVersion: 1, state: 'prepared', occurrenceId, before: copyMap(before), after: copyMap(after) };
        record.checksum = checksum(record);
        if (!validated(record)) return result('invalid_bundle', { committed: false, pending: false });
        if (!matches(readTargets(), record.before)) return result('stale_before', { committed: false, pending: false });
        const preparedRaw = JSON.stringify(record);
        writeChecked(JOURNAL_KEY, preparedRaw);
        for (const key of TARGET_KEYS) {
          journalMatches(preparedRaw);
          // This is an additional stale/foreign-state guard, not a lock substitute.
          if (storage.getItem(key) !== record.before[key]) return result('foreign_state', { committed: false });
          writeChecked(key, record.after[key]);
        }
        if (!matches(readTargets(), record.after)) return result('commit_readback_mismatch', { committed: false });
        journalMatches(preparedRaw);
        record.state = 'committed';
        record.checksum = checksum(record);
        const committedRaw = JSON.stringify(record);
        // Even if this setItem succeeds and its readback throws, recovery reads
        // the persisted marker and performs cleanup only, never rollback.
        writeChecked(JOURNAL_KEY, committedRaw);
        committed = true;
        cleanup(committedRaw);
        return result('committed', { ok: true, committed: true, pending: false, safeStop: false });
      } catch (_) {
        return committed
          ? result('cleanup_pending', { ok: true, committed: true })
          : result('recovery_required');
      }
    }

    return Object.freeze({ commit, recover, pending, inspect });
  }

  function create(options) {
    return createCore(options, { journalKey: JOURNAL_KEY, otherJournalKey: RESTORE_JOURNAL_KEY, targetKeys: TARGET_KEYS, nullableAfter: false, allowUnchanged: false });
  }
  // Restore is explicit user replacement, not automatic repair. The caller's
  // validator must fully validate AFTER; BEFORE may contain malformed raw data.
  // Only an exclusive owner may call this API. Startup recovers restore before
  // starting ordinary modules/writers. Recovery never emits journal raw content.
  function createRestore(options) {
    const current = createCore(options, { journalKey: RESTORE_JOURNAL_KEY, otherJournalKey: JOURNAL_KEY, targetKeys: RESTORE_TARGET_KEYS, nullableAfter: true, allowUnchanged: true });
    const activationKey = RESTORE_TARGET_KEYS.at(-1);
    const legacy = createCore({
      ...options,
      validateBundle(raw, context) {
        return options.validateBundle({ ...raw, [activationKey]: null }, context);
      }
    }, { journalKey: RESTORE_JOURNAL_KEY, otherJournalKey: JOURNAL_KEY, targetKeys: LEGACY_RESTORE_TARGET_KEYS, nullableAfter: true, allowUnchanged: true });
    function legacyJournalPresent() {
      try {
        const raw = options.storage.getItem(RESTORE_JOURNAL_KEY);
        if (raw === null) return false;
        const value = JSON.parse(raw);
        return exactKeys(value?.before, LEGACY_RESTORE_TARGET_KEYS) && exactKeys(value?.after, LEGACY_RESTORE_TARGET_KEYS);
      } catch (_) { return false; }
    }
    return Object.freeze({
      commit: current.commit,
      recover: () => (legacyJournalPresent() ? legacy : current).recover(),
      inspect: () => (legacyJournalPresent() ? legacy : current).inspect(),
      pending: current.pending
    });
  }

  return Object.freeze({ JOURNAL_KEY, TARGET_KEYS, RESTORE_JOURNAL_KEY, LEGACY_RESTORE_TARGET_KEYS, RESTORE_TARGET_KEYS, create, createRestore });
});
