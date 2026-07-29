(() => {
  'use strict';

  const JOURNAL_KEY = 'chokin-event-app.gachaTransaction.v1';
  const SCHEMA_VERSION = 1;
  let recoveryState = { ready: true, state: 'clean', error: null };

  const transactionError = (code, phase, key, cause = null) => {
    const error = new Error(`${phase}:${key || JOURNAL_KEY}`);
    error.code = code;
    error.phase = phase;
    error.key = key || null;
    error.cause = cause;
    return error;
  };

  function readRaw(key, phase = 'read') {
    try { return localStorage.getItem(key); }
    catch (error) { throw transactionError('read-failed', phase, key, error); }
  }

  function journalPresent() {
    try { return localStorage.getItem(JOURNAL_KEY) !== null; }
    catch { return true; }
  }

  function checkedWrite(key, raw, phase = 'write') {
    try { localStorage.setItem(key, raw); }
    catch (error) { throw transactionError('write-failed', phase, key, error); }
    const actual = readRaw(key, `${phase}-verify`);
    if (actual !== raw) throw transactionError('readback-mismatch', `${phase}-verify`, key);
  }

  function checkedRemove(key, phase = 'remove') {
    try { localStorage.removeItem(key); }
    catch (error) { throw transactionError('remove-failed', phase, key, error); }
    if (readRaw(key, `${phase}-verify`) !== null) throw transactionError('remove-readback-mismatch', `${phase}-verify`, key);
  }

  const rawEntry = raw => raw === null ? { exists: false } : { exists: true, raw };
  const validRawEntry = value => value && typeof value === 'object' && typeof value.exists === 'boolean' && (value.exists === false || typeof value.raw === 'string');

  function validateJournal(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value) || value.schemaVersion !== SCHEMA_VERSION || typeof value.transactionId !== 'string' || !value.transactionId || !['prepared', 'committed'].includes(value.status) || typeof value.createdAt !== 'string' || !Number.isFinite(Date.parse(value.createdAt)) || !value.before || typeof value.before !== 'object' || Array.isArray(value.before) || !value.after || typeof value.after !== 'object' || Array.isArray(value.after)) return false;
    const beforeKeys = Object.keys(value.before).sort(), afterKeys = Object.keys(value.after).sort();
    if (!beforeKeys.length || JSON.stringify(beforeKeys) !== JSON.stringify(afterKeys) || beforeKeys.includes(JOURNAL_KEY)) return false;
    return beforeKeys.every(key => validRawEntry(value.before[key]) && validRawEntry(value.after[key]));
  }

  function parseJournal(raw) {
    let value;
    try { value = JSON.parse(raw); }
    catch (error) { throw transactionError('journal-invalid-json', 'recover-parse', JOURNAL_KEY, error); }
    if (!validateJournal(value)) throw transactionError('journal-invalid-shape', 'recover-validate', JOURNAL_KEY);
    return value;
  }

  function writeEntry(key, entry, phase) {
    if (entry.exists) checkedWrite(key, entry.raw, phase);
    else checkedRemove(key, phase);
  }

  function restoreEntries(entries, phase = 'rollback') {
    const errors = [];
    Object.keys(entries).forEach((key) => {
      try { writeEntry(key, entries[key], phase); }
      catch (error) { errors.push({ key, code: error.code, phase: error.phase }); }
    });
    return { ok: errors.length === 0, errors };
  }

  function entriesMatch(entries, phase = 'compare') {
    try {
      return Object.entries(entries).every(([key, entry]) => readRaw(key, phase) === (entry.exists ? entry.raw : null));
    } catch { return false; }
  }

  function recoverPending() {
    let raw;
    try { raw = readRaw(JOURNAL_KEY, 'recover-journal-read'); }
    catch (error) { recoveryState = { ready: false, state: 'journal-read-failed', error: error.code }; return { ok: false, ...recoveryState }; }
    if (raw === null) { recoveryState = { ready: true, state: 'clean', error: null }; return { ok: true, ...recoveryState }; }

    let journal;
    try { journal = parseJournal(raw); }
    catch (error) { recoveryState = { ready: false, state: 'journal-corrupt', error: error.code }; return { ok: false, ...recoveryState }; }

    try {
      if (journal.status === 'prepared' || !entriesMatch(journal.after, 'recover-after-compare')) {
        const restored = restoreEntries(journal.before, 'recover-rollback');
        if (!restored.ok) {
          recoveryState = { ready: false, state: 'rollback-failed', error: restored.errors };
          return { ok: false, ...recoveryState };
        }
      }
      checkedRemove(JOURNAL_KEY, 'recover-journal-remove');
      recoveryState = { ready: true, state: journal.status === 'committed' ? 'committed-cleared' : 'prepared-rolled-back', error: null };
      return { ok: true, ...recoveryState };
    } catch (error) {
      recoveryState = { ready: false, state: 'recovery-failed', error: error.code || 'unknown' };
      return { ok: false, ...recoveryState };
    }
  }

  function ensureReady() {
    try {
      if (recoveryState.ready && readRaw(JOURNAL_KEY, 'ready-check') === null) return true;
      return recoverPending().ok;
    } catch (error) {
      recoveryState = { ready: false, state: 'journal-read-failed', error: error.code || 'unknown' };
      return false;
    }
  }

  function commit(changes, handlers = {}) {
    if (!ensureReady()) return { ok: false, phase: 'preflight', code: 'recovery-required', rollbackOk: false, journalPresent: journalPresent() };
    if (!Array.isArray(changes) || !changes.length) return { ok: false, phase: 'validate', code: 'empty-changes', rollbackOk: true, journalPresent: false };
    const keys = changes.map(change => change?.key);
    if (keys.some(key => typeof key !== 'string' || !key || key === JOURNAL_KEY) || new Set(keys).size !== keys.length || changes.some(change => typeof change.raw !== 'string')) return { ok: false, phase: 'validate', code: 'invalid-changes', rollbackOk: true, journalPresent: false };

    const createdAt = new Date().toISOString();
    const before = Object.fromEntries(keys.map(key => [key, rawEntry(readRaw(key, 'snapshot-before'))]));
    const after = Object.fromEntries(changes.map(change => [change.key, rawEntry(change.raw)]));
    const journal = {
      schemaVersion: SCHEMA_VERSION,
      transactionId: globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      status: 'prepared',
      createdAt,
      before,
      after
    };
    const preparedRaw = JSON.stringify(journal);
    let journalVerified = false;

    try {
      checkedWrite(JOURNAL_KEY, preparedRaw, 'journal-prepare');
      journalVerified = true;
      changes.forEach((change, index) => checkedWrite(change.key, change.raw, `target-${index + 1}`));
      journal.status = 'committed';
      checkedWrite(JOURNAL_KEY, JSON.stringify(journal), 'journal-commit');
      handlers.applyAfter?.();
      checkedRemove(JOURNAL_KEY, 'journal-finalize');
      recoveryState = { ready: true, state: 'committed', error: null };
      return { ok: true, transactionId: journal.transactionId, changedKeys: keys, rollbackOk: null, journalPresent: false };
    } catch (error) {
      const restored = restoreEntries(before, 'rollback');
      let callbackOk = true;
      if (restored.ok) {
        try { handlers.applyBefore?.(); }
        catch { callbackOk = false; }
      }
      let journalRemoved = false;
      if (restored.ok && callbackOk) {
        try { checkedRemove(JOURNAL_KEY, 'rollback-journal-remove'); journalRemoved = true; }
        catch { journalRemoved = false; }
      } else if (!journalVerified) {
        try { if (readRaw(JOURNAL_KEY, 'failed-prepare-check') === preparedRaw) checkedRemove(JOURNAL_KEY, 'failed-prepare-remove'); }
        catch {}
      }
      const rollbackOk = restored.ok && callbackOk && journalRemoved;
      recoveryState = rollbackOk ? { ready: true, state: 'rolled-back', error: null } : { ready: false, state: 'rollback-required', error: error.code || 'unknown' };
      return { ok: false, transactionId: journal.transactionId, changedKeys: keys, phase: error.phase || 'unknown', code: error.code || 'unknown', rollbackOk, rollbackErrors: restored.errors, journalPresent: journalPresent() };
    }
  }

  const startupRecovery = recoverPending();
  window.ChokinGachaTransaction = {
    key: JOURNAL_KEY,
    schemaVersion: SCHEMA_VERSION,
    commit,
    ensureReady,
    recoverPending,
    isReady: () => recoveryState.ready,
    getRecoveryState: () => JSON.parse(JSON.stringify(recoveryState)),
    startupRecovery
  };
})();
