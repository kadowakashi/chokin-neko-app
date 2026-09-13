(function (root, factory) {
  'use strict';
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ChokinCatLifeFinancialActivation = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';
  const STORAGE_KEY = 'chokin-event-app.catLifeFinancialActivation.v1';
  const SCHEMA_VERSION = 1;
  const clone = value => JSON.parse(JSON.stringify(value));
  const exactKeys = (value, keys) => value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
  const localDayKey = value => {
    const date = value instanceof Date ? value : new Date(value);
    if (!Number.isFinite(date.getTime())) throw new TypeError('valid local date is required');
    const pad = number => String(number).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  };
  const disabledState = () => ({ schemaVersion: SCHEMA_VERSION, enabled: false, activatedAt: null, activatedDayKey: null });
  function validateState(value) {
    const errors = [];
    if (!exactKeys(value, ['schemaVersion','enabled','activatedAt','activatedDayKey'])) errors.push({ code: 'invalid_shape' });
    if (value?.schemaVersion !== SCHEMA_VERSION) errors.push({ code: 'invalid_schema_version' });
    if (typeof value?.enabled !== 'boolean') errors.push({ code: 'invalid_enabled' });
    if (value?.enabled === false && (value.activatedAt !== null || value.activatedDayKey !== null)) errors.push({ code: 'invalid_disabled_state' });
    if (value?.enabled === true) {
      const validAt = typeof value.activatedAt === 'string' && Number.isFinite(Date.parse(value.activatedAt));
      const validDay = typeof value.activatedDayKey === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value.activatedDayKey);
      if (!validAt) errors.push({ code: 'invalid_activated_at' });
      if (!validDay) errors.push({ code: 'invalid_activated_day' });
      if (validAt && validDay && localDayKey(value.activatedAt) !== value.activatedDayKey) errors.push({ code: 'activation_day_mismatch' });
    }
    return { valid: errors.length === 0, errors };
  }
  function load(storage = root.localStorage) {
    try {
      const raw = storage.getItem(STORAGE_KEY);
      if (raw === null) return { status: 'empty', state: disabledState(), raw: null };
      const value = JSON.parse(raw), checked = validateState(value);
      return checked.valid ? { status: 'ok', state: clone(value), raw } : { status: 'corrupted', state: null, raw };
    } catch { return { status: 'storage_error', state: null, raw: null }; }
  }
  function activate({ storage = root.localStorage, timestamp = new Date() } = {}) {
    const before = storage.getItem(STORAGE_KEY), loaded = load(storage);
    if (!['empty','ok'].includes(loaded.status)) return { status: loaded.status, committed: false, state: null };
    if (loaded.state.enabled) return { status: 'already_enabled', committed: false, state: loaded.state };
    const date = timestamp instanceof Date ? timestamp : new Date(timestamp);
    if (!Number.isFinite(date.getTime())) return { status: 'invalid_timestamp', committed: false, state: null };
    const state = { schemaVersion: SCHEMA_VERSION, enabled: true, activatedAt: date.toISOString(), activatedDayKey: localDayKey(date) };
    const raw = JSON.stringify(state);
    try {
      storage.setItem(STORAGE_KEY, raw);
      if (storage.getItem(STORAGE_KEY) !== raw) throw new Error('activation readback mismatch');
      return { status: 'enabled', committed: true, state: clone(state) };
    } catch {
      try { if (before === null) storage.removeItem(STORAGE_KEY); else storage.setItem(STORAGE_KEY, before); } catch {}
      return { status: 'storage_error', committed: false, state: null };
    }
  }
  function isEligible(value, timestamp = new Date()) {
    if (!validateState(value).valid || value.enabled !== true) return false;
    return localDayKey(timestamp) > value.activatedDayKey;
  }
  return Object.freeze({ STORAGE_KEY, SCHEMA_VERSION, disabledState, validateState, load, activate, isEligible, localDayKey });
});
