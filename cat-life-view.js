(function (root, factory) {
  'use strict';
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ChokinCatLifeView = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  const EMPTY_MESSAGE = '猫たちの暮らしはまだ始まっていません。ホームの案内から開始できます。';
  const ERROR_MESSAGE = '猫たちの暮らしを読み込めませんでした。現在のデータは変更されていません。';
  const EVENT_ERROR_MESSAGE = '猫たちのできごとを読み込めませんでした。現在のデータは変更されていません。';
  const EVENT_EMPTY_MESSAGE = 'まだできごとはありません';
  const UNKNOWN_EVENT_TITLE = '過去のできごと';
  const UNKNOWN_NAME = '知らない猫';
  const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
  const object = value => !!value && typeof value === 'object' && !Array.isArray(value);
  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[character]));

  function formatYen(value) {
    const amount = Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
    return `${amount.toLocaleString('ja-JP')}円`;
  }

  function formatLifeDate(value) {
    if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) return '開始日は記録されていません';
    const date = new Date(value);
    return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日から暮らしています`;
  }

  function formatEventDate(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return '日付不明';
    const [year, month, day] = value.split('-').map(Number);
    return `${year}年${month}月${day}日`;
  }

  function createEventViewModel({ featureEnabled = true, loadResult, catWorld, catalog }) {
    if (!featureEnabled) return { status: 'disabled', message: '', recent: [], byCat: new Map() };
    if (!loadResult || loadResult.financialCorrupted === true || ['corrupted', 'storage_error'].includes(loadResult.status)) return { status: 'error', message: EVENT_ERROR_MESSAGE, recent: [], byCat: new Map() };
    if (loadResult.status === 'empty' || !object(loadResult.state)) return { status: 'empty', message: EVENT_EMPTY_MESSAGE, recent: [], byCat: new Map() };
    const financialRecords = loadResult.financialState?.records || [];
    if (!Array.isArray(financialRecords)) return { status: 'error', message: EVENT_ERROR_MESSAGE, recent: [], byCat: new Map() };
    const financialById = new Map();
    for (const record of financialRecords) {
      const projection = record?.projection, snapshot = record?.snapshot;
      if (!object(projection) || !object(snapshot) || snapshot.occurrenceId !== projection.occurrenceId || financialById.has(projection.occurrenceId) || !['normal', 'insufficient_funds_text', 'suppressed_missing_insufficient_text'].includes(snapshot.displayNarrativeMode)) return { status: 'error', message: EVENT_ERROR_MESSAGE, recent: [], byCat: new Map() };
      financialById.set(projection.occurrenceId, record);
    }
    for (const record of loadResult.state.history) {
      const projection = financialById.get(record.occurrenceId)?.projection;
      if (projection && (Object.keys(record).length !== Object.keys(projection).length || Object.keys(record).some(key => record[key] !== projection[key]))) return { status: 'error', message: EVENT_ERROR_MESSAGE, recent: [], byCat: new Map() };
    }
    const masters = Array.isArray(catWorld?.cats) ? catWorld.cats : [];
    const masterCats = new Map(masters.map(cat => [cat.id, cat]));
    const catalogCats = new Map((Array.isArray(catalog) ? catalog : []).map(cat => [cat.id, cat]));
    const items = loadResult.state.history.map(record => {
      const master = masterCats.get(record.catId), definition = master?.lifeEvents?.find(event => event.eventId === record.eventId), catalogCat = catalogCats.get(record.catId);
      const financial = financialById.get(record.occurrenceId);
      let narrative = definition?.narrative || '詳しい内容は確認できません。';
      if (financial?.snapshot.displayNarrativeMode === 'insufficient_funds_text') narrative = typeof definition?.insufficientFundsText === 'string' && definition.insufficientFundsText.trim() ? definition.insufficientFundsText : null;
      if (financial?.snapshot.displayNarrativeMode === 'suppressed_missing_insufficient_text') narrative = null;
      return {
        occurrenceId: record.occurrenceId,
        catId: record.catId,
        eventId: record.eventId,
        date: formatEventDate(record.localDayKey),
        occurredAt: record.occurredAt,
        catName: catalogCat?.name || master?.name || UNKNOWN_NAME,
        title: definition?.title || UNKNOWN_EVENT_TITLE,
        narrative,
        effectMode: financial ? 'financial_v1' : record.effectMode
      };
    }).sort((left, right) => Date.parse(right.occurredAt) - Date.parse(left.occurredAt) || right.occurrenceId.localeCompare(left.occurrenceId));
    const byCat = new Map();
    items.forEach(item => { if (!byCat.has(item.catId)) byCat.set(item.catId, []); if (byCat.get(item.catId).length < 5) byCat.get(item.catId).push(item); });
    return { status: items.length ? 'ready' : 'empty', message: items.length ? '' : EVENT_EMPTY_MESSAGE, recent: items.slice(0, 3), byCat };
  }

  function goalProgress(state) {
    const goal = object(state?.currentGoal) ? state.currentGoal : null;
    if (!goal) return null;
    const increase = Number(goal.requiredIncrease);
    const current = Number(state.currentBalance);
    const start = Number(goal.startBalance);
    const raw = increase > 0 ? ((current - start) / increase) * 100 : current >= Number(goal.targetBalance) ? 100 : 0;
    return Math.max(0, Math.min(100, Math.round(Number.isFinite(raw) ? raw : 0)));
  }

  function resolveGoal(master, state) {
    if (!object(state?.currentGoal)) return null;
    const definition = Array.isArray(master?.goals) ? master.goals.find(goal => goal.goalId === state.currentGoal.goalId) : null;
    return {
      title: definition?.title || '暮らしの目標を確認できません',
      targetBalance: state.currentGoal.targetBalance,
      remaining: Math.max(0, state.currentGoal.targetBalance - state.currentBalance),
      progress: goalProgress(state)
    };
  }

  function createCard(master, catalog, state, started, unknown = false) {
    const name = unknown ? UNKNOWN_NAME : (catalog?.name || master?.name || UNKNOWN_NAME);
    const worldName = unknown ? '記録に残る猫' : (master?.worldName || name);
    return {
      id: state?.catId || master?.id || '',
      known: !unknown,
      started,
      name,
      worldName,
      imagePath: unknown ? null : (catalog?.imagePath || null),
      description: unknown ? 'この猫の詳しい暮らしは、現在のデータでは確認できません。' : (master?.summary?.firstImpression || ''),
      role: unknown ? '' : (master?.summary?.role || ''),
      lifeStartedText: started ? formatLifeDate(state.lifeStartedAt) : 'まだ暮らしを始めていません',
      initialBalance: started ? state.initialBalance : null,
      currentBalance: started ? state.currentBalance : null,
      goal: started ? resolveGoal(master, state) : null,
      longTerm: started && state.currentGoal === null && state.longTermSavingMode?.active === true,
      state: started ? clone(state) : null
    };
  }

  function createViewModel({ featureEnabled = true, loadResult, collectionData, catWorld, catalog }) {
    if (!featureEnabled) return { status: 'disabled', cards: [], message: '' };
    if (!loadResult || loadResult.financialCorrupted === true || ['corrupted', 'storage_error'].includes(loadResult.status) || !object(loadResult.root)) return { status: 'error', cards: [], message: ERROR_MESSAGE };
    const masters = Array.isArray(catWorld?.cats) ? catWorld.cats : [];
    const catalogItems = Array.isArray(catalog) ? catalog : [];
    const catalogMap = new Map(catalogItems.map(cat => [cat.id, cat]));
    const records = object(collectionData?.cats) ? collectionData.cats : {};
    const states = object(loadResult.root.cats) ? loadResult.root.cats : {};
    const cards = [];
    for (const master of masters) {
      if (records[master.id]?.obtained !== true) continue;
      const state = states[master.id];
      cards.push(createCard(master, catalogMap.get(master.id), state, object(state), false));
    }
    const knownIds = new Set(masters.map(cat => cat.id));
    Object.keys(states).filter(catId => !knownIds.has(catId)).sort().forEach(catId => cards.push(createCard(null, null, states[catId], true, true)));
    const emptyRoot = loadResult.status === 'empty';
    return {
      status: emptyRoot ? 'empty' : 'ready',
      cards,
      message: emptyRoot ? EMPTY_MESSAGE : cards.length ? '' : '暮らしを表示できる猫はまだいません。'
    };
  }

  function imageMarkup(card) {
    const fallback = `<span class="cat-life-view-paw"${card.imagePath ? ' hidden' : ''} aria-hidden="true">🐾</span>`;
    if (!card.imagePath) return fallback;
    return `${fallback}<img src="./${escapeHtml(card.imagePath)}" alt="${escapeHtml(card.name)}" loading="lazy">`;
  }

  function bindImages(host) {
    host.querySelectorAll('.cat-life-view-image img').forEach(image => {
      const fallback = image.parentElement?.querySelector('.cat-life-view-paw');
      const loaded = () => { image.hidden = false; if (fallback) fallback.hidden = true; };
      const failed = () => { image.hidden = true; if (fallback) fallback.hidden = false; };
      image.addEventListener('load', loaded, { once: true });
      image.addEventListener('error', failed, { once: true });
      if (image.complete) image.naturalWidth > 0 ? loaded() : failed();
    });
  }

  function eventItemsMarkup(items) {
    return items.map(item => `<article class="cat-life-event"><time datetime="${escapeHtml(item.occurredAt)}">${escapeHtml(item.date)}</time><small>${escapeHtml(item.catName)}</small><h4>${escapeHtml(item.title)}</h4>${item.narrative === null ? '' : `<p>${escapeHtml(item.narrative)}</p>`}</article>`).join('');
  }

  function eventSectionMarkup(eventModel, items, perCat = false) {
    if (eventModel.status === 'disabled') return '';
    const message = eventModel.status === 'error' ? EVENT_ERROR_MESSAGE : EVENT_EMPTY_MESSAGE;
    return `<section class="cat-life-events${perCat ? ' is-detail' : ''}" aria-labelledby="${perCat ? 'catLifeDetailEventsTitle' : 'catLifeRecentEventsTitle'}"><h3 id="${perCat ? 'catLifeDetailEventsTitle' : 'catLifeRecentEventsTitle'}">最近のできごと</h3>${items.length ? `<div class="cat-life-event-list">${eventItemsMarkup(items)}</div>` : `<p class="cat-life-event-empty${eventModel.status === 'error' ? ' is-error' : ''}">${escapeHtml(message)}</p>`}</section>`;
  }

  function renderDetail(detail, card, eventModel) {
    const goal = card.goal;
    const goalBlock = !card.started
      ? '<section class="cat-life-view-goal"><h3>いまの暮らし</h3><p>まだ暮らしを始めていません。</p></section>'
      : card.longTerm
        ? '<section class="cat-life-view-goal"><h3>いまの暮らし</h3><p>のんびり貯金を続けています。</p></section>'
        : goal
          ? `<section class="cat-life-view-goal"><h3>いまの目標</h3><strong>${escapeHtml(goal.title)}</strong><div class="cat-life-view-progress" role="progressbar" aria-label="目標の進み具合 ${goal.progress}％" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${goal.progress}"><i style="width:${goal.progress}%"></i></div><dl><dt>目標の資産</dt><dd>${formatYen(goal.targetBalance)}</dd><dt>目標まで</dt><dd>あと${formatYen(goal.remaining)}</dd></dl></section>`
          : '<section class="cat-life-view-goal"><h3>いまの目標</h3><p>いまの目標はまだありません。</p></section>';
    const balances = card.started ? `<dl class="cat-life-view-balances"><dt>現在の資産</dt><dd>${formatYen(card.currentBalance)}</dd><dt>初期の資産</dt><dd>${formatYen(card.initialBalance)}</dd></dl>` : '';
    const events = eventModel.byCat.get(card.id) || [];
    detail.innerHTML = `<div class="cat-life-view-detail-card"><div class="cat-life-view-detail-hero"><div class="cat-life-view-image">${imageMarkup(card)}</div><div><small>${escapeHtml(card.worldName)}</small><h2 id="catLifeDetailTitle" tabindex="-1">${escapeHtml(card.name)}</h2><p>${escapeHtml(card.description)}</p></div></div>${card.role ? `<p class="cat-life-view-role"><b>暮らしの役割</b>${escapeHtml(card.role)}</p>` : ''}${balances}${goalBlock}${eventSectionMarkup(eventModel, events, true)}<p class="cat-life-view-started">${escapeHtml(card.lifeStartedText)}</p></div>`;
    bindImages(detail);
  }

  function createController(options) {
    const screen = options.screen;
    const list = options.list;
    const detail = options.detail;
    const status = options.status;
    const detailBack = options.detailBack;
    const homeBack = screen.querySelector('[data-nav="home"]');
    let cards = [];
    let eventModel = { status: 'disabled', message: '', recent: [], byCat: new Map() };
    let lastTrigger = null;

    function showList(focus = false) {
      detail.hidden = true;
      detailBack.hidden = true;
      if (homeBack) homeBack.hidden = false;
      list.hidden = false;
      if (focus && lastTrigger?.isConnected) lastTrigger.focus();
    }

    function openDetail(card, trigger) {
      lastTrigger = trigger || null;
      renderDetail(detail, card, eventModel);
      list.hidden = true;
      detail.hidden = false;
      detailBack.hidden = false;
      if (homeBack) homeBack.hidden = true;
      detail.querySelector('h2')?.focus?.();
      root.scrollTo?.(0, 0);
    }

    async function open() {
      options.navigate(screen.id);
      showList(false);
      status.classList.remove('is-error');
      status.textContent = '猫たちの暮らしを読み込んでいます。';
      list.innerHTML = '';
      try {
        const snapshot = typeof options.readSnapshot === 'function' ? await options.readSnapshot() : null;
        const runtime = snapshot ? snapshot.runtime : await options.loadRuntime();
        const loaded = snapshot ? snapshot.loaded : runtime.loadRoot(new Date().toISOString());
        const model = createViewModel({ featureEnabled: true, loadResult: loaded, collectionData: snapshot ? snapshot.collectionData : options.getCollection(), catWorld: runtime.catWorld, catalog: options.getCatalog() });
        if (snapshot) {
          eventModel = snapshot.eventLoadResult ? createEventViewModel({ loadResult: snapshot.eventLoadResult, catWorld: runtime.catWorld, catalog: options.getCatalog() }) : createEventViewModel({ featureEnabled: false });
        } else if (typeof options.loadEvents === 'function') {
          try { const eventRuntime = await options.loadEvents(); eventModel = createEventViewModel({ loadResult: eventRuntime.loadState(), catWorld: runtime.catWorld, catalog: options.getCatalog() }); }
          catch { eventModel = createEventViewModel({ loadResult: { status: 'storage_error', state: null }, catWorld: runtime.catWorld, catalog: options.getCatalog() }); }
        } else eventModel = createEventViewModel({ featureEnabled: false });
        cards = model.cards;
        status.textContent = model.message;
        status.classList.toggle('is-error', model.status === 'error');
        if (model.status === 'error') return model;
        const eventSection = eventSectionMarkup(eventModel, eventModel.recent);
        if (!cards.length) { list.innerHTML = eventSection; return { ...model, events: eventModel }; }
        list.innerHTML = `${eventSection}<div class="cat-life-view-cards">${cards.map((card, index) => `<button class="cat-life-view-card${card.started ? '' : ' is-unstarted'}" type="button" data-cat-life-index="${index}" aria-label="${escapeHtml(card.name)}の暮らしを見る"><span class="cat-life-view-image">${imageMarkup(card)}</span><span class="cat-life-view-card-copy"><b>${escapeHtml(card.name)}</b><small>${escapeHtml(card.worldName)}</small>${card.started ? `<strong>${formatYen(card.currentBalance)}</strong><em>${escapeHtml(card.longTerm ? 'のんびり貯金を続けています' : card.goal?.title || 'いまの目標はまだありません')}</em>` : '<em>まだ暮らしを始めていません</em>'}</span><span class="cat-life-view-chevron" aria-hidden="true">›</span></button>`).join('')}</div>`;
        bindImages(list);
        return { ...model, events: eventModel };
      } catch (error) {
        status.textContent = ERROR_MESSAGE;
        status.classList.add('is-error');
        return { status: 'error', cards: [], message: ERROR_MESSAGE, error };
      }
    }

    list.addEventListener('click', event => {
      const trigger = event.target.closest('[data-cat-life-index]');
      if (!trigger) return;
      const card = cards[Number(trigger.dataset.catLifeIndex)];
      if (card) openDetail(card, trigger);
    });
    detailBack.addEventListener('click', () => showList(true));
    screen.addEventListener('keydown', event => { if (event.key === 'Escape' && !detail.hidden) { event.preventDefault(); showList(true); } });
    return Object.freeze({ open, showList, openDetail });
  }

  function setup(options) {
    if (!options?.screen || !options.list || !options.detail || !options.status || !options.detailBack || (typeof options.loadRuntime !== 'function' && typeof options.readSnapshot !== 'function')) throw new TypeError('cat life view options are required');
    return createController(options);
  }

  return Object.freeze({ EMPTY_MESSAGE, ERROR_MESSAGE, EVENT_ERROR_MESSAGE, EVENT_EMPTY_MESSAGE, UNKNOWN_NAME, UNKNOWN_EVENT_TITLE, formatYen, formatLifeDate, formatEventDate, goalProgress, createViewModel, createEventViewModel, setup });
});
