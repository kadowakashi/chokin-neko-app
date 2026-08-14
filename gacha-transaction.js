(() => {
  'use strict';

  const LEGACY_JOURNAL_KEY = 'chokin-event-app.gachaTransaction.v1';
  const JOURNAL_KEY = 'chokin-event-app.gachaTransactionJournal.v2';
  const FINGERPRINT_KEY = 'chokin-event-app.gachaTransactionFingerprints.v1';
  const JOURNAL_VERSION = 2;
  const FINGERPRINT_VERSION = 1;
  const FINGERPRINT_LIMIT = 100;
  const FINGERPRINT_RETENTION_DAYS = 180;
  const RECOVERY_ATTEMPT_LIMIT = 3;
  const FEATURE_FLAGS = Object.freeze({ catLife: false });
  const BUSINESS_KEYS = new Set([
    'chokin-event-app.gachaRecent.v1',
    'chokin-event-app.catCollection.v1',
    'chokin-event-app.catCoins.v1'
  ]);
  const STATES = new Set(['prepared', 'committing', 'committed', 'rolling_back', 'recovery_required', 'recovered', 'failed_safe']);
  let recoveryState = { ready: true, state: 'unchecked', error: null, recoveryAttempts: 0 };
  let idSequence = 0;

  const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
  const isObject = value => !!value && typeof value === 'object' && !Array.isArray(value);
  const validDate = value => typeof value === 'string' && Number.isFinite(Date.parse(value));
  const rawEntry = raw => raw === null ? { exists: false } : { exists: true, raw };
  const rawValue = entry => entry.exists ? entry.raw : null;
  const canonical = value => JSON.stringify(Object.keys(value).sort().reduce((out, key) => { out[key] = value[key]; return out; }, {}));
  const setRecoveryState = (ready, state, error = null, recoveryAttempts = 0) => {
    recoveryState = { ready, state, error, recoveryAttempts };
    return clone(recoveryState);
  };

  function transactionError(code, phase, key, cause = null) {
    const error = new Error(`${phase}:${key || JOURNAL_KEY}`);
    error.code = code;
    error.phase = phase;
    error.key = key || null;
    error.cause = cause;
    return error;
  }

  function readRaw(key, phase = 'read') {
    try { return localStorage.getItem(key); }
    catch (error) { throw transactionError('read-failed', phase, key, error); }
  }

  function checkedWrite(key, raw, phase = 'write') {
    try { localStorage.setItem(key, raw); }
    catch (error) { throw transactionError('write-failed', phase, key, error); }
    if (readRaw(key, `${phase}-verify`) !== raw) throw transactionError('readback-mismatch', `${phase}-verify`, key);
  }

  function checkedRemove(key, phase = 'remove') {
    try { localStorage.removeItem(key); }
    catch (error) { throw transactionError('remove-failed', phase, key, error); }
    if (readRaw(key, `${phase}-verify`) !== null) throw transactionError('remove-readback-mismatch', `${phase}-verify`, key);
  }

  function createTransactionId() {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
    if (globalThis.crypto?.getRandomValues) {
      const values = globalThis.crypto.getRandomValues(new Uint32Array(4));
      return `gacha-${Date.now().toString(36)}-${Array.from(values, value => value.toString(16).padStart(8, '0')).join('')}`;
    }
    idSequence += 1;
    return `gacha-${Date.now().toString(36)}-${idSequence.toString(36).padStart(6, '0')}`;
  }

  function emptyFingerprints() {
    return { fingerprintVersion: FINGERPRINT_VERSION, maxEntries: FINGERPRINT_LIMIT, retentionDays: FINGERPRINT_RETENTION_DAYS, entries: [] };
  }

  function requestSignature(input) {
    return canonical({ catId: input.catId, coinCost: input.coinCost });
  }

  function resultSignature(input) {
    return canonical({ catId: input.catId, catLifeIncluded: false, coinCost: input.coinCost, isNew: input.isNew, result: input.isNew ? 'new' : 'duplicate' });
  }

  function validFingerprint(entry) {
    return isObject(entry)
      && typeof entry.transactionId === 'string' && entry.transactionId.length > 0
      && typeof entry.catId === 'string' && entry.catId.length > 0
      && typeof entry.isNew === 'boolean'
      && Number.isInteger(entry.coinCost) && entry.coinCost >= 0
      && ['new', 'duplicate'].includes(entry.result)
      && entry.catLifeIncluded === false
      && entry.outcome === 'committed'
      && validDate(entry.createdAt) && validDate(entry.completedAt)
      && typeof entry.requestSignature === 'string' && entry.requestSignature.length > 0
      && typeof entry.resultSignature === 'string' && entry.resultSignature.length > 0;
  }

  function parseFingerprints(raw) {
    if (raw === null) return emptyFingerprints();
    let value;
    try { value = JSON.parse(raw); }
    catch (error) { throw transactionError('fingerprints-invalid-json', 'fingerprints-parse', FINGERPRINT_KEY, error); }
    if (!isObject(value) || value.fingerprintVersion !== FINGERPRINT_VERSION || value.maxEntries !== FINGERPRINT_LIMIT || value.retentionDays !== FINGERPRINT_RETENTION_DAYS || !Array.isArray(value.entries) || !value.entries.every(validFingerprint) || new Set(value.entries.map(entry => entry.transactionId)).size !== value.entries.length) throw transactionError('fingerprints-invalid-shape', 'fingerprints-validate', FINGERPRINT_KEY);
    return value;
  }

  function buildFingerprint(input, completedAt) {
    return {
      transactionId: input.transactionId,
      catId: input.catId,
      isNew: input.isNew,
      coinCost: input.coinCost,
      result: input.isNew ? 'new' : 'duplicate',
      catLifeIncluded: false,
      outcome: 'committed',
      createdAt: new Date(input.createdAt).toISOString(),
      completedAt: new Date(completedAt).toISOString(),
      requestSignature: requestSignature(input),
      resultSignature: resultSignature(input)
    };
  }

  function pruneFingerprints(store, entry, nowMs = Date.now()) {
    const cutoff = nowMs - FINGERPRINT_RETENTION_DAYS * 86400000;
    const entries = [entry, ...store.entries.filter(item => item.transactionId !== entry.transactionId && Date.parse(item.completedAt) >= cutoff)]
      .sort((a, b) => Date.parse(b.completedAt) - Date.parse(a.completedAt))
      .slice(0, FINGERPRINT_LIMIT);
    return { fingerprintVersion: FINGERPRINT_VERSION, maxEntries: FINGERPRINT_LIMIT, retentionDays: FINGERPRINT_RETENTION_DAYS, entries };
  }

  function validateRaw(key, raw, exists) {
    if (!exists) return raw === null;
    if (typeof raw !== 'string') return false;
    try {
      if (key === FINGERPRINT_KEY) { parseFingerprints(raw); return true; }
      const value = JSON.parse(raw);
      if (key === 'chokin-event-app.gachaRecent.v1') return Array.isArray(value) && value.every(id => typeof id === 'string');
      if (key === 'chokin-event-app.catCollection.v1') return isObject(value) && isObject(value.cats) && Number.isInteger(value.totalCatMedals) && value.totalCatMedals >= 0;
      if (key === 'chokin-event-app.catCoins.v1') return isObject(value) && Number.isInteger(value.balance) && value.balance >= 0 && Number.isInteger(value.totalSpent) && value.totalSpent >= 0;
      return false;
    } catch { return false; }
  }

  function validRawEntry(entry) {
    return isObject(entry) && typeof entry.exists === 'boolean' && (entry.exists ? typeof entry.raw === 'string' : !Object.prototype.hasOwnProperty.call(entry, 'raw'));
  }

  function validateJournal(journal) {
    if (!isObject(journal) || journal.journalVersion !== JOURNAL_VERSION || typeof journal.transactionId !== 'string' || !journal.transactionId || !STATES.has(journal.transactionState) || !validDate(journal.createdAt) || !validDate(journal.updatedAt) || !Number.isInteger(journal.recoveryAttempts) || journal.recoveryAttempts < 0 || !Array.isArray(journal.targetOrder) || !journal.targetOrder.length || new Set(journal.targetOrder).size !== journal.targetOrder.length || !isObject(journal.before) || !isObject(journal.after) || !isObject(journal.progress) || !Array.isArray(journal.progress.committedKeys) || !validFingerprint(journal.fingerprint)) return false;
    if (journal.targetOrder.at(-1) !== FINGERPRINT_KEY || journal.targetOrder.some(key => key !== FINGERPRINT_KEY && !BUSINESS_KEYS.has(key))) return false;
    if (Object.keys(journal.before).length !== journal.targetOrder.length || Object.keys(journal.after).length !== journal.targetOrder.length) return false;
    if (!journal.targetOrder.every(key => validRawEntry(journal.before[key]) && validRawEntry(journal.after[key]) && journal.after[key].exists)) return false;
    if (journal.progress.committedKeys.some((key, index) => journal.targetOrder[index] !== key)) return false;
    return journal.fingerprint.transactionId === journal.transactionId;
  }

  function parseJournal(raw) {
    let journal;
    try { journal = JSON.parse(raw); }
    catch (error) { throw transactionError('journal-invalid-json', 'journal-parse', JOURNAL_KEY, error); }
    if (!validateJournal(journal)) throw transactionError('journal-invalid-shape', 'journal-validate', JOURNAL_KEY);
    return journal;
  }

  function updateJournal(journal, state, phase) {
    journal.transactionState = state;
    journal.updatedAt = new Date().toISOString();
    checkedWrite(JOURNAL_KEY, JSON.stringify(journal), phase);
  }

  function entriesMatch(entries, phase) {
    return Object.entries(entries).every(([key, entry]) => {
      const raw = readRaw(key, phase);
      return raw === rawValue(entry) && validateRaw(key, raw, entry.exists);
    });
  }

  function restoreBefore(journal) {
    const errors = [];
    if (!journal.targetOrder.every(key => validateRaw(key, rawValue(journal.before[key]), journal.before[key].exists))) return { ok: false, errors: [{ key: null, code: 'before-raw-invalid' }] };
    [...journal.targetOrder].reverse().forEach((key) => {
      const entry = journal.before[key];
      try { if (entry.exists) checkedWrite(key, entry.raw, 'rollback-target'); else checkedRemove(key, 'rollback-target'); }
      catch (error) { errors.push({ key, code: error.code, phase: error.phase }); }
    });
    let exact = false;
    try { exact = entriesMatch(journal.before, 'rollback-validate'); }
    catch (error) { errors.push({ key: error.key, code: error.code, phase: error.phase }); }
    return { ok: errors.length === 0 && exact, errors };
  }

  function lookupCompleted(transactionId, request) {
    let store;
    try { store = parseFingerprints(readRaw(FINGERPRINT_KEY, 'fingerprints-read')); }
    catch (error) { return { status: 'invalid-store', error: error.code }; }
    const found = store.entries.find(entry => entry.transactionId === transactionId);
    if (!found) return { status: 'absent', store };
    return found.requestSignature === requestSignature(request) ? { status: 'match', entry: clone(found), store } : { status: 'mismatch', entry: clone(found), store };
  }

  function recoverPending() {
    let legacyRaw, raw;
    try {
      legacyRaw = readRaw(LEGACY_JOURNAL_KEY, 'legacy-journal-read');
      raw = readRaw(JOURNAL_KEY, 'recovery-journal-read');
    } catch (error) {
      return { ok: false, ...setRecoveryState(false, 'journal-read-failed', error.code) };
    }
    if (legacyRaw !== null) return { ok: false, ...setRecoveryState(false, 'legacy-journal-detected', 'legacy-journal-preserved') };
    if (raw === null) {
      try { parseFingerprints(readRaw(FINGERPRINT_KEY, 'fingerprints-preflight')); }
      catch (error) { return { ok: false, ...setRecoveryState(false, 'fingerprints-corrupt', error.code) }; }
      return { ok: true, ...setRecoveryState(true, 'clean') };
    }

    let journal;
    try { journal = parseJournal(raw); }
    catch (error) { return { ok: false, ...setRecoveryState(false, 'journal-corrupt', error.code) };
    }

    if (journal.transactionState === 'committed') {
      let afterMatches = false;
      try { afterMatches = entriesMatch(journal.after, 'recovery-committed-validate'); } catch {}
      const completed = lookupCompleted(journal.transactionId, journal.fingerprint);
      if (!afterMatches || completed.status !== 'match' || completed.entry.resultSignature !== journal.fingerprint.resultSignature) return { ok: false, ...setRecoveryState(false, 'committed-state-mismatch', completed.status, journal.recoveryAttempts) };
      try {
        checkedRemove(JOURNAL_KEY, 'recovery-committed-cleanup');
        return { ok: true, transactionId: journal.transactionId, ...setRecoveryState(true, 'committed-cleaned') };
      } catch (error) {
        return { ok: false, cleanupPending: true, ...setRecoveryState(false, 'committed-cleanup-pending', error.code, journal.recoveryAttempts) };
      }
    }

    if (journal.transactionState === 'recovered') {
      let beforeMatches = false;
      try { beforeMatches = entriesMatch(journal.before, 'recovery-recovered-validate'); } catch {}
      if (!beforeMatches) return { ok: false, ...setRecoveryState(false, 'recovered-state-mismatch', 'before-mismatch', journal.recoveryAttempts) };
      try {
        checkedRemove(JOURNAL_KEY, 'recovery-recovered-cleanup');
        return { ok: true, transactionId: journal.transactionId, ...setRecoveryState(true, 'recovered-cleaned') };
      } catch (error) {
        return { ok: false, retryable: journal.recoveryAttempts < RECOVERY_ATTEMPT_LIMIT, ...setRecoveryState(false, 'recovery-cleanup-pending', error.code, journal.recoveryAttempts) };
      }
    }

    if (journal.recoveryAttempts >= RECOVERY_ATTEMPT_LIMIT || journal.transactionState === 'failed_safe') return { ok: false, ...setRecoveryState(false, 'failed-safe', 'automatic-recovery-limit', journal.recoveryAttempts) };
    journal.recoveryAttempts += 1;
    try { updateJournal(journal, 'recovery_required', 'recovery-mark-required'); } catch {}
    const restored = restoreBefore(journal);
    if (!restored.ok) {
      const terminal = journal.recoveryAttempts >= RECOVERY_ATTEMPT_LIMIT;
      try { updateJournal(journal, terminal ? 'failed_safe' : 'recovery_required', 'recovery-retain'); } catch {}
      return { ok: false, retryable: !terminal, errors: restored.errors, ...setRecoveryState(false, terminal ? 'failed-safe' : 'recovery-required', 'rollback-failed', journal.recoveryAttempts) };
    }
    try {
      updateJournal(journal, 'recovered', 'recovery-mark-recovered');
      checkedRemove(JOURNAL_KEY, 'recovery-cleanup');
      return { ok: true, transactionId: journal.transactionId, ...setRecoveryState(true, 'rolled-back', null, journal.recoveryAttempts) };
    } catch (error) {
      return { ok: false, retryable: journal.recoveryAttempts < RECOVERY_ATTEMPT_LIMIT, ...setRecoveryState(false, 'recovery-cleanup-pending', error.code, journal.recoveryAttempts) };
    }
  }

  function ensureReady() {
    for (let attempt = 0; attempt < RECOVERY_ATTEMPT_LIMIT; attempt += 1) {
      const recovered = recoverPending();
      if (recovered.ok) return true;
      if (!recovered.retryable) return false;
    }
    return false;
  }

  function preview(changes, fingerprintInput) {
    const completedAt = new Date();
    const fingerprint = buildFingerprint(fingerprintInput, completedAt);
    const currentStore = parseFingerprints(readRaw(FINGERPRINT_KEY, 'fingerprints-snapshot'));
    const nextStore = pruneFingerprints(currentStore, fingerprint, completedAt.getTime());
    const allChanges = [...changes, { key: FINGERPRINT_KEY, raw: JSON.stringify(nextStore) }];
    const targetOrder = allChanges.map(change => change.key);
    const before = Object.fromEntries(targetOrder.map(key => [key, rawEntry(readRaw(key, 'snapshot-before'))]));
    const after = Object.fromEntries(allChanges.map(change => [change.key, rawEntry(change.raw)]));
    return {
      journalVersion: JOURNAL_VERSION,
      transactionId: fingerprintInput.transactionId,
      transactionState: 'prepared',
      createdAt: new Date(fingerprintInput.createdAt).toISOString(),
      updatedAt: new Date(fingerprintInput.createdAt).toISOString(),
      recoveryAttempts: 0,
      targetOrder,
      before,
      after,
      progress: { committedKeys: [] },
      fingerprint
    };
  }

  function commit(changes, options = {}) {
    if (!ensureReady()) return { ok: false, phase: 'preflight', code: 'gacha-recovery-required', rollbackOk: false, journalPresent: true };
    if (!Array.isArray(changes) || !changes.length) return { ok: false, phase: 'validate', code: 'empty-changes', rollbackOk: true, journalPresent: false };
    const keys = changes.map(change => change?.key);
    if (keys.some(key => !BUSINESS_KEYS.has(key)) || new Set(keys).size !== keys.length || changes.some(change => typeof change.raw !== 'string')) return { ok: false, phase: 'validate', code: 'invalid-changes', rollbackOk: true, journalPresent: false };

    const transactionId = typeof options.transactionId === 'string' && options.transactionId ? options.transactionId : createTransactionId();
    const fingerprintInput = {
      transactionId,
      catId: options.fingerprint?.catId,
      isNew: options.fingerprint?.isNew,
      coinCost: options.fingerprint?.coinCost,
      createdAt: options.fingerprint?.createdAt || new Date().toISOString()
    };
    if (typeof fingerprintInput.catId !== 'string' || !fingerprintInput.catId || typeof fingerprintInput.isNew !== 'boolean' || !Number.isInteger(fingerprintInput.coinCost) || fingerprintInput.coinCost < 0 || !validDate(fingerprintInput.createdAt)) return { ok: false, phase: 'validate', code: 'invalid-fingerprint-input', rollbackOk: true, journalPresent: false };
    const completed = lookupCompleted(transactionId, fingerprintInput);
    if (completed.status === 'invalid-store') return { ok: false, phase: 'preflight', code: 'fingerprints-corrupt', rollbackOk: false, journalPresent: false, ...setRecoveryState(false, 'fingerprints-corrupt', completed.error) };
    if (completed.status === 'match') return { ok: true, duplicateTransaction: true, transactionId, changedKeys: [], fingerprint: completed.entry, cleanupPending: false };
    if (completed.status === 'mismatch') return { ok: false, phase: 'preflight', code: 'fingerprint-mismatch', rollbackOk: false, journalPresent: false, ...setRecoveryState(false, 'failed-safe', 'fingerprint-mismatch') };

    let journal;
    try {
      journal = preview(changes, fingerprintInput);
      if (!validateJournal(journal)) throw transactionError('journal-preview-invalid', 'prepare', JOURNAL_KEY);
      for (const key of journal.targetOrder) {
        if (!validateRaw(key, rawValue(journal.before[key]), journal.before[key].exists)) throw transactionError('before-invalid', 'prepare-before-validation', key);
        if (!validateRaw(key, rawValue(journal.after[key]), journal.after[key].exists)) throw transactionError('after-invalid', 'prepare-after-validation', key);
      }
    } catch (error) {
      return { ok: false, transactionId, phase: error.phase || 'prepare', code: error.code || 'prepare-failed', rollbackOk: true, journalPresent: false };
    }

    let journalVerified = false;
    try {
      checkedWrite(JOURNAL_KEY, JSON.stringify(journal), 'journal-prepare');
      journalVerified = true;
      updateJournal(journal, 'committing', 'journal-committing');
      for (const key of journal.targetOrder) {
        checkedWrite(key, journal.after[key].raw, `commit-${key}`);
        journal.progress.committedKeys.push(key);
        updateJournal(journal, 'committing', `journal-progress-${key}`);
      }
      if (!entriesMatch(journal.after, 'commit-after-validation')) throw transactionError('after-validation-failed', 'commit-after-validation', JOURNAL_KEY);
      updateJournal(journal, 'committed', 'journal-committed');
    } catch (error) {
      if (!journalVerified) return { ok: false, transactionId, phase: error.phase || 'journal-prepare', code: error.code || 'journal-write-failed', rollbackOk: true, journalPresent: readRaw(JOURNAL_KEY, 'failed-prepare-check') !== null };
      try { updateJournal(journal, 'rolling_back', 'rollback-mark'); } catch {}
      journal.recoveryAttempts += 1;
      const restored = restoreBefore(journal);
      let cleanupOk = false;
      if (restored.ok) {
        try {
          updateJournal(journal, 'recovered', 'rollback-mark-recovered');
          checkedRemove(JOURNAL_KEY, 'rollback-cleanup');
          cleanupOk = true;
        } catch {}
      } else {
        try { updateJournal(journal, 'recovery_required', 'rollback-retain'); } catch {}
      }
      if (restored.ok && cleanupOk) {
        try { options.applyBefore?.(); } catch {}
        setRecoveryState(true, 'rolled-back');
      } else setRecoveryState(false, 'recovery-required', error.code || 'commit-failed', journal.recoveryAttempts);
      return { ok: false, transactionId, phase: error.phase || 'commit', code: error.code || 'commit-failed', rollbackOk: restored.ok && cleanupOk, rollbackErrors: restored.errors, journalPresent: readRaw(JOURNAL_KEY, 'rollback-result-check') !== null };
    }

    let applyAfterOk = true;
    try { options.applyAfter?.(); } catch { applyAfterOk = false; }
    try {
      checkedRemove(JOURNAL_KEY, 'journal-cleanup');
      setRecoveryState(true, 'committed');
      return { ok: true, transactionId, changedKeys: clone(journal.targetOrder), fingerprint: clone(journal.fingerprint), cleanupPending: false, applyAfterOk };
    } catch (error) {
      setRecoveryState(false, 'committed-cleanup-pending', error.code, journal.recoveryAttempts);
      return { ok: true, transactionId, changedKeys: clone(journal.targetOrder), fingerprint: clone(journal.fingerprint), cleanupPending: true, cleanupError: error.code, applyAfterOk };
    }
  }

  function inspect() {
    let legacyPresent = true, journalPresent = true, fingerprintState = 'unknown';
    try {
      legacyPresent = readRaw(LEGACY_JOURNAL_KEY, 'inspect-legacy') !== null;
      journalPresent = readRaw(JOURNAL_KEY, 'inspect-journal') !== null;
      parseFingerprints(readRaw(FINGERPRINT_KEY, 'inspect-fingerprints'));
      fingerprintState = 'valid';
    } catch { fingerprintState = 'invalid'; }
    return { ...clone(recoveryState), legacyPresent, journalPresent, fingerprintState, gachaBlocked: !recoveryState.ready || legacyPresent || journalPresent || fingerprintState !== 'valid', otherFeaturesBlocked: false };
  }

  const startupRecovery = { ok: true, ready: true, state: 'deferred', error: null };
  window.ChokinGachaTransaction = {
    key: JOURNAL_KEY,
    legacyKey: LEGACY_JOURNAL_KEY,
    fingerprintKey: FINGERPRINT_KEY,
    journalVersion: JOURNAL_VERSION,
    fingerprintVersion: FINGERPRINT_VERSION,
    fingerprintPolicy: Object.freeze({ maxEntries: FINGERPRINT_LIMIT, retentionDays: FINGERPRINT_RETENTION_DAYS }),
    recoveryAttemptLimit: RECOVERY_ATTEMPT_LIMIT,
    featureFlags: FEATURE_FLAGS,
    createTransactionId,
    commit,
    ensureReady,
    recoverPending,
    retryRecovery: recoverPending,
    lookupCompleted,
    preview,
    parseJournal,
    parseFingerprints,
    isReady: ensureReady,
    getRecoveryState: () => clone(recoveryState),
    inspect,
    startupRecovery
  };
})();
