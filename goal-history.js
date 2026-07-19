(() => {
  'use strict';

  const KEY = 'chokin-event-app.goalHistory.v1';
  const SCHEMA_VERSION = 1;
  const ICONS = Object.freeze({
    piggy:{label:'貯金箱',symbol:'🐷'}, game:{label:'ゲーム',symbol:'🎮'}, book:{label:'本',symbol:'📚'},
    bicycle:{label:'自転車',symbol:'🚲'}, toy:{label:'おもちゃ',symbol:'🧸'}, clothes:{label:'服',symbol:'👕'},
    travel:{label:'旅行',symbol:'✈️'}, gift:{label:'プレゼント',symbol:'🎁'}, device:{label:'パソコン・スマートフォン',symbol:'💻'},
    other:{label:'その他',symbol:'⭐'}
  });

  let navigate = () => {};
  let setupDone = false;
  let selectedId = null;
  let returnScreen = 'goal';
  const $ = selector => document.querySelector(selector);
  const yen = amount => `¥${Number(amount || 0).toLocaleString('ja-JP')}`;
  const validDateTime = value => typeof value === 'string' && value !== '' && !Number.isNaN(new Date(value).getTime());
  const validDeadline = value => {
    if (value === null) return true;
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const [year,month,day] = value.split('-').map(Number), date = new Date(year,month-1,day);
    return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
  };
  const validInteger = (value, minimum=0) => Number.isSafeInteger(value) && value >= minimum;

  function validateItem(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const name = typeof value.name === 'string' ? value.name.trim() : '';
    if (typeof value.id !== 'string' || !value.id || typeof value.sourceGoalFingerprint !== 'string' || !value.sourceGoalFingerprint) return null;
    if (!name || name.length > 30 || !Object.hasOwn(ICONS,value.icon)) return null;
    if (!validInteger(value.targetAmount,1) || !validInteger(value.initialAmount) || !validInteger(value.progressAtArchive)) return null;
    if (!validDateTime(value.createdAt) || value.achievedAt !== null && !validDateTime(value.achievedAt) || !validDateTime(value.archivedAt)) return null;
    if (!validDeadline(value.deadline) || typeof value.memo !== 'string' || value.memo.length > 200) return null;
    return {
      id:value.id,
      sourceGoalFingerprint:value.sourceGoalFingerprint,
      name,
      icon:value.icon,
      targetAmount:value.targetAmount,
      initialAmount:value.initialAmount,
      progressAtArchive:value.progressAtArchive,
      createdAt:value.createdAt,
      achievedAt:value.achievedAt,
      archivedAt:value.archivedAt,
      deadline:value.deadline,
      memo:value.memo
    };
  }

  function validateData(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value) || value.schemaVersion !== SCHEMA_VERSION || !Array.isArray(value.items)) return null;
    const fingerprints = new Set(), ids = new Set(), items = [];
    value.items.forEach(candidate => {
      const item = validateItem(candidate);
      if (!item || ids.has(item.id) || fingerprints.has(item.sourceGoalFingerprint)) return;
      ids.add(item.id); fingerprints.add(item.sourceGoalFingerprint); items.push(item);
    });
    return {schemaVersion:SCHEMA_VERSION,items};
  }

  function readData() {
    const raw = localStorage.getItem(KEY);
    if (raw === null) return {schemaVersion:SCHEMA_VERSION,items:[]};
    try { return validateData(JSON.parse(raw)) || {schemaVersion:SCHEMA_VERSION,items:[]}; }
    catch { return {schemaVersion:SCHEMA_VERSION,items:[]}; }
  }

  function readWritableData() {
    const raw = localStorage.getItem(KEY);
    if (raw === null) return {schemaVersion:SCHEMA_VERSION,items:[],validItems:[]};
    let parsed;
    try { parsed = JSON.parse(raw); } catch { throw new Error('達成アルバムの保存データを読み込めません。'); }
    if (!parsed || typeof parsed !== 'object' || parsed.schemaVersion !== SCHEMA_VERSION || !Array.isArray(parsed.items)) throw new Error('達成アルバムの保存形式が異なります。');
    return {schemaVersion:SCHEMA_VERSION,items:parsed.items,validItems:validateData(parsed)?.items || []};
  }

  const sourceFingerprint = goal => typeof goal?.id === 'string' && goal.id ? `id:${goal.id}` : `v1:${JSON.stringify([goal?.createdAt || '',goal?.itemName || '',goal?.targetAmount || 0])}`;
  function achievedAtFor(goal, entries) {
    if (validDateTime(goal?.achievedAt)) return goal.achievedAt;
    if (!validDateTime(goal?.createdAt)) return null;
    if (goal.startingAmount >= goal.targetAmount) return goal.createdAt;
    const created = new Date(goal.createdAt).getTime();
    const saves = (Array.isArray(entries) ? entries : []).filter(entry => {
      const time = new Date(entry?.createdAt).getTime();
      return entry?.type === 'save' && validInteger(entry.amount,1) && Number.isFinite(time) && time >= created;
    }).sort((a,b)=>new Date(a.createdAt)-new Date(b.createdAt));
    let total = goal.startingAmount;
    for (const entry of saves) {
      total = Math.min(Number.MAX_SAFE_INTEGER,total + entry.amount);
      if (total >= goal.targetAmount) return entry.createdAt;
    }
    return null;
  }

  function archiveGoal(goal, progressAtArchive, entries) {
    if (!goal || !validInteger(goal.targetAmount,1) || !validInteger(goal.startingAmount) || !validInteger(progressAtArchive) || progressAtArchive < goal.targetAmount) throw new Error('達成済みの目標ではありません。');
    const writable = readWritableData(), fingerprint = sourceFingerprint(goal);
    const duplicate = writable.validItems.find(item=>item.sourceGoalFingerprint===fingerprint);
    if (duplicate) return {added:false,item:structuredClone(duplicate)};
    const now = new Date().toISOString();
    const item = validateItem({
      id:crypto.randomUUID?.() || `goal-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      sourceGoalFingerprint:fingerprint,
      name:goal.itemName,
      icon:goal.icon,
      targetAmount:goal.targetAmount,
      initialAmount:goal.startingAmount,
      progressAtArchive,
      createdAt:goal.createdAt,
      achievedAt:achievedAtFor(goal,entries),
      archivedAt:now,
      deadline:goal.deadline || null,
      memo:goal.memo || ''
    });
    if (!item) throw new Error('達成履歴を作成できません。');
    localStorage.setItem(KEY,JSON.stringify({schemaVersion:SCHEMA_VERSION,items:[item,...writable.items]}));
    return {added:true,item:structuredClone(item)};
  }

  const formatDate = value => validDateTime(value) ? new Date(value).toLocaleDateString('ja-JP',{year:'numeric',month:'long',day:'numeric'}) : null;
  const localDayNumber = value => {
    if (!validDateTime(value)) return null;
    const date = new Date(value);
    return Date.UTC(date.getFullYear(),date.getMonth(),date.getDate()) / 86400000;
  };
  function achievementDays(item) {
    const start = localDayNumber(item.createdAt), end = localDayNumber(item.achievedAt);
    if (start === null || end === null || end < start) return null;
    const days = end - start;
    return days === 0 ? '当日達成' : `達成まで${days}日`;
  }
  const achievedDateText = item => item.achievedAt ? `${formatDate(item.achievedAt)}達成` : '達成日を確認できません';
  const element = (tag,className,text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };

  function sortedItems() {
    return readData().items.slice().sort((a,b)=>{
      const aTime = new Date(a.achievedAt || a.archivedAt).getTime(), bTime = new Date(b.achievedAt || b.archivedAt).getTime();
      return bTime - aTime;
    });
  }

  function historyCard(item) {
    const button = element('button','goal-history-card');
    button.type = 'button'; button.dataset.goalHistoryItem = item.id;
    const icon = element('span','goal-history-icon',ICONS[item.icon].symbol); icon.setAttribute('aria-hidden','true');
    const copy = element('span','goal-history-copy');
    copy.append(element('b','',item.name),element('strong','',`目標　${yen(item.targetAmount)}`),element('small','',achievedDateText(item)));
    const days = achievementDays(item);
    if (days) copy.append(element('small','goal-history-days',days));
    if (item.progressAtArchive > item.targetAmount) copy.append(element('small','goal-history-over',`終了時の到達額　${yen(item.progressAtArchive)}`));
    button.append(icon,copy,element('span','goal-history-chevron','›'));
    return button;
  }

  function renderAlbum() {
    const list = $('#goalAlbumList'), count = $('#goalAlbumCount');
    if (!list || !count) return;
    const items = sortedItems();
    count.textContent = `${items.length}件`;
    list.replaceChildren();
    if (!items.length) {
      const empty = element('section','goal-history-empty');
      empty.append(element('span','goal-history-empty-icon','🏆'),element('h3','', 'まだ達成した目標はありません'),element('p','', '最初の目標達成を楽しみにしよう！'));
      const create = element('button','submit','目標を設定する'); create.type='button'; create.dataset.goalCreate='';
      empty.append(create); list.append(empty); return;
    }
    items.forEach(item=>list.append(historyCard(item)));
  }

  function detailRow(label,value) {
    const row = element('div','goal-history-detail-row');
    row.append(element('dt','',label),element('dd','',value));
    return row;
  }

  function openDetail(id) {
    const item = readData().items.find(candidate=>candidate.id===id), dialog=$('#goalHistoryDetail'), body=$('#goalHistoryDetailBody');
    if (!item || !dialog || !body) return;
    selectedId = item.id; body.replaceChildren();
    const icon = element('span','goal-history-detail-icon',ICONS[item.icon].symbol); icon.setAttribute('aria-hidden','true');
    body.append(icon,element('small','goal-history-detail-label','達成した目標'),element('h3','',item.name));
    const values = document.createElement('dl');
    values.append(detailRow('目標金額',yen(item.targetAmount)),detailRow('終了時の到達額',yen(item.progressAtArchive)),detailRow('すでに貯めていた金額',yen(item.initialAmount)),detailRow('目標作成日',formatDate(item.createdAt)),detailRow('達成日',item.achievedAt ? formatDate(item.achievedAt) : '達成日を確認できません'));
    const days = achievementDays(item); if (days) values.append(detailRow('達成まで',days));
    if (item.deadline) values.append(detailRow('期限',item.deadline.replace(/^(\d{4})-(\d{2})-(\d{2})$/,'$1年$2月$3日')));
    if (item.memo) values.append(detailRow('メモ',item.memo));
    values.append(detailRow('アルバム保存日',formatDate(item.archivedAt)));
    body.append(values);
    if (!dialog.open) dialog.showModal();
  }

  function deleteSelected() {
    if (!selectedId) return;
    const writable = readWritableData(), before = writable.validItems.find(item=>item.id===selectedId);
    if (!before) return;
    localStorage.setItem(KEY,JSON.stringify({schemaVersion:SCHEMA_VERSION,items:writable.items.filter(item=>item?.id!==selectedId)}));
    selectedId=null;
    $('#goalHistoryDeleteDialog')?.close(); $('#goalHistoryDetail')?.close();
    renderAlbum(); refreshLinks(); window.ChokinBadges?.evaluate?.();
  }

  function refreshLinks() {
    window.ChokinSavingsGoal?.renderHome?.();
    window.ChokinSavingsGoal?.renderFormHistoryLink?.();
    if ($('#goal')?.classList.contains('active')) window.ChokinSavingsGoal?.renderDetail?.();
  }

  function setup(options={}) {
    if (setupDone) return; setupDone=true; navigate=options.navigate || navigate;
    document.addEventListener('click',event=>{
      const opener=event.target.closest('[data-goal-history-open]');
      if (opener) {
        const active=document.querySelector('.screen.active')?.id;
        if (active==='goal'||active==='goal-form') returnScreen=active;
        renderAlbum(); navigate('goal-album');
      }
      if (event.target.closest('[data-goal-history-back]')) {
        const destination=returnScreen==='goal-form'?'goal-form':'goal';
        navigate(destination);
        setTimeout(()=>document.querySelector(`#${destination} [data-goal-history-open]`)?.focus(),0);
      }
      const card=event.target.closest('[data-goal-history-item]'); if(card)openDetail(card.dataset.goalHistoryItem);
    });
    $('#closeGoalHistoryDetail').onclick=()=>$('#goalHistoryDetail').close();
    $('#deleteGoalHistory').onclick=()=>{
      const item=readData().items.find(candidate=>candidate.id===selectedId); if(!item)return;
      $('#goalHistoryDeleteName').textContent=item.name;
      const dialog=$('#goalHistoryDeleteDialog'); if(!dialog.open)dialog.showModal();
    };
    $('#cancelGoalHistoryDelete').onclick=()=>$('#goalHistoryDeleteDialog').close();
    $('#confirmGoalHistoryDelete').onclick=()=>{try{deleteSelected();}catch{alert('達成記録を削除できませんでした。');}};
    $('#goalHistoryDetail').addEventListener('click',event=>{if(event.target===$('#goalHistoryDetail'))$('#goalHistoryDetail').close();});
  }

  function importData(value) {
    if (value === null) { localStorage.removeItem(KEY); refreshLinks(); return true; }
    const valid = validateData(value); if (!valid) return false;
    localStorage.setItem(KEY,JSON.stringify(valid)); refreshLinks(); return true;
  }
  const exportData = () => structuredClone(readData());
  const restoreRaw = raw => { if (raw === null) localStorage.removeItem(KEY); else localStorage.setItem(KEY,raw); };
  const onNavigate = id => { if (id !== 'goal-album') { $('#goalHistoryDetail')?.close(); $('#goalHistoryDeleteDialog')?.close(); } };

  window.ChokinGoalHistory = Object.freeze({
    setup,renderAlbum,archiveGoal,exportData,importData,onNavigate,refreshLinks,
    getCount:()=>readData().items.length,
    getStorageKey:()=>KEY,
    getRaw:()=>localStorage.getItem(KEY),
    restoreRaw
  });
})();
