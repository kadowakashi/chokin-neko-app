(() => {
  'use strict';

  const STORAGE_KEY = 'chokin-event-app.onboarding.v1';
  const LEGACY_GUIDE_KEY = 'chokin-event-app.firstGuide.v0.8.1';
  const SCHEMA_VERSION = 1;
  const DEFAULT_QUICK = [100, 500, 1000, 3000, 5000];
  const OBSERVED_KEYS = Object.freeze([
    'chokin-event-app.v0.1',
    LEGACY_GUIDE_KEY,
    'chokin-event-app.catCollection.v1',
    'chokin-event-app.catCoins.v1',
    'chokin-event-app.savingsGoal.v1',
    'chokin-event-app.goalHistory.v1',
    'chokin-event-app.badgeState.v1',
    STORAGE_KEY,
  ]);
  const PAGES = Object.freeze([
    { id: 'small-steps', title: '少しずつでOK', body: ['1円からでも大丈夫。', '貯めた分を記録して、ねこと一緒に続けよう。'], note: '毎日できなくても、これまでの記録はなくなりません。', image: './assets/cats-transparent/cat_celebrate.png', imageAlt: 'お祝い猫', sortOrder: 1 },
    { id: 'records', title: '貯金と出費を記録', body: ['貯金した金額は、通常入力やクイック貯金で記録できます。', '出費は「必要経費」「後悔散財」「最高の散財」の3種類です。'], note: '後悔散財を記録すると、10％のリベンジ貯金ができます。', image: './assets/cats-transparent/cat_hachiware.png', imageAlt: 'ハチワレ猫', sortOrder: 2 },
    { id: 'cat-coins', title: 'ねこコインとガチャ', body: ['その日の最初の貯金で、ねこコインを1枚もらえます。', 'ねこコイン1枚で、猫ガチャを1回引けます。'], note: '貯金演出の応援猫は、ガチャで仲間になるまで図鑑には追加されません。', image: './assets/cats-transparent/cat_royal.png', imageAlt: '王様猫', sortOrder: 3 },
    { id: 'goals', title: '目標と実績', body: ['ほしいものを貯金目標に設定できます。', 'カレンダーでは、貯金した日や金額を振り返れます。', '目標を達成すると、達成アルバムやバッジにも記録されます。'], note: '', image: './assets/cats-transparent/cat_cosmic.png', imageAlt: '宇宙猫', sortOrder: 4 },
    { id: 'data-safety', title: 'データを守ろう', body: ['記録は、この端末の中に保存されます。', '設定画面から、ときどきバックアップを作っておくと安心です。'], note: 'オフラインでも使えます。更新のお知らせが出た時は、内容を適用してアプリを開き直してください。', image: './assets/cats-transparent/cat_angel.png', imageAlt: '天使猫', sortOrder: 5 },
  ]);

  const initialSnapshot = new Map(OBSERVED_KEYS.map((key) => {
    try { return [key, localStorage.getItem(key)]; } catch (_) { return [key, null]; }
  }));
  let dialog = null;
  let pageIndex = 0;
  let mode = 'manual';
  let opener = null;
  let readyPromise = Promise.resolve(false);
  let resolveReady = null;
  let waiting = false;

  const parse = (raw) => {
    if (typeof raw !== 'string') return null;
    try { return JSON.parse(raw); } catch (_) { return null; }
  };
  const object = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  const differentQuick = (values) => Array.isArray(values) && (values.length !== DEFAULT_QUICK.length || values.some((value, index) => value !== DEFAULT_QUICK[index]));

  function existingUserEvidence() {
    if (initialSnapshot.get(LEGACY_GUIDE_KEY) !== null) return 'legacy-guide';
    const main = parse(initialSnapshot.get('chokin-event-app.v0.1'));
    if (object(main)) {
      const settings = object(main.settings) ? main.settings : {};
      if ((Array.isArray(main.entries) && main.entries.length > 0) || differentQuick(main.quickAmounts) || Object.keys(main.futureSettings || {}).length > 0 || settings.sound === false || settings.vibration === false || settings.effects === false || typeof main.appVersion === 'string') return 'main-data';
    }
    const collection = parse(initialSnapshot.get('chokin-event-app.catCollection.v1'));
    if (object(collection) && ((object(collection.cats) && Object.values(collection.cats).some((record) => record?.obtained === true || Number(record?.obtainedCount) > 0)) || Number(collection.totalCatMedals) > 0)) return 'collection';
    const coins = parse(initialSnapshot.get('chokin-event-app.catCoins.v1'));
    if (object(coins) && (Number(coins.totalSpent) > 0 || Number(coins.totalEarned) > 1 || Boolean(coins.lastDailyAwardDate))) return 'coins';
    const goal = parse(initialSnapshot.get('chokin-event-app.savingsGoal.v1'));
    if (object(goal) && (goal.itemName || Number(goal.targetAmount) > 0)) return 'goal';
    const history = parse(initialSnapshot.get('chokin-event-app.goalHistory.v1'));
    if (object(history) && Array.isArray(history.items) && history.items.length > 0) return 'goal-history';
    const badges = parse(initialSnapshot.get('chokin-event-app.badgeState.v1'));
    if (object(badges) && object(badges.earned) && Object.keys(badges.earned).length > 0) return 'badges';
    return null;
  }

  function readState() {
    const raw = initialSnapshot.get(STORAGE_KEY);
    if (raw === null) return null;
    const value = parse(raw);
    return object(value) && value.schemaVersion === SCHEMA_VERSION && ['shown', 'closed', 'completed', 'migrated'].includes(value.status) ? value : { status: 'invalid' };
  }

  function writeState(status, extra = {}) {
    const now = new Date().toISOString();
    const current = parse(localStorage.getItem(STORAGE_KEY));
    const state = {
      schemaVersion: SCHEMA_VERSION,
      autoShown: status !== 'migrated',
      status,
      firstShownAt: object(current) && typeof current.firstShownAt === 'string' ? current.firstShownAt : extra.firstShownAt || null,
      closedAt: status === 'closed' ? now : object(current) ? current.closedAt || null : null,
      completedAt: status === 'completed' ? now : object(current) ? current.completedAt || null : null,
      migratedExistingUser: status === 'migrated',
    };
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); return true; } catch (_) { return false; }
  }

  function makeElement(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }

  function buildDialog() {
    if (dialog) return dialog;
    dialog = makeElement('dialog', 'onboarding-dialog');
    dialog.id = 'onboardingDialog';
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-labelledby', 'onboardingTitle');
    const panel = makeElement('div', 'onboarding-panel');
    const close = makeElement('button', 'onboarding-close', '×');
    close.type = 'button'; close.setAttribute('aria-label', '使い方を閉じる'); close.dataset.onboardingClose = '';
    const count = makeElement('p', 'onboarding-count'); count.id = 'onboardingCount'; count.setAttribute('aria-live', 'polite');
    const imageWrap = makeElement('div', 'onboarding-visual');
    const image = makeElement('img'); image.id = 'onboardingImage'; image.decoding = 'async'; imageWrap.append(image);
    const title = makeElement('h2'); title.id = 'onboardingTitle'; title.tabIndex = -1;
    const copy = makeElement('div', 'onboarding-copy'); copy.id = 'onboardingCopy';
    const dots = makeElement('div', 'onboarding-dots'); dots.id = 'onboardingDots'; dots.setAttribute('aria-label', '案内の進捗');
    const actions = makeElement('div', 'onboarding-actions');
    const back = makeElement('button', 'onboarding-back', '戻る'); back.type = 'button'; back.dataset.onboardingBack = '';
    const next = makeElement('button', 'onboarding-next', '次へ'); next.type = 'button'; next.dataset.onboardingNext = '';
    actions.append(back, next);
    panel.append(close, count, imageWrap, title, copy, dots, actions);
    dialog.append(panel); document.body.append(dialog);
    close.addEventListener('click', () => closeGuide('closed'));
    back.addEventListener('click', () => showPage(pageIndex - 1));
    next.addEventListener('click', () => pageIndex === PAGES.length - 1 ? closeGuide('completed') : showPage(pageIndex + 1));
    dialog.addEventListener('cancel', (event) => { event.preventDefault(); closeGuide('closed'); });
    dialog.addEventListener('keydown', onKeydown);
    return dialog;
  }

  function showPage(index) {
    pageIndex = Math.max(0, Math.min(PAGES.length - 1, index));
    const page = PAGES[pageIndex];
    const image = dialog.querySelector('#onboardingImage');
    image.src = page.image; image.alt = page.imageAlt;
    image.onerror = () => { image.hidden = true; };
    image.onload = () => { image.hidden = false; };
    dialog.querySelector('#onboardingTitle').textContent = page.title;
    const copy = dialog.querySelector('#onboardingCopy'); copy.replaceChildren();
    page.body.forEach((line) => copy.append(makeElement('p', '', line)));
    if (page.note) copy.append(makeElement('p', 'onboarding-note', page.note));
    dialog.querySelector('#onboardingCount').textContent = `${pageIndex + 1} / ${PAGES.length}ページ`;
    const dots = dialog.querySelector('#onboardingDots'); dots.replaceChildren();
    PAGES.forEach((_, index) => {
      const dot = makeElement('span', index === pageIndex ? 'is-current' : '', String(index + 1));
      dot.setAttribute('aria-label', `${index + 1}ページ目`);
      if (index === pageIndex) dot.setAttribute('aria-current', 'step');
      dots.append(dot);
    });
    const back = dialog.querySelector('[data-onboarding-back]');
    back.hidden = pageIndex === 0;
    const next = dialog.querySelector('[data-onboarding-next]');
    next.textContent = pageIndex === PAGES.length - 1 ? 'はじめる' : '次へ';
    requestAnimationFrame(() => dialog.querySelector('#onboardingTitle').focus({ preventScroll: true }));
  }

  function focusables() {
    return [...dialog.querySelectorAll('button:not([hidden]):not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])')];
  }

  function onKeydown(event) {
    if (event.key === 'Escape') { event.preventDefault(); closeGuide('closed'); return; }
    if (event.key === 'ArrowRight') { event.preventDefault(); showPage(pageIndex + 1); return; }
    if (event.key === 'ArrowLeft') { event.preventDefault(); showPage(pageIndex - 1); return; }
    if (event.key !== 'Tab') return;
    const items = focusables(); if (!items.length) return;
    const first = items[0], last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }

  function hasBlocker() {
    if ([...document.querySelectorAll('dialog[open]')].some((item) => item !== dialog)) return true;
    if (document.querySelector('#celebration.show, #goalAchievement:not([hidden]), .coin-welcome-toast')) return true;
    return false;
  }

  function openGuide(openMode, trigger = null) {
    buildDialog();
    if (dialog.open || hasBlocker()) return false;
    mode = openMode; opener = trigger || document.activeElement; pageIndex = 0; showPage(0);
    const updateNotice = document.querySelector('#pwaUpdate');
    if (updateNotice) updateNotice.hidden = true;
    dialog.showModal();
    if (mode === 'auto') writeState('shown', { firstShownAt: new Date().toISOString(), source: 'auto' });
    return true;
  }

  function closeGuide(status) {
    if (!dialog?.open) return;
    if (mode === 'auto') writeState(status, { source: 'auto' });
    dialog.close();
    const updateNotice = document.querySelector('#pwaUpdate');
    if (updateNotice) updateNotice.hidden = false;
    const target = mode === 'manual' ? opener : document.querySelector('#home h1, #home button, h1');
    if (target instanceof HTMLElement) {
      if (!target.matches('button, a, input, select, textarea, [tabindex]')) target.tabIndex = -1;
      target.focus({ preventScroll: true });
    }
    resolveReady?.(true); resolveReady = null;
    window.ChokinBadges?.tryShowQueued?.();
  }

  function waitAndOpenAuto() {
    if (waiting) return readyPromise;
    waiting = true;
    readyPromise = new Promise((resolve) => { resolveReady = resolve; });
    let attempts = 0;
    const tryOpen = () => {
      attempts += 1;
      if (openGuide('auto')) return;
      window.setTimeout(tryOpen, attempts < 80 ? 125 : 500);
    };
    requestAnimationFrame(() => window.setTimeout(tryOpen, 80));
    return readyPromise;
  }

  function init() {
    buildDialog();
    const state = readState();
    if (state) return Promise.resolve(false);
    const evidence = existingUserEvidence();
    if (evidence) {
      writeState('migrated', { source: evidence });
      return Promise.resolve(false);
    }
    return waitAndOpenAuto();
  }

  function openManual(trigger, attempts = 0) {
    if (!openGuide('manual', trigger) && attempts < 40) window.setTimeout(() => openManual(trigger, attempts + 1), 250);
  }

  window.ChokinOnboarding = Object.freeze({ init, openManual, key: STORAGE_KEY, pages: PAGES });
})();
