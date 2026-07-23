(() => {
  'use strict';

  const STORAGE_KEY = 'chokin-event-app.dailyNotes.v1';
  const SCHEMA_VERSION = 1;
  const MAX_LENGTH = 100;
  const TEXT = Object.freeze({
    name: 'ひとこと日記',
    todayAction: '今日のひとことを書く',
    save: '日記を保存',
    edit: '日記を編集',
    remove: '日記を削除',
  });
  const empty = () => ({ schemaVersion: SCHEMA_VERSION, enabled: true, notes: {}, rewardedDates: {} });
  let state = empty();
  let loadStatus = { state: 'empty', invalidItems: 0 };
  let options = {};
  let selectedDate = null;
  let returnContext = null;
  let saving = false;

  const $ = (selector) => document.querySelector(selector);
  const plainObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  const clone = (value) => JSON.parse(JSON.stringify(value));
  const codePointLength = (value) => [...String(value || '')].length;
  const validIso = (value) => typeof value === 'string' && Number.isFinite(Date.parse(value));
  const eventIdFor = (dateKey) => `daily-note-reward:${dateKey}`;
  const noteIdFor = (dateKey) => `daily-note:${dateKey}`;
  const dateKey = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  const dateKeyFromParts = (year, monthIndex, day) => dateKey(new Date(year, monthIndex, day));

  function validDateKey(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const [year, month, day] = value.split('-').map(Number);
    const parsed = new Date(year, month - 1, day);
    return parsed.getFullYear() === year && parsed.getMonth() === month - 1 && parsed.getDate() === day;
  }

  function normalize(source) {
    const next = empty();
    let invalidItems = 0;
    if (!plainObject(source)) return { data: next, readable: source == null, invalidItems: source == null ? 0 : 1 };
    if (source.schemaVersion !== SCHEMA_VERSION) invalidItems += 1;
    if (typeof source.enabled === 'boolean') next.enabled = source.enabled;
    else invalidItems += 1;
    if (plainObject(source.notes)) {
      Object.entries(source.notes).forEach(([key, note]) => {
        const text = typeof note?.text === 'string' ? note.text.trim() : '';
        if (!validDateKey(key) || !plainObject(note) || typeof note.id !== 'string' || note.localDate !== key || !text || codePointLength(text) > MAX_LENGTH || !validIso(note.createdAt) || !validIso(note.updatedAt)) { invalidItems += 1; return; }
        next.notes[key] = { id: note.id, localDate: key, text, createdAt: note.createdAt, updatedAt: note.updatedAt };
      });
    } else invalidItems += 1;
    if (plainObject(source.rewardedDates)) {
      Object.entries(source.rewardedDates).forEach(([key, reward]) => {
        const expected = eventIdFor(key);
        if (!validDateKey(key) || !plainObject(reward) || reward.eventId !== expected || !validIso(reward.grantedAt)) { invalidItems += 1; return; }
        next.rewardedDates[key] = { eventId: expected, grantedAt: reward.grantedAt };
      });
    } else invalidItems += 1;
    return { data: next, readable: true, invalidItems };
  }

  function readRaw() { try { return localStorage.getItem(STORAGE_KEY); } catch (_) { return null; } }
  function loadFromRaw(raw) {
    if (raw === null) { state = empty(); loadStatus = { state: 'empty', invalidItems: 0 }; return; }
    try {
      const result = normalize(JSON.parse(raw)); state = result.data;
      loadStatus = { state: result.invalidItems ? 'partial' : 'ok', invalidItems: result.invalidItems };
    } catch (_) { state = empty(); loadStatus = { state: 'invalid', invalidItems: 1 }; }
  }
  function save() { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); return true; } catch (_) { return false; } }
  function restoreRaw(raw) {
    try { if (raw === null) localStorage.removeItem(STORAGE_KEY); else localStorage.setItem(STORAGE_KEY, raw); loadFromRaw(raw); return true; }
    catch (_) { return false; }
  }

  function getNote(key) { return state.notes[key] ? { ...state.notes[key] } : null; }
  function hasNote(key) { return Boolean(state.notes[key]); }
  function isEnabled() { return state.enabled; }
  function rewardRecorded(key) { return Boolean(state.rewardedDates[key]) || window.ChokinCoins?.hasEvent?.(eventIdFor(key)) === true; }
  function isFuture(key) { return key > dateKey(); }
  function displayDate(key) { const [year, month, day] = key.split('-').map(Number); return `${year}年${month}月${day}日`; }

  function hideUpdateNotice(hidden) { const notice = $('#pwaUpdate'); if (notice) notice.hidden = hidden; }
  function hasModalBlocker(except = null) { return [...document.querySelectorAll('dialog[open]')].some((dialog) => dialog !== except); }
  function focusables(dialog) { return [...dialog.querySelectorAll('button:not([disabled]):not([hidden]), textarea:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])')]; }
  function trapFocus(event, dialog) {
    if (event.key !== 'Tab') return;
    const items = focusables(dialog); if (!items.length) return;
    const first = items[0], last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }

  function buildUi() {
    if ($('#dailyNoteDialog')) return;
    const homeLink = document.createElement('button');
    homeLink.id = 'homeDailyNote'; homeLink.className = 'home-daily-note'; homeLink.type = 'button';
    $('#homeSavingsCalendar')?.insertAdjacentElement('afterend', homeLink);
    homeLink.addEventListener('click', () => openEditor(dateKey(), homeLink, 'home'));

    const setting = document.createElement('div');
    setting.id = 'dailyNoteSetting'; setting.className = 'setting';
    const copy = document.createElement('span'), title = document.createElement('b'), note = document.createElement('small'), toggle = document.createElement('input');
    title.id = 'dailyNoteSettingTitle'; title.textContent = TEXT.name;
    note.id = 'dailyNoteSettingDescription'; note.textContent = '短い日記を残し、その日の初回保存でねこコインを1枚獲得します';
    toggle.id = 'dailyNoteEnabled'; toggle.type = 'checkbox'; toggle.setAttribute('role', 'switch');
    toggle.setAttribute('aria-labelledby', title.id); toggle.setAttribute('aria-describedby', note.id);
    copy.append(title, note); setting.append(copy, toggle);
    $('#badgeSettingsLink')?.insertAdjacentElement('beforebegin', setting);
    toggle.addEventListener('change', () => setEnabled(toggle.checked));

    const calendarSection = document.createElement('section');
    calendarSection.id = 'dailyNoteCalendarSection'; calendarSection.className = 'daily-note-calendar-section';
    $('#calendarDayDetail .calendar-detail-summary')?.insertAdjacentElement('beforebegin', calendarSection);
    calendarSection.addEventListener('click', (event) => {
      const action = event.target.closest('[data-daily-note-action]'); if (!action) return;
      const calendarDialog = $('#calendarDayDetail'); if (calendarDialog?.open) calendarDialog.close();
      openEditor(selectedDate, action, 'calendar');
    });

    const dialog = document.createElement('dialog');
    dialog.id = 'dailyNoteDialog'; dialog.className = 'daily-note-dialog';
    dialog.setAttribute('aria-modal', 'true'); dialog.setAttribute('aria-labelledby', 'dailyNoteDialogTitle');
    const panel = document.createElement('form'); panel.className = 'daily-note-panel'; panel.noValidate = true;
    const heading = document.createElement('h2'); heading.id = 'dailyNoteDialogTitle';
    const intro = document.createElement('p'); intro.className = 'daily-note-intro'; intro.textContent = '今日できたことや、うれしかったことを書こう';
    const label = document.createElement('label'); label.htmlFor = 'dailyNoteText'; label.textContent = TEXT.name;
    const textarea = document.createElement('textarea'); textarea.id = 'dailyNoteText'; textarea.rows = 6; textarea.setAttribute('aria-describedby', 'dailyNoteCounter dailyNoteError dailyNoteRewardHint');
    textarea.placeholder = '例：今日うれしかったこと、がんばったこと';
    const counter = document.createElement('p'); counter.id = 'dailyNoteCounter'; counter.className = 'daily-note-counter'; counter.setAttribute('aria-live', 'polite');
    const hint = document.createElement('p'); hint.id = 'dailyNoteRewardHint'; hint.className = 'daily-note-reward-hint';
    const error = document.createElement('p'); error.id = 'dailyNoteError'; error.className = 'daily-note-error'; error.setAttribute('role', 'alert');
    const status = document.createElement('p'); status.id = 'dailyNoteStatus'; status.className = 'daily-note-status'; status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
    const actions = document.createElement('div'); actions.className = 'daily-note-actions';
    const cancel = document.createElement('button'); cancel.type = 'button'; cancel.className = 'daily-note-cancel'; cancel.textContent = 'キャンセル';
    const submit = document.createElement('button'); submit.type = 'submit'; submit.className = 'daily-note-save'; submit.textContent = TEXT.save;
    const remove = document.createElement('button'); remove.type = 'button'; remove.id = 'dailyNoteDelete'; remove.className = 'daily-note-delete'; remove.textContent = TEXT.remove;
    actions.append(cancel, submit); panel.append(heading, intro, label, textarea, counter, hint, error, status, actions, remove); dialog.append(panel); document.body.append(dialog);
    textarea.addEventListener('input', updateCounter);
    cancel.addEventListener('click', closeEditor);
    remove.addEventListener('click', openDeleteConfirmation);
    panel.addEventListener('submit', saveFromEditor);
    dialog.addEventListener('cancel', (event) => { event.preventDefault(); closeEditor(); });
    dialog.addEventListener('keydown', (event) => trapFocus(event, dialog));

    const confirm = document.createElement('dialog');
    confirm.id = 'dailyNoteDeleteDialog'; confirm.className = 'daily-note-delete-dialog';
    confirm.setAttribute('aria-modal', 'true'); confirm.setAttribute('aria-labelledby', 'dailyNoteDeleteTitle');
    const confirmPanel = document.createElement('div'), confirmTitle = document.createElement('h2'), confirmCopy = document.createElement('p'), confirmActions = document.createElement('div'), back = document.createElement('button'), deleteButton = document.createElement('button');
    confirmTitle.id = 'dailyNoteDeleteTitle'; confirmTitle.textContent = `この${TEXT.name}を削除しますか？`;
    confirmCopy.textContent = '獲得済みのねこコインは減りません。同じ日に書き直しても、追加のコインはもらえません。';
    back.type = 'button'; back.className = 'daily-note-cancel'; back.textContent = '戻る';
    deleteButton.type = 'button'; deleteButton.className = 'daily-note-delete-confirm'; deleteButton.textContent = TEXT.remove;
    confirmActions.className = 'daily-note-actions'; confirmActions.append(back, deleteButton); confirmPanel.append(confirmTitle, confirmCopy, confirmActions); confirm.append(confirmPanel); document.body.append(confirm);
    back.addEventListener('click', returnToEditorFromDelete);
    deleteButton.addEventListener('click', confirmDelete);
    confirm.addEventListener('cancel', (event) => { event.preventDefault(); returnToEditorFromDelete(); });
    confirm.addEventListener('keydown', (event) => trapFocus(event, confirm));
  }

  function updateCounter() {
    const textarea = $('#dailyNoteText'), count = codePointLength(textarea?.value || ''), counter = $('#dailyNoteCounter');
    counter.textContent = `${count} / ${MAX_LENGTH}文字`;
    counter.classList.toggle('is-over', count > MAX_LENGTH);
    if (!count) $('#dailyNoteError').textContent = '1文字から保存できます。';
    else if (count > MAX_LENGTH) $('#dailyNoteError').textContent = `${MAX_LENGTH}文字以内で入力してください。`;
    else $('#dailyNoteError').textContent = '';
  }

  function setEnabled(enabled) {
    const before = clone(state); state.enabled = Boolean(enabled);
    if (!save()) { state = before; $('#dailyNoteEnabled').checked = state.enabled; alert('設定を保存できませんでした。'); return; }
    refreshViews();
  }

  function refreshViews() {
    renderHome();
    const toggle = $('#dailyNoteEnabled'); if (toggle) toggle.checked = state.enabled;
    if ($('#calendar')?.classList.contains('active')) options.renderCalendar?.();
    if ($('#calendarDayDetail')?.open && selectedDate) renderCalendarDetail(selectedDate);
    options.renderCoins?.();
  }

  function renderHome() {
    const button = $('#homeDailyNote'); if (!button) return;
    button.hidden = !state.enabled;
    if (!state.enabled) return;
    const today = dateKey(), note = getNote(today);
    button.replaceChildren();
    const main = document.createElement('span'), title = document.createElement('b'), sub = document.createElement('small'), arrow = document.createElement('strong');
    title.textContent = note ? `今日の${TEXT.name}を見る` : TEXT.todayAction;
    sub.textContent = note ? '保存した内容を確認・編集' : rewardRecorded(today) ? '本日のねこコインは獲得済みです' : '＋ねこコイン1枚';
    arrow.textContent = '›'; arrow.setAttribute('aria-hidden', 'true'); main.append(title, sub); button.append(main, arrow);
  }

  function renderCalendarDetail(key) {
    selectedDate = key;
    const host = $('#dailyNoteCalendarSection'); if (!host) return;
    host.replaceChildren();
    const heading = document.createElement('h3'); heading.textContent = TEXT.name; host.append(heading);
    const note = getNote(key), future = isFuture(key), today = key === dateKey();
    if (note) {
      const text = document.createElement('p'); text.className = 'daily-note-text'; text.textContent = note.text; host.append(text);
    } else {
      const emptyText = document.createElement('p'); emptyText.className = 'daily-note-empty';
      emptyText.textContent = future ? '未来の日記はまだ作成できません。' : today ? '今日できたことや、うれしかったことを書こう' : 'この日のことを残してみよう'; host.append(emptyText);
    }
    if (!state.enabled) {
      const off = document.createElement('small'); off.className = 'daily-note-off'; off.textContent = 'この機能は設定でオフになっています。再度オンにすると編集できます。'; host.append(off); return;
    }
    if (future) return;
    if (today) {
      const reward = document.createElement('small'); reward.className = 'daily-note-calendar-reward'; reward.textContent = rewardRecorded(key) ? '本日のねこコインは獲得済みです' : '日記を書くと、ねこコイン1枚'; host.append(reward);
    }
    const button = document.createElement('button'); button.type = 'button'; button.dataset.dailyNoteAction = note ? 'edit' : 'create'; button.textContent = note ? TEXT.edit : '日記を書く'; host.append(button);
  }

  function openEditor(key, opener, context) {
    if (!state.enabled || isFuture(key) || saving) return;
    const calendarDialog = $('#calendarDayDetail'); if (calendarDialog?.open) calendarDialog.close();
    if (hasModalBlocker()) return;
    selectedDate = key; returnContext = { context, opener };
    const existing = getNote(key), dialog = $('#dailyNoteDialog'), textarea = $('#dailyNoteText');
    $('#dailyNoteDialogTitle').textContent = `${displayDate(key)}の${TEXT.name}`;
    textarea.value = existing?.text || '';
    $('#dailyNoteRewardHint').textContent = key === dateKey() && rewardRecorded(key) ? '本日のねこコインは獲得済みです' : key === dateKey() && !existing ? '今日の初回保存で、ねこコインを1枚獲得できます' : '';
    $('#dailyNoteDelete').hidden = !existing;
    $('#dailyNoteError').textContent = ''; $('#dailyNoteStatus').textContent = '';
    updateCounter(); hideUpdateNotice(true); dialog.showModal();
    requestAnimationFrame(() => textarea.focus({ preventScroll: true }));
  }

  function finishReturn() {
    hideUpdateNotice(false);
    const context = returnContext; returnContext = null;
    if (context?.context === 'calendar' && selectedDate) options.reopenCalendarDay?.(selectedDate);
    else if (context?.opener instanceof HTMLElement) context.opener.focus({ preventScroll: true });
  }
  function closeEditor() { const dialog = $('#dailyNoteDialog'); if (dialog?.open) dialog.close(); finishReturn(); }

  function validateText(value) {
    const text = String(value || '').trim(), length = codePointLength(text);
    if (!length) return { valid: false, error: '1文字以上入力してください。' };
    if (length > MAX_LENGTH) return { valid: false, error: `${MAX_LENGTH}文字以内で入力してください。` };
    return { valid: true, text, length };
  }

  function saveFromEditor(event) {
    event.preventDefault(); if (saving) return;
    const validation = validateText($('#dailyNoteText').value);
    if (!validation.valid) { $('#dailyNoteError').textContent = validation.error; $('#dailyNoteText').focus(); return; }
    if (!state.enabled || isFuture(selectedDate)) { $('#dailyNoteError').textContent = 'この日付には保存できません。'; return; }
    saving = true; const saveButton = $('#dailyNoteDialog .daily-note-save'); saveButton.disabled = true; $('#dailyNoteStatus').textContent = '保存しています';
    const beforeNotesRaw = readRaw(), beforeCoinsRaw = (() => { try { return localStorage.getItem(window.ChokinCoins.key); } catch (_) { return null; } })();
    loadFromRaw(beforeNotesRaw);
    const existing = getNote(selectedDate);
    if (existing?.text === validation.text) { saving = false; saveButton.disabled = false; $('#dailyNoteStatus').textContent = `${TEXT.name}は保存済みです`; return; }
    const now = new Date(), nowIso = now.toISOString(), today = dateKey(now), eventId = eventIdFor(selectedDate), canReward = !existing && selectedDate === today && !rewardRecorded(selectedDate);
    let awarded = false;
    try {
      if (canReward) {
        const result = window.ChokinCoins.awardEvent(eventId, 'daily-note', 1);
        if (!result.ok) throw new Error('ねこコインを保存できませんでした。');
        awarded = result.awarded;
        if (awarded) state.rewardedDates[selectedDate] = { eventId, grantedAt: result.event.grantedAt };
      }
      state.notes[selectedDate] = { id: existing?.id || noteIdFor(selectedDate), localDate: selectedDate, text: validation.text, createdAt: existing?.createdAt || nowIso, updatedAt: nowIso };
      if (!save()) throw new Error(`${TEXT.name}を保存できませんでした。`);
    } catch (error) {
      const notesRestored = restoreRaw(beforeNotesRaw), coinsRestored = window.ChokinCoins.restoreRaw(beforeCoinsRaw);
      saving = false; saveButton.disabled = false; $('#dailyNoteStatus').textContent = '';
      $('#dailyNoteError').textContent = notesRestored && coinsRestored ? error.message : '保存に失敗し、元の状態へ完全に戻せませんでした。再操作せずバックアップを確認してください。';
      return;
    }
    saving = false; saveButton.disabled = false; const dialog = $('#dailyNoteDialog'); dialog.close();
    refreshViews(); finishReturn(); showToast(awarded ? `${TEXT.name}を保存しました\nねこコインを1枚もらいました！` : existing ? `${TEXT.name}を更新しました` : `${TEXT.name}を保存しました`);
  }

  function openDeleteConfirmation() {
    if (!getNote(selectedDate)) return;
    $('#dailyNoteDialog').close(); const dialog = $('#dailyNoteDeleteDialog'); dialog.showModal();
    requestAnimationFrame(() => dialog.querySelector('.daily-note-cancel').focus({ preventScroll: true }));
  }
  function returnToEditorFromDelete() { $('#dailyNoteDeleteDialog').close(); openEditor(selectedDate, returnContext?.opener, returnContext?.context); }
  function confirmDelete() {
    const before = readRaw(); loadFromRaw(before);
    if (!state.notes[selectedDate]) { $('#dailyNoteDeleteDialog').close(); refreshViews(); finishReturn(); return; }
    delete state.notes[selectedDate];
    if (!save()) { restoreRaw(before); $('#dailyNoteDeleteDialog').close(); openEditor(selectedDate, returnContext?.opener, returnContext?.context); $('#dailyNoteError').textContent = '削除できませんでした。'; return; }
    $('#dailyNoteDeleteDialog').close(); refreshViews(); finishReturn(); showToast(`${TEXT.name}を削除しました`);
  }

  function showToast(message) {
    const old = $('#dailyNoteToast'); old?.remove();
    const toast = document.createElement('div'); toast.id = 'dailyNoteToast'; toast.className = 'daily-note-toast'; toast.setAttribute('role', 'status'); toast.textContent = message; document.body.append(toast);
    setTimeout(() => toast.remove(), 3600);
  }

  function inspectData(value) {
    if (value === null || value === undefined) return { valid: true, readable: false, data: empty(), noteCount: 0, invalidItems: 0, state: 'none' };
    const result = normalize(value);
    return { valid: true, readable: result.readable, data: result.data, noteCount: Object.keys(result.data.notes).length, invalidItems: result.invalidItems, state: !result.readable ? 'invalid' : result.invalidItems ? 'partial' : 'ok' };
  }
  function importData(value) {
    if (value === null || value === undefined) { state = empty(); return save(); }
    const inspected = inspectData(value); state = clone(inspected.data); return save();
  }

  function setup(nextOptions = {}) { options = nextOptions; buildUi(); refreshViews(); }
  loadFromRaw(readRaw());
  window.ChokinDailyNotes = Object.freeze({ TEXT, setup, renderHome, renderCalendarDetail, dateKey, dateKeyFromParts, isEnabled, hasNote, getNote, rewardRecorded, getStorageKey: () => STORAGE_KEY, getRaw: readRaw, restoreRaw, exportData: () => clone(state), importData, inspectData, getDiagnostics: () => ({ ...loadStatus, noteCount: Object.keys(state.notes).length }) });
})();
