(() => {
  'use strict';
  const KEY = 'chokin-event-app.v0.1';
  const RECOVERY_KEY = `${KEY}.recovery`;
  const APP_VERSION = '0.9.6';
  const GUIDE_KEY = 'chokin-event-app.firstGuide.v0.8.1';
  const BACKUP_VERSION = 1;
  const DEFAULT_QUICK_AMOUNTS = [100, 500, 1000, 3000, 5000];
  const SAVE_RANKS = Object.freeze([
    {key:'choko',min:1,max:49,label:'ちょこっと貯金！',level:0,minCats:1,maxCats:1},
    {key:'nice',min:50,max:99,label:'いい貯金！',level:1,minCats:1,maxCats:1},
    {key:'great',min:100,max:299,label:'GREAT SAVE!',level:2,minCats:1,maxCats:2},
    {key:'super',min:300,max:499,label:'SUPER SAVE!',level:3,minCats:2,maxCats:2},
    {key:'ultra',min:500,max:999,label:'ULTRA SAVE!',level:4,minCats:2,maxCats:3},
    {key:'fever',min:1000,max:Infinity,label:'FEVER SAVE!',level:5,minCats:3,maxCats:3}
  ]);
  const defaults = {version: 1, entries: [], settings: {sound: true, vibration: true, effects: true}, futureSettings: {}, quickAmounts: DEFAULT_QUICK_AMOUNTS};
  let state; let formMode = 'save'; let deletingId = null; let revengeAmount = 0; let quickLocked = false; let gachaLocked = false; let pendingQuickId = null; let undoTimer = null; let amountAnimationToken = 0; let previewActive = false; let collectionFilter = 'all';
  const $ = s => document.querySelector(s);
  const yen = n => `¥${Number(n || 0).toLocaleString('ja-JP')}`;
  const coinIcon = (kind='cat') => window.ChokinVisualAssets?.coinMarkup(kind) || '🪙';
  const saveRankFor = amount => SAVE_RANKS.find(rank=>amount>=rank.min&&amount<=rank.max)||SAVE_RANKS[0];
  const categoryNames = {regret:'後悔散財', necessary:'必要経費', best:'最高の散財'};
  const saveState = () => localStorage.setItem(KEY, JSON.stringify(state));
  const validEntry = entry => entry && typeof entry.id === 'string' && (entry.type === 'save' || entry.type === 'spend') && Number.isInteger(entry.amount) && entry.amount > 0 && typeof entry.createdAt === 'string' && (entry.type === 'save' ? entry.category === null : ['regret','necessary','best'].includes(entry.category)) && typeof entry.memo === 'string';
  const validQuickAmounts = values => Array.isArray(values) && values.length === 5 && values.every(value => Number.isInteger(value) && value > 0);
  const backupPayload = () => ({backupVersion: BACKUP_VERSION, exportedAt: new Date().toISOString(), appVersion: APP_VERSION, data: {version: state.version, entries: state.entries, settings: state.settings, futureSettings: state.futureSettings || {}, quickAmounts: state.quickAmounts, catCollection: window.ChokinCollection.exportData(), catCoins: window.ChokinCoins.exportData()}});
  function exportBackup() {
    const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '_').slice(0, 13);
    const blob = new Blob([JSON.stringify(backupPayload(), null, 2)], {type: 'application/json'});
    const url = URL.createObjectURL(blob), link = document.createElement('a');
    link.href = url; link.download = `chokin-backup_${stamp}.json`; link.click(); URL.revokeObjectURL(url);
  }
  function importBackup(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const backup = JSON.parse(String(reader.result));
        if (!backup || backup.backupVersion !== BACKUP_VERSION || !backup.data || !Array.isArray(backup.data.entries) || !backup.data.entries.every(validEntry) || !backup.data.settings || typeof backup.data.settings !== 'object') throw new Error('形式が異なります');
        if (!confirm('現在の記録は、読み込んだバックアップ内容で置き換えられます。続行しますか？')) return;
        state = {version: Number.isInteger(backup.data.version) ? backup.data.version : 1, entries: backup.data.entries, settings: {...defaults.settings, ...backup.data.settings}, futureSettings: backup.data.futureSettings && typeof backup.data.futureSettings === 'object' ? backup.data.futureSettings : {}, quickAmounts: validQuickAmounts(backup.data.quickAmounts) ? backup.data.quickAmounts : [...DEFAULT_QUICK_AMOUNTS]};
        window.ChokinCollection.importData(backup.data.catCollection || null);if(backup.data.catCoins){window.ChokinCoins.importData(backup.data.catCoins);window.ChokinCoins.grantWelcome();}else window.ChokinCoins.importData({schemaVersion:1,welcomeCoinGranted:true}); saveState(); render(); alert('バックアップを読み込みました。');
      } catch { alert('バックアップを読み込めませんでした。正しい貯金アプリのJSONファイルを選択してください。'); }
    };
    reader.onerror = () => alert('ファイルを読み込めませんでした。'); reader.readAsText(file, 'utf-8');
  }
  const load = () => {
    const raw = localStorage.getItem(KEY);
    if (raw === null) { state = structuredClone(defaults); return; }
    try {
      const saved = JSON.parse(raw);
      state = {...defaults, ...saved, settings: {...defaults.settings, ...(saved?.settings || {})}, quickAmounts: validQuickAmounts(saved?.quickAmounts) ? saved.quickAmounts : [...DEFAULT_QUICK_AMOUNTS]};
    } catch {
      try { localStorage.setItem(`${RECOVERY_KEY}.${Date.now()}`, raw); } catch {}
      state = structuredClone(defaults);
    }
  };
  const isThisMonth = iso => { const d = new Date(iso), n = new Date(); return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth(); };
  function render() {
    const month = state.entries.filter(x => isThisMonth(x.createdAt));
    const sum = (type, cat) => month.filter(x => x.type === type && (!cat || x.category === cat)).reduce((a,x)=>a+x.amount,0);
    const saving = sum('save'), regret = sum('spend','regret');
    $('#monthSave').textContent = yen(saving); $('#monthRegret').textContent = yen(regret); $('#monthNecessary').textContent = yen(sum('spend','necessary')); $('#monthBest').textContent = yen(sum('spend','best'));
    $('#futureScore').textContent = yen(saving-regret); $('#totalSave').textContent = yen(state.entries.filter(x=>x.type==='save').reduce((a,x)=>a+x.amount,0));
    const collectionStats=window.ChokinCollection.getStats(),progress=$('#homeCollectionProgress b');if(progress)progress.textContent=`${collectionStats.obtained} / ${collectionStats.total}匹`;
    renderList($('#recentList'), state.entries.slice(0,4)); renderList($('#historyList'), state.entries); renderQuickButtons();
    Object.entries(state.settings).forEach(([k,v]) => { $(`#${k}`).checked = v; });
    document.querySelectorAll('[data-quick-input]').forEach((input, index) => { input.value = state.quickAmounts[index]; });
    renderCollection(); renderCoins();
  }
  function renderQuickButtons() {
    const container = $('#quickButtons'); if (!container) return;
    container.innerHTML = state.quickAmounts.map((amount, index) => `<button class="quick-button" data-quick="${amount}" ${quickLocked ? 'disabled' : ''}>＋${yen(amount).replace('¥','')}円</button>`).join('');
  }
  function renderCoins(){const coin=window.ChokinCoins.getState(),button=$('#catGacha');$('#coinBalance').innerHTML=`${coinIcon()} ${coin.balance}`;$('#dailyCoinStatus').textContent=`本日のねこコイン：${window.ChokinCoins.hasDailyAward()?'獲得済み':'未獲得'}`;button.disabled=gachaLocked||coin.balance<1;$('#coinHint').textContent=coin.balance<1?'ねこコインがありません。今日初めて貯金すると1枚獲得できます。':'';}
  function scheduleCoinDayRefresh(){
    const now=new Date(),next=new Date(now.getFullYear(),now.getMonth(),now.getDate()+1);
    setTimeout(()=>{renderCoins();scheduleCoinDayRefresh();},Math.max(1000,next.getTime()-now.getTime()+1000));
  }
  function showWelcomeCoin(){const toast=document.createElement('div');toast.className='coin-welcome-toast';toast.innerHTML=`<b>ウェルカムねこコイン</b><strong>${coinIcon()} ＋1</strong>`;document.body.append(toast);setTimeout(()=>toast.remove(),3600);}
  function showQuickUndo(entry) {
    const toast = $('#quickUndo'); if (!pendingQuickId || pendingQuickId !== entry.id) return;
    clearTimeout(undoTimer); $('#quickUndoText').textContent = `${yen(entry.amount)}を貯金しました`;
    toast.hidden = false; undoTimer = setTimeout(() => { toast.hidden = true; pendingQuickId = null; }, 5000);
  }
  function quickSave(amount) {
    if (quickLocked || !Number.isInteger(amount) || amount <= 0) return;
    quickLocked = true; renderQuickButtons();
    const entry = {id:crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`, type:'save', amount, category:null, memo:'', createdAt:new Date().toISOString(), quick:true};
    state.entries.unshift(entry); pendingQuickId = entry.id; saveState(); const dailyCoinAwarded=window.ChokinCoins.awardDaily(); enhancedCelebrate(entry,null,false,null,{dailyCoinAwarded});
  }
  function renderList(el, entries) {
    el.innerHTML = entries.length ? entries.map(x => `<article class="record"><div><b>${x.type==='save'?'貯金':categoryNames[x.category]}</b> <span class="tag">${x.type==='save'?'未来へ':x.category==='regret'?'記録済み':categoryNames[x.category]}</span><small>${new Date(x.createdAt).toLocaleString('ja-JP',{dateStyle:'short',timeStyle:'short'})}${x.memo ? `　${escapeHtml(x.memo)}` : ''}</small></div><div><b>${yen(x.amount)}</b>${el.id==='historyList'?` <button class="delete" aria-label="削除" data-delete="${x.id}">×</button>`:''}</div></article>`).join('') : '<p class="sub">まだ記録はありません。最初のイベントを起こしましょう。</p>';
  }
  const escapeHtml = t => String(t).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  function renderCollection() {
    const statsHost=$('#collectionStats'),grid=$('#collectionGrid');if(!statsHost||!grid||!window.ChokinCats)return;
    const cats=window.ChokinCats.all.filter(cat=>cat.enabled!==false).slice().sort((a,b)=>a.sortOrder-b.sortOrder),stats=window.ChokinCollection.getStats();
    statsHost.innerHTML=`<div class="collection-summary"><div class="collection-total"><div><span>取得猫</span><strong>${stats.obtained} / ${stats.total}匹</strong></div><b>猫メダル：${stats.totalCatMedals}</b></div><div class="collection-progress" aria-label="コンプリート率 ${stats.percent}％"><i style="width:${stats.percent}%"></i></div><div class="collection-rarities">${Object.entries(stats.byRarity).map(([rarity,value])=>`<span>${rarity}　${value.obtained} / ${value.total}</span>`).join('')}</div></div>`;
    const filtered=cats.filter(cat=>{const obtained=window.ChokinCollection.isObtained(cat.id);return collectionFilter==='all'||collectionFilter==='obtained'&&obtained||collectionFilter==='unobtained'&&!obtained||cat.rarity===collectionFilter;});
    grid.innerHTML=filtered.length?filtered.map(cat=>{const record=window.ChokinCollection.getRecord(cat.id),obtained=record.obtained;return `<button class="collection-card ${obtained?'obtained':'unobtained'}" data-collection-cat="${cat.id}" style="--cat-theme:${cat.themeColor};--cat-accent:${cat.accentColor}"><span class="collection-fallback">CAT</span><img src="./${cat.imagePath}" alt="${obtained?escapeHtml(cat.name):''}" onerror="this.hidden=true">${obtained?'<em>取得済み</em>':''}<b>${obtained?escapeHtml(cat.name):'？？？'}</b><small>${cat.rarity}${obtained?`・登場${record.obtainedCount}回`:'・未取得'}</small></button>`;}).join(''):'<p class="sub">該当する猫はいません。</p>';
    document.querySelectorAll('[data-collection-filter]').forEach(button=>button.classList.toggle('active',button.dataset.collectionFilter===collectionFilter));
  }
  function openCollectionDetail(catId) {
    const cat=window.ChokinCats.get(catId),record=window.ChokinCollection.getRecord(catId);if(!record.obtained)return;
    const date=record.firstObtainedAt?new Date(record.firstObtainedAt).toLocaleString('ja-JP',{dateStyle:'medium',timeStyle:'short'}):'―';
    $('#collectionDetailBody').innerHTML=`<div style="--cat-accent:${cat.accentColor}"><img src="./${cat.imagePath}" alt="${escapeHtml(cat.name)}" onerror="this.hidden=true"><small>${cat.rarity}</small><h3>${escapeHtml(cat.name)}</h3><p>${escapeHtml(cat.message)}</p><dl><dt>初取得</dt><dd>${date}</dd><dt>初取得金額</dt><dd>${record.firstAmount?yen(record.firstAmount):'―'}</dd><dt>累計登場</dt><dd>${record.obtainedCount}回</dd><dt>重複</dt><dd>${record.duplicateCount}回</dd><dt>獲得メダル</dt><dd>${record.medalsEarned}枚</dd><dt>FEVER</dt><dd>${escapeHtml(cat.feverTitle)}</dd></dl></div>`;$('#collectionDetail').showModal();
  }
  function navigate(id) { document.querySelectorAll('.screen').forEach(x=>x.classList.toggle('active',x.id===id)); window.scrollTo(0,0); if(id==='history'||id==='collection') render(); }
  function openForm(mode, preset=0) { formMode=mode; $('#formTitle').textContent=mode==='save'?'貯金する':'お金を使った'; $('#categoryWrap').hidden=mode==='save'; $('#amount').value=preset||''; $('#memo').value=''; $('#entryForm .submit').textContent=mode==='save'?'記録して、イベントを起こす':'記録して、イベントを起こす'; navigate('form'); setTimeout(()=>$('#amount').focus(),50); }
  function sound(kind) { if(!state.settings.sound || !window.AudioContext) return; try { const c=new AudioContext(), o=c.createOscillator(), g=c.createGain(); o.connect(g);g.connect(c.destination);o.frequency.value=kind==='regret'?160:kind==='best'?520:760;g.gain.setValueAtTime(.001,c.currentTime);g.gain.exponentialRampToValueAtTime(.12,c.currentTime+.02);g.gain.exponentialRampToValueAtTime(.001,c.currentTime+.45);o.start();o.stop(c.currentTime+.46); } catch {} }
  function haptic(kind) { if(state.settings.vibration && navigator.vibrate) navigator.vibrate(kind==='regret'?[80,60,80]:[35,35,70]); }
  function stageSound(rarity, confirmed, tierLevel=0) { if(!state.settings.sound||!window.AudioContext)return; try{const context=new AudioContext(),rank=Math.max(['NORMAL','RARE','SUPER','ULTRA','LEGEND'].indexOf(rarity),Math.max(0,tierLevel-1)),tone=(frequency,start,duration,gain=.08)=>{const oscillator=context.createOscillator(),volume=context.createGain();oscillator.connect(volume);volume.connect(context.destination);oscillator.type=rank>=3?'sawtooth':'sine';oscillator.frequency.setValueAtTime(frequency,context.currentTime+start);volume.gain.setValueAtTime(.001,context.currentTime+start);volume.gain.exponentialRampToValueAtTime(gain,context.currentTime+start+.02);volume.gain.exponentialRampToValueAtTime(.001,context.currentTime+start+duration);oscillator.start(context.currentTime+start);oscillator.stop(context.currentTime+start+duration+.02);};tone(330,0,.16,.05);tone(440,.48,.18,.055);if(confirmed||tierLevel>=4)tone(880,1.35,.16,.07);[523,659,784].slice(0,rank>=3?3:2).forEach((frequency,index)=>tone(frequency,2.12+index*.05,.55,.08+Math.min(3,tierLevel)*.008));}catch{} }
  function stageHaptic(rarity, tierLevel=0) { if(!state.settings.vibration||!navigator.vibrate)return; const strong=['ULTRA','LEGEND'].includes(rarity)||tierLevel>=4,fever=tierLevel>=5;navigator.vibrate(fever?[30,80,45,110,90,40,130]:strong?[25,160,35,700,90,35,140]:tierLevel>=2?[20,130,30,260,65]:[20,190,25,850,70]); }
  const pick = a => a[Math.floor(Math.random()*a.length)];
  const sceneSvg = (className, content) => `<svg class="scene-svg ${className}" viewBox="0 0 400 520" role="img" aria-label="${className.replace('-scene','')}演出"><defs><linearGradient id="goldMetal" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#fff3a3"/><stop offset=".48" stop-color="#f7b52c"/><stop offset="1" stop-color="#9a4f09"/></linearGradient><linearGradient id="catFur" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#fff4dc"/><stop offset="1" stop-color="#df9f65"/></linearGradient><radialGradient id="spaceCore"><stop stop-color="#fff"/><stop offset=".25" stop-color="#9ee5ff"/><stop offset=".7" stop-color="#7865e8" stop-opacity=".7"/><stop offset="1" stop-color="#171342" stop-opacity="0"/></radialGradient></defs>${content}</svg>`;
  const catBodySvg = (className='cat-body') => `<g class="${className}"><ellipse class="cat-shadow" cx="205" cy="420" rx="104" ry="22" fill="#000" opacity=".32"/><path class="cat-tail ink" d="M118 364C48 357 54 284 94 300C120 310 88 339 73 319" fill="none" stroke="#c8814f" stroke-width="26"/><ellipse class="ink" cx="202" cy="351" rx="91" ry="81" fill="url(#catFur)"/><path class="ink" d="M124 246L139 161L187 201C198 197 211 197 223 201L269 161L282 247Z" fill="url(#catFur)"/><ellipse class="ink" cx="203" cy="252" rx="86" ry="71" fill="url(#catFur)"/><path d="M142 205L149 180L172 204" fill="#e89e9e"/><path d="M237 204L260 180L267 208" fill="#e89e9e"/><g class="cat-eyes" fill="#291b22"><ellipse cx="171" cy="244" rx="8" ry="12"/><ellipse cx="236" cy="244" rx="8" ry="12"/></g><path class="fine" d="M196 267Q203 274 210 267M203 274V282M203 282Q190 290 181 280M203 282Q216 291 226 280" fill="none" stroke="#291b22" stroke-width="5" stroke-linecap="round"/><path d="M196 264L210 264L203 273Z" fill="#d97878"/><path class="fine" d="M155 269L113 259M155 280L109 283M250 269L293 258M250 280L298 284" stroke="#291b22" stroke-width="5" stroke-linecap="round"/><path class="cat-paw ink" d="M248 356Q294 322 304 349Q308 374 262 388" fill="url(#catFur)"/><path class="ink" d="M158 395Q153 430 175 436M239 395Q244 430 223 436" fill="none" stroke="#291b22" stroke-width="22"/></g>`;
  const buildSceneVisual = (showName, type) => {
    if (showName.includes('legendary')) return sceneSvg('temple-scene', `<g class="temple" fill="#34213d" stroke="#f2cc7a" stroke-width="7"><path d="M45 186L200 72L355 186Z"/><path d="M61 194H339V219H61Z"/><path d="M74 219H115V440H74ZM145 219H181V440H145ZM219 219H255V440H219ZM285 219H326V440H285Z"/><path d="M45 440H355V474H45Z"/></g><g class="god-rays" stroke="#ffe990" stroke-width="10" opacity=".72">${Array.from({length:12},(_,i)=>`<line x1="200" y1="210" x2="200" y2="35" transform="rotate(${i*30} 200 210)"/>`).join('')}</g><g class="maneki">${catBodySvg('cat-body')}<circle class="ink" cx="203" cy="352" r="32" fill="#f4c739"/><path d="M185 352H221M203 334V370" stroke="#8e4c0b" stroke-width="7"/><path class="maneki-paw ink" d="M269 329Q310 260 330 282Q340 310 286 360" fill="url(#catFur)"/></g><g class="seal"><circle cx="317" cy="414" r="44" fill="#a7192f" stroke="#ffe392" stroke-width="7"/><path d="M295 415H339M317 393V437" stroke="#ffe7ab" stroke-width="8"/></g>`);
    if (showName === 'gold') return sceneSvg('gold-scene', `<g class="light-seed"><circle cx="200" cy="255" r="12" fill="#fff"/><circle cx="200" cy="255" r="38" fill="#ffe77b" opacity=".25"/></g><g class="burst-rays" stroke="#ffd33d" stroke-width="13" stroke-linecap="round">${Array.from({length:16},(_,i)=>`<line x1="200" y1="91" x2="200" y2="28" transform="rotate(${i*22.5} 200 255)"/>`).join('')}</g><g class="burst-core"><circle cx="200" cy="255" r="118" fill="#ffb51d" opacity=".18"/><circle class="ink" cx="200" cy="255" r="82" fill="url(#goldMetal)"/><path d="M200 190L217 233L264 236L227 266L238 312L200 286L162 312L173 266L136 236L183 233Z" fill="#fff2a0"/></g><g class="laurel" fill="none" stroke="#ffd45a" stroke-width="11" stroke-linecap="round"><path d="M92 335Q63 273 91 212M308 335Q337 273 309 212"/><path d="M91 315L55 298M86 276L50 258M91 236L61 214M309 315L345 298M314 276L350 258M309 236L339 214"/></g>`);
    if (showName === 'cosmic') return sceneSvg('cosmic-scene', `<g class="warp-lines" stroke="#b9dfff" stroke-width="4" opacity=".8">${Array.from({length:14},(_,i)=>`<line class="warp-line" x1="200" y1="255" x2="${20+(i%7)*60}" y2="${20+Math.floor(i/7)*450}" style="animation-delay:${.1+(i%5)*.05}s"/>`).join('')}</g><g class="galaxy"><ellipse cx="200" cy="255" rx="150" ry="62" fill="none" stroke="#8b6cff" stroke-width="22" opacity=".45" transform="rotate(-18 200 255)"/><ellipse cx="200" cy="255" rx="112" ry="42" fill="none" stroke="#8fdcff" stroke-width="13" opacity=".7" transform="rotate(22 200 255)"/><circle cx="200" cy="255" r="86" fill="url(#spaceCore)"/></g><g class="planet"><circle class="ink" cx="200" cy="255" r="55" fill="#7659d6"/><path d="M151 266Q201 222 249 252Q218 296 168 283Z" fill="#8fdcff" opacity=".75"/><ellipse cx="200" cy="255" rx="97" ry="24" fill="none" stroke="#e4d6ff" stroke-width="9" transform="rotate(-12 200 255)"/></g>`);
    if (showName === 'shock') return sceneSvg('shock-scene', `<g class="reactor"><circle cx="200" cy="255" r="85" fill="#072633" stroke="#3ddff4" stroke-width="8"/><circle cx="200" cy="255" r="55" fill="#21c8e3" opacity=".34"/><circle cx="200" cy="255" r="28" fill="#e9ffff"/><path d="M200 138L220 199L282 172L254 230L316 255L254 280L282 339L220 311L200 372L180 311L118 339L146 280L84 255L146 230L118 172L180 199Z" fill="#7deeff" opacity=".55"/></g><circle class="shock-ring" style="--ring-delay:.72s" cx="200" cy="255" r="72" fill="none" stroke="#a9f7ff" stroke-width="8"/><circle class="shock-ring" style="--ring-delay:.9s" cx="200" cy="255" r="72" fill="none" stroke="#5eeaff" stroke-width="6"/><circle class="shock-ring" style="--ring-delay:1.06s" cx="200" cy="255" r="72" fill="none" stroke="#fff" stroke-width="4"/><g class="energy-spikes" stroke="#d9ffff" stroke-width="8">${Array.from({length:8},(_,i)=>`<line x1="200" y1="120" x2="200" y2="57" transform="rotate(${i*45} 200 255)"/>`).join('')}</g>`);
    if (showName.includes('treasure')) return sceneSvg('treasure-scene', `<g class="chest-body"><path class="ink" d="M94 263H306V412Q306 438 280 438H120Q94 438 94 412Z" fill="#8f471b"/><path d="M110 283H290V405H110Z" fill="#b75f22"/><path d="M132 268V430M268 268V430" stroke="#f1b947" stroke-width="15"/><rect class="ink" x="176" y="318" width="48" height="55" rx="8" fill="url(#goldMetal)"/><circle cx="200" cy="340" r="8" fill="#6b350e"/></g><g class="chest-lid"><path class="ink" d="M91 270Q96 165 200 165Q304 165 309 270Z" fill="#9f4d1c"/><path d="M111 249Q128 187 200 187Q272 187 289 249" fill="none" stroke="#e3a93f" stroke-width="15"/></g><path class="chest-light" d="M133 285L73 74H327L267 285Z" fill="#ffe77b" opacity=".42"/>${Array.from({length:9},(_,i)=>`<g class="coin" style="--coin-delay:${.98+i*.07}s"><circle class="ink fine" cx="${130+(i%5)*35}" cy="${295+(i%2)*22}" r="16" fill="url(#goldMetal)"/><path d="M${130+(i%5)*35} ${285+(i%2)*22}V${305+(i%2)*22}" stroke="#9a560c" stroke-width="4"/></g>`).join('')}`);
    if (showName.includes('cat-blessing')) return sceneSvg('cat-scene', `<g class="blessing-halo" fill="none" stroke="#ffd8f0" stroke-width="9">${Array.from({length:10},(_,i)=>`<line x1="200" y1="126" x2="200" y2="53" transform="rotate(${i*36} 200 260)"/>`).join('')}</g>${catBodySvg()}<g class="act-finale" fill="#ffd55b"><circle cx="89" cy="169" r="13"/><circle cx="315" cy="190" r="10"/><path d="M317 115L326 138L350 140L331 155L337 179L317 166L297 179L303 155L284 140L308 138Z"/></g>`);
    if (type === 'regret') return sceneSvg('regret-scene', `${catBodySvg()}<g class="receipt"><path class="ink" d="M260 110H352V328L340 316L328 328L316 316L304 328L292 316L280 328L268 316L260 326Z" fill="#fff5e6"/><path d="M280 152H334M280 183H326M280 214H338M280 252H315" stroke="#8c7880" stroke-width="7"/><path d="M292 280H337" stroke="#d0465d" stroke-width="10"/></g><g class="alert-mark"><circle cx="315" cy="84" r="43" fill="#e53049" stroke="#ffe0e4" stroke-width="7"/><path d="M315 57V88M315 106V108" stroke="#fff" stroke-width="11" stroke-linecap="round"/></g>`);
    if (type === 'necessary') return sceneSvg('necessary-scene', '');
    return sceneSvg('best-scene', `<g class="spotlights"><path d="M48 0L177 436H82Z" fill="#ffb4ec" opacity=".26"/><path d="M352 0L223 436H318Z" fill="#ffe989" opacity=".25"/></g><g class="royal-cat">${catBodySvg()}<path d="M120 324Q82 373 120 430L173 386Z" fill="#833ab5" stroke="#291b22" stroke-width="8"/><path class="royal-paw ink" d="M255 348Q310 305 322 338Q326 371 270 394" fill="url(#catFur)"/></g><g class="crown"><path class="ink" d="M145 185L160 112L198 150L235 108L260 185Z" fill="url(#goldMetal)"/><circle cx="160" cy="112" r="9" fill="#ef5f8f"/><circle cx="235" cy="108" r="9" fill="#68cfff"/></g>`);
  };
  function animateEventAmount(amount, reduced, plus=false) {
    const token = ++amountAnimationToken, target = $('#eventAmount');
    const format=value=>`${plus?'＋':''}￥${Number(value||0).toLocaleString('ja-JP')}`;
    target.replaceChildren();
    const appendPart=(className,text)=>{const part=document.createElement('span');part.className=className;part.textContent=text;target.append(part);return part;};
    if(plus)appendPart('amount-plus','＋');
    appendPart('amount-yen','￥');
    const digits=appendPart('amount-digits','0'),render=value=>{digits.textContent=Number(value||0).toLocaleString('ja-JP');};
    const amountLength=format(amount).length;target.className=amountLength>=12?'amount-xxl':amountLength>=10?'amount-xl':amountLength>=8?'amount-long':'';
    if (reduced) { render(amount); return; }
    render(0);
    setTimeout(() => { const start = performance.now(), duration = 760; const tick = now => { if (token !== amountAnimationToken) return; const progress = Math.min(1,(now-start)/duration), eased = 1-Math.pow(1-progress,3); render(Math.round(amount*eased)); if (progress < 1) requestAnimationFrame(tick); }; requestAnimationFrame(tick); }, 2420);
  }
  function visibleHeroRect(hero) {
    if(hero.ownerSVGElement&&typeof hero.getBBox==='function'){
      try{
        const svg=hero.ownerSVGElement,svgRect=svg.getBoundingClientRect(),viewBox=svg.viewBox.baseVal,bbox=hero.getBBox();
        if(viewBox.width&&viewBox.height&&bbox.width&&bbox.height){
          const scaleX=svgRect.width/viewBox.width,scaleY=svgRect.height/viewBox.height,left=svgRect.left+(bbox.x-viewBox.x)*scaleX,top=svgRect.top+(bbox.y-viewBox.y)*scaleY,width=bbox.width*scaleX,height=bbox.height*scaleY;
          return {left,top,right:left+width,bottom:top+height,width,height};
        }
      }catch{}
    }
    const rect=hero.getBoundingClientRect();
    if(hero.tagName==='IMG'&&hero.naturalWidth&&hero.naturalHeight){
      const ratio=hero.naturalWidth/hero.naturalHeight,boxRatio=rect.width/Math.max(1,rect.height);
      const width=boxRatio>ratio?rect.height*ratio:rect.width,height=boxRatio>ratio?rect.height:rect.width/ratio;
      return {left:rect.left+(rect.width-width)/2,top:rect.top+(rect.height-height)/2,right:rect.left+(rect.width+width)/2,bottom:rect.top+(rect.height+height)/2,width,height};
    }
    return rect;
  }
  function layoutSaveCheerCats() {
    const box=$('#celebration'),layer=$('#saveCheer'),scene=$('#sceneVisual');
    if(!box?.classList.contains('save-spectacle')||!layer||!scene)return;
    const cats=[...layer.querySelectorAll('.save-cheer-cat')];
    if(![2,4].includes(cats.length))return;
    const mounted=scene.querySelector('.generated-scene-main:not(.asset-chest-closed)')||scene.querySelector('.generated-scene-main');
    const svgHero=scene.querySelector('.maneki,.burst-core,.planet,.reactor,.cat-body,.royal-cat,.desk-cat,.chest-body');
    const hero=mounted||svgHero||scene.querySelector('.scene-svg');
    if(!hero)return;
    const layerRect=layer.getBoundingClientRect(),heroRect=visibleHeroRect(hero),edge=24;
    const safe={left:heroRect.left-layerRect.left+heroRect.width*.2,right:heroRect.right-layerRect.left-heroRect.width*.2,top:heroRect.top-layerRect.top+heroRect.height*.2,bottom:heroRect.bottom-layerRect.top-heroRect.height*.2};
    layer.dataset.heroSafe=`${Math.round(safe.left)},${Math.round(safe.top)},${Math.round(safe.right)},${Math.round(safe.bottom)}`;
    const metrics=cats.map(cat=>{cat.style.removeProperty('width');cat.style.removeProperty('height');cat.style.removeProperty('right');cat.style.removeProperty('translate');return {cat,width:cat.offsetWidth,height:cat.offsetHeight};});
    const leftTop=edge,rightBottom=Math.max(edge,layerRect.height-metrics[0].height-edge),rightShift=cats.length===4?Math.max(42,(rightBottom-leftTop)*.3):Math.max(42,layerRect.height*.17),leftBottom=Math.max(edge,rightBottom-rightShift),rightTop=Math.min(rightBottom,leftTop+rightShift);
    metrics.forEach(({cat},index)=>{
      cat.style.removeProperty('width');cat.style.removeProperty('height');cat.style.removeProperty('right');cat.style.removeProperty('translate');
      let width=cat.offsetWidth,height=cat.offsetHeight;
      const slot=cat.dataset.slot||(['left-top','right-top','left-bottom','right-bottom'][index]),left=slot.startsWith('left'),top=slot.endsWith('top');
      let x=left?edge:layerRect.width-width-edge,y=slot==='left-top'?leftTop:slot==='right-top'?rightTop:slot==='left-bottom'?leftBottom:rightBottom;
      const overlapArea=()=>{const overlapW=Math.max(0,Math.min(x+width,safe.right)-Math.max(x,safe.left)),overlapH=Math.max(0,Math.min(y+height,safe.bottom)-Math.max(y,safe.top));return overlapW*overlapH;};
      if(overlapArea()>width*height*.18){
        const available=Math.max(0,left?safe.left-edge-4:layerRect.width-safe.right-edge-4),scale=Math.min(1,available/Math.max(1,width));
        if(scale<.94){const safeScale=Math.max(.82,scale);width=Math.round(width*safeScale);height=Math.round(height*safeScale);cat.style.width=`${width}px`;cat.style.height=`${height}px`;}
        x=left?edge:layerRect.width-width-edge;
      }
      x=Math.max(edge,Math.min(layerRect.width-width-edge,x));y=Math.max(edge,Math.min(layerRect.height-height-edge,y));
      cat.style.left=`${Math.round(x)}px`;cat.style.top=`${Math.round(y)}px`;
    });
  }
  addEventListener('resize',()=>requestAnimationFrame(layoutSaveCheerCats),{passive:true});
  function buildSaveCheerCats(saveRank) {
    if (!window.ChokinCats?.all) return '';
    const pool = window.ChokinCats.all.filter(cat => cat.enabled !== false && (cat.rarity === 'NORMAL' || cat.rarity === 'RARE'));
    if (!pool.length) return '';
    const count = saveRank.level >= 3 ? 4 : 2;
    const selected = pool.slice().sort(() => Math.random() - .5).slice(0, count);
    const slots=['left-top','right-top','left-bottom','right-bottom'];
    return selected.map((cat,index)=>`<span class="save-cheer-cat cheer-${index+1}" data-slot="${slots[index]}" data-cat-id="${cat.id}" data-rarity="${cat.rarity}" style="--cat-accent:${cat.accentColor};--cat-theme:${cat.themeColor}"><span>CAT</span><img src="./${cat.imagePath}" alt="" onerror="this.hidden=true"></span>`).join('');
  }
  function enhancedCelebrate(entry, forcedShow = null, preview = false, forcedRarity = null, options={}) {
    const box = $('#celebration'), isGacha=entry.type==='gacha', type = entry.type === 'save'||isGacha ? 'save' : entry.category;
    const reduced = !state.settings.effects || matchMedia('(prefers-reduced-motion: reduce)').matches;
    const power = entry.amount >= 10000 ? 'legendary' : entry.amount >= 5000 ? 'large' : entry.amount < 1000 ? 'small' : 'medium', saveRank=saveRankFor(Math.max(1,entry.amount));
    const expenseShows = {
      regret: [{name:'regret'},{name:'regret shock'}],
      necessary: [{name:'necessary'},{name:'necessary calm'}],
      best: [{name:'best'},{name:'best royal'}]
    };
    const gamePlan=options.gamePlan||(type==='save'?window.ChokinGameFX.plan({amount:entry.amount,forcedShow,forcedRarity}):null);
    const show=type==='save'?{name:gamePlan.show,rare:gamePlan.rarity==='LEGEND'}:pick(expenseShows[type]);
    const rarity=gamePlan?.rarity||'NORMAL',confirmed=!!gamePlan?.confirmed;
    const focusCat=options.collectionResult?.cat||gamePlan?.cat||(gamePlan?.slotResult?(gamePlan.slotResult.same?gamePlan.slotResult.cats[0]:gamePlan.slotResult.cats[1]||gamePlan.slotResult.cats.find(Boolean)):null);
    const previewCollection=preview&&show.name.startsWith('gacha-')&&focusCat?{cat:focusCat,isNew:true,medals:1,stats:window.ChokinCollection.getStats(),completedNow:false,preview:true}:null;
    const collectionResult=options.collectionResult||previewCollection,gachaResultMode=isGacha||!!collectionResult;
    const saveSpectacle=type==='save'&&!isGacha&&show.name!=='cat-slot'&&!show.name.startsWith('gacha-');
    let gameVisual=gamePlan?window.ChokinGameFX.visual(gamePlan):'';
    if(isGacha&&gamePlan?.cutIn&&!gamePlan.show.startsWith('gacha-'))gameVisual+=`<div class="hot-cutin"><img src="./${focusCat.imagePath}" alt="" aria-hidden="true"><b>激熱</b></div>`;
    if(collectionResult){const progress=`猫図鑑 ${collectionResult.stats.obtained} / ${collectionResult.stats.total}匹`,medalLine=collectionResult.medals?`猫メダル ＋${collectionResult.medals}${collectionResult.preview?'（プレビュー）':''}<br>`:'',nameSize=Math.max(18,Math.min(34,Math.floor(190/[...focusCat.name].length)));gameVisual+=`<div class="collection-reveal ${collectionResult.isNew?'new':'duplicate'}" style="--cat-accent:${focusCat.accentColor};--cat-theme:${focusCat.themeColor};--cat-name-size:${nameSize}px"><strong class="gacha-result-rarity">${focusCat.rarity}</strong><span class="collection-badge">${collectionResult.isNew?(focusCat.rarity==='LEGEND'?'NEW LEGEND CAT！':'NEW CAT！'):'再会'}</span><span class="collection-fallback-result" aria-hidden="true">CAT</span><img src="./${focusCat.imagePath}" alt="${escapeHtml(focusCat.name)}" onerror="this.hidden=true"><b>${escapeHtml(focusCat.name)}</b><small>${medalLine}${progress}</small></div>`;if(collectionResult.completedNow)gameVisual+='<div class="collection-complete"><b>CAT COLLECTION COMPLETE</b><span>全猫コンプリート！<br>猫図鑑完成</span></div>';}
    if(options.dailyCoinAwarded)gameVisual+=`<div class="daily-coin-award"><b>本日のねこコイン獲得！</b><strong>${coinIcon()} ＋1</strong></div>`;
    previewActive = preview;
    const modeClass=show.name==='cat-slot'?' slot':show.name.startsWith('gacha-')?' gacha':'';
    box.className = `celebration show four-stage ${type} ${show.name} ${power} rarity-${rarity.toLowerCase()} omen-${gamePlan?.omen||'eyes'}${confirmed?' confirmed':''}${modeClass}${saveSpectacle?` save-spectacle save-tier-${saveRank.key}`:''}${reduced ? ' reduced' : ''}${preview ? ' preview-mode' : ''}${gachaResultMode?' gacha-result-mode':''}${collectionResult?collectionResult.isNew?' new-cat':' duplicate-cat':''}${collectionResult?.completedNow?' collection-completed':''}`;
    window.ChokinAssets?.clear($('#sceneVisual'));
    $('#sceneVisual').innerHTML = gameVisual || buildSceneVisual(show.name, type);
    $('#saveCheer').innerHTML = saveSpectacle ? buildSaveCheerCats(saveRank) : '';
    $('#saveCheer').className=`save-cheer-layer cheer-count-${saveSpectacle?$('#saveCheer').children.length:0}`;
    const dynamicCat=show.name.startsWith('gacha-')||show.name==='cat-slot'?(gamePlan?.cat||gamePlan?.slotResult):null;
    const assetMount=dynamicCat?Promise.resolve(false):window.ChokinAssets?.mount($('#sceneVisual'), show.name, type);
    if(saveSpectacle){requestAnimationFrame(layoutSaveCheerCats);$('#saveCheer').querySelectorAll('img').forEach(image=>{if(!image.complete)image.addEventListener('load',()=>requestAnimationFrame(layoutSaveCheerCats),{once:true});});Promise.resolve(assetMount).finally(()=>requestAnimationFrame(layoutSaveCheerCats));}
    window.ChokinCanvasFX?.start($('#fxCanvas'), show.name, type, {reduced,rarity:gamePlan?.rarity||'NORMAL',spectacle:saveSpectacle,spectacleLevel:saveRank.level});
    $('#eventType').textContent = gachaResultMode?rarity:saveSpectacle?saveRank.label:preview?'演出プレビュー':categoryNames[type];
    $('#eventMessage').textContent = gachaResultMode?(collectionResult?.isNew?'NEW CAT':'再会'):'';
    $('#eventNote').textContent = '';
    if(gachaResultMode){amountAnimationToken++;$('#eventAmount').textContent=focusCat?.name||'CAT';}else animateEventAmount(entry.amount,reduced,type==='save');
    $('#revenge').hidden = type !== 'regret'; revengeAmount = Math.round(entry.amount * .1);
    const canvasPrimary = show.name === 'cosmic' || show.name.includes('treasure') || show.name.includes('legendary');
    const tierParticles=[18,24,32,40,48,56][saveRank.level];
    const count = reduced ? 0 : saveSpectacle ? (canvasPrimary ? Math.max(12,Math.round(tierParticles*.55)) : tierParticles) : type === 'save' ? 12 : 8;
    $('#particles').innerHTML = Array.from({length:count}, (_,i) => `<i style="--x:${Math.random()*100}%;--y:${42+Math.random()*72}%;--d:${(i%14)*.075}s;transform:scale(${.55+Math.random()*1.8})"></i>`).join('');
    box.setAttribute('aria-hidden','false'); if(type==='save'){stageSound(rarity,confirmed,saveRank.level);stageHaptic(rarity,saveRank.level);}else{sound(type);haptic(type);}
  }
  function showGachaFallback(plan,result){const cat=result.cat,progress=`猫図鑑 ${result.stats.obtained} / ${result.stats.total}匹`,nameSize=Math.max(18,Math.min(34,Math.floor(190/[...cat.name].length))),box=$('#celebration');box.className=`celebration show save gacha-result-mode rarity-${cat.rarity.toLowerCase()} ${result.isNew?'new-cat':'duplicate-cat'}`;$('#sceneVisual').innerHTML=`<div class="collection-reveal ${result.isNew?'new':'duplicate'}" style="--cat-accent:${cat.accentColor};--cat-theme:${cat.themeColor};--cat-name-size:${nameSize}px"><strong class="gacha-result-rarity">${cat.rarity}</strong><span class="collection-badge">${result.isNew?'NEW CAT！':'再会'}</span><span class="collection-fallback-result">CAT</span><img src="./${cat.imagePath}" alt="${escapeHtml(cat.name)}" onerror="this.hidden=true"><b>${escapeHtml(cat.name)}</b><small>${result.medals?`猫メダル ＋${result.medals}<br>`:''}${progress}</small></div>`;$('#eventType').textContent=cat.rarity;$('#eventMessage').textContent=result.isNew?'NEW CAT':'再会';$('#eventAmount').textContent=cat.name;$('#eventNote').textContent='';$('#revenge').hidden=true;box.setAttribute('aria-hidden','false');window.ChokinCanvasFX?.start($('#fxCanvas'),'gold','save',{reduced:true,rarity:cat.rarity});}
  function startCatGacha(){if(gachaLocked||!window.ChokinCoins.canSpend(1))return;gachaLocked=true;renderCoins();let plan=null,result=null,spent=false;try{plan=window.ChokinGameFX.gachaPlan();result=window.ChokinCollection.record(plan.cat,null);spent=window.ChokinCoins.spend(1);if(!spent){gachaLocked=false;render();return;}enhancedCelebrate({type:'gacha',amount:0,category:null,memo:'',createdAt:new Date().toISOString()},null,false,null,{gamePlan:plan,collectionResult:result});}catch(error){console.error('ねこガチャ演出を簡易表示へ切り替えました。',error);if(spent&&result)showGachaFallback(plan,result);else{gachaLocked=false;render();}}}
  function closeEvent() { const wasPreview = previewActive, quickEntry = !wasPreview && pendingQuickId && state.entries.find(entry => entry.id === pendingQuickId); previewActive = false; amountAnimationToken++; window.ChokinCanvasFX?.stop(true); window.ChokinAssets?.clear($('#sceneVisual')); $('#celebration').className='celebration'; $('#celebration').setAttribute('aria-hidden','true'); $('#sceneVisual').innerHTML=''; $('#saveCheer').innerHTML=''; $('#saveCheer').className='save-cheer-layer'; $('#particles').innerHTML=''; $('#closeEvent').textContent='ホームへ'; quickLocked = false; gachaLocked=false; navigate(wasPreview ? 'settings' : 'home'); render(); if (quickEntry) showQuickUndo(quickEntry); }
  function setupQuickSettings() {
    const host = $('#settings'); if (!host || $('#quickSettings')) return;
    const section = document.createElement('section'); section.id = 'quickSettings'; section.className = 'quick-settings';
    section.innerHTML = `<h3>クイック貯金金額</h3><p>ホーム画面に表示する5つの金額です。</p><div class="quick-settings-grid">${state.quickAmounts.map((amount,index) => `<label>金額${index+1}<input type="number" min="1" step="1" inputmode="numeric" value="${amount}" data-quick-input></label>`).join('')}</div><button id="saveQuickAmounts" class="data-button">クイック金額を保存</button>`;
    const dataTools = host.querySelector('.data-tools'); host.insertBefore(section, dataTools || null);
    $('#saveQuickAmounts').onclick = () => { const values = [...section.querySelectorAll('[data-quick-input]')].map(input => Number(input.value)); if (!validQuickAmounts(values)) { alert('5つすべてに、1円以上の整数を入力してください。'); return; } state.quickAmounts = values; saveState(); renderQuickButtons(); alert('クイック貯金金額を保存しました。'); };
  }
  function setupEffectPreview() {
    const host = $('#settings'); if (!host || $('#effectPreview')) return;
    const previews = window.ChokinGameFX.PREVIEWS;
    const section = document.createElement('section'); section.id='effectPreview'; section.className='effect-preview';
    section.innerHTML=`<h3>演出プレビュー</h3><p>履歴や集計を変更せずに再生します。</p><div class="preview-grid">${previews.map(([label,name,rarity,amount])=>`<button class="preview-button" data-preview="${name}" data-rarity="${name==='cat-slot'?'LEGEND':rarity}" data-preview-amount="${amount||5000}">${label}</button>`).join('')}</div>`;
    const dataTools=host.querySelector('.data-tools'); host.insertBefore(section,dataTools||null);
    section.querySelectorAll('[data-preview]').forEach(button=>button.addEventListener('click',()=>{const necessary=button.dataset.preview==='necessary';$('#closeEvent').textContent='設定へ戻る';enhancedCelebrate({type:necessary?'spend':'save',amount:Number(button.dataset.previewAmount)||5000,category:necessary?'necessary':null,memo:'',createdAt:new Date().toISOString()},necessary?null:button.dataset.preview,true,button.dataset.rarity);}));
  }
  function setupCatGallery() {
    const host=$('#settings');if(!host||$('#catGallery'))return;
    const section=document.createElement('section');section.id='catGallery';section.className='cat-gallery';
    section.innerHTML=`<div class="cat-gallery-heading"><h3>猫一覧</h3><button id="catDiagnostics" class="link">猫素材診断</button></div><p>登録済みの演出猫をすべて閲覧できます。</p><div class="cat-gallery-grid">${window.ChokinCats.all.map(cat=>`<button class="cat-card" data-cat-id="${cat.id}" style="--cat-theme:${cat.themeColor};--cat-accent:${cat.accentColor}"><span class="cat-card-fallback">CAT</span><img src="./${cat.imagePath}" alt="${cat.name}" onerror="this.hidden=true"><b>${cat.name}</b><small>${cat.rarity}</small></button>`).join('')}</div>`;
    const dialog=document.createElement('dialog');dialog.id='catDetail';dialog.className='cat-detail';dialog.innerHTML='<button class="cat-detail-close" aria-label="閉じる">×</button><div id="catDetailBody"></div>';
    document.body.append(dialog);host.insertBefore(section,host.querySelector('.data-tools'));
    section.querySelectorAll('[data-cat-id]').forEach(button=>button.addEventListener('click',()=>{const cat=window.ChokinCats.get(button.dataset.catId);$('#catDetailBody').innerHTML=`<div style="--cat-theme:${cat.themeColor};--cat-accent:${cat.accentColor}"><span class="cat-detail-fallback">CAT</span><img src="./${cat.imagePath}" alt="${cat.name}" onerror="this.hidden=true"><small>${cat.rarity}</small><h3>${cat.name}</h3><p>${cat.message}</p><dl><dt>テーマ色</dt><dd><i style="background:${cat.themeColor}"></i>${cat.themeColor}</dd><dt>アクセント</dt><dd><i style="background:${cat.accentColor}"></i>${cat.accentColor}</dd></dl></div>`;dialog.showModal();}));
    dialog.querySelector('.cat-detail-close').onclick=()=>dialog.close();dialog.addEventListener('click',event=>{if(event.target===dialog)dialog.close();});
    const diagnostic=document.createElement('dialog');diagnostic.id='catDiagnosticsDialog';diagnostic.className='cat-diagnostics-dialog';diagnostic.innerHTML='<button class="cat-detail-close" aria-label="診断を閉じる">×</button><div id="catDiagnosticsBody"></div>';document.body.append(diagnostic);
    $('#catDiagnostics').onclick=()=>{const cats=window.ChokinCats.all,images=[...section.querySelectorAll('.cat-card img')],success=images.filter(image=>image.complete&&image.naturalWidth>0).length,counts=Object.fromEntries(['NORMAL','RARE','SUPER','ULTRA','LEGEND'].map(rarity=>[rarity,cats.filter(cat=>cat.rarity===rarity).length]));$('#catDiagnosticsBody').innerHTML=`<h3>猫素材診断</h3><p>登録：${cats.length}匹<br>読込成功：${success}匹<br>読込失敗：${images.length-success}匹<br>ガチャ対象：${cats.filter(cat=>cat.gachaEnabled).length}匹<br>スロット対象：${cats.filter(cat=>cat.slotEnabled).length}匹</p><p>${Object.entries(counts).map(([rarity,count])=>`${rarity}：${count}`).join('<br>')}</p><strong>${success===images.length?'問題なし':'画像を確認してください'}</strong>`;diagnostic.showModal();};
    diagnostic.querySelector('.cat-detail-close').onclick=()=>diagnostic.close();diagnostic.addEventListener('click',event=>{if(event.target===diagnostic)diagnostic.close();});
  }
  function showFirstGuide(){const dialog=$('#firstGuide');if(dialog&&!dialog.open)dialog.showModal();}
  function setupCollectionSettings(){const host=$('#settings'),tools=host?.querySelector('.data-tools');if(!tools||$('#resetCollection'))return;const guide=document.createElement('button');guide.id='showFirstGuide';guide.className='data-button';guide.textContent='初回案内を表示';tools.append(guide);guide.onclick=showFirstGuide;const diagnostic=document.createElement('button');diagnostic.id='collectionDiagnostics';diagnostic.className='data-button';diagnostic.textContent='猫図鑑診断';tools.append(diagnostic);diagnostic.onclick=()=>{const result=window.ChokinCollection.getDiagnostics(),labels={empty:'初期状態',ok:'正常',repaired:'修復済み',recovered:'破損データを退避して復旧'};const dialog=$('#catDiagnosticsDialog');$('#catDiagnosticsBody').innerHTML=`<h3>猫図鑑診断</h3><p>総猫数：${result.total}匹<br>取得猫数：${result.obtained}匹<br>未取得猫数：${result.unobtained}匹<br>完成率：${result.percent}％<br>猫メダル合計：${result.totalCatMedals}枚<br>読込状態：${labels[result.loadState]||result.loadState}<br>カタログ外データ：${result.unknownCats}件<br>データ異常：${result.anomalies}件</p><strong>${result.loadState==='recovered'?'元データを退避して安全に復旧しました':'診断ではデータを変更していません'}</strong>`;dialog.showModal();};const button=document.createElement('button');button.id='resetCollection';button.className='data-button danger-outline';button.textContent='猫図鑑をリセット';tools.append(button);button.onclick=()=>{if(!confirm('猫図鑑の取得状況と猫メダルをリセットしますか？'))return;if(!confirm('取得した猫、初取得日時、登場回数、猫メダルがすべて消去されます。本当にリセットしますか？'))return;window.ChokinCollection.reset();render();alert('猫図鑑をリセットしました。');};}
  function setupCoinSettings(){const tools=$('#settings')?.querySelector('.data-tools');if(!tools||$('#resetCatCoins'))return;const button=document.createElement('button');button.id='resetCatCoins';button.className='data-button danger-outline';button.textContent='ねこコインをリセット';tools.append(button);button.onclick=()=>{if(!confirm('ねこコインの残高と獲得・使用履歴をリセットしますか？'))return;if(!confirm('この操作は元に戻せません。本当にリセットしますか？'))return;window.ChokinCoins.reset();render();alert('ねこコインをリセットしました。');};}
  function setupPwaSupport(){const host=$('#settings'),tools=host?.querySelector('.data-tools');if(!tools||$('#pwaDiagnostics'))return;const install=document.createElement('button');install.className='data-button';install.textContent='スマホのホーム画面に追加';tools.append(install);const diagnostic=document.createElement('button');diagnostic.id='pwaDiagnostics';diagnostic.className='data-button';diagnostic.textContent='PWA・公開診断';tools.append(diagnostic);const dialog=document.createElement('dialog');dialog.className='cat-diagnostics-dialog';dialog.innerHTML='<button class="cat-detail-close" aria-label="閉じる">×</button><div id="pwaDiagnosticsBody"></div>';document.body.append(dialog);const close=()=>dialog.close();dialog.querySelector('.cat-detail-close').onclick=close;dialog.addEventListener('click',event=>{if(event.target===dialog)close();});install.onclick=()=>{$('#pwaDiagnosticsBody').innerHTML='<h3>スマホのホーム画面に追加</h3><p><b>Android</b><br>Chromeのメニュー → ホーム画面に追加 → インストール</p><p><b>iPhone</b><br>Safariで開く → 共有 → ホーム画面に追加</p><small>OSやブラウザにより表示名が異なる場合があります。</small>';dialog.showModal();};diagnostic.onclick=async()=>{let registration=null;try{registration=await navigator.serviceWorker?.getRegistration();}catch{}const images=[...document.querySelectorAll('#catGallery img')],loaded=images.filter(image=>image.complete&&image.naturalWidth>0).length,manifest=document.querySelector('link[rel="manifest"]');$('#pwaDiagnosticsBody').innerHTML=`<h3>PWA・公開診断</h3><p>現在のURL：${escapeHtml(location.href)}<br>HTTPS：${location.protocol==='https:'?'はい':'いいえ'}<br>localhost：${['localhost','127.0.0.1'].includes(location.hostname)?'はい':'いいえ'}<br>Service Worker対応：${'serviceWorker' in navigator?'はい':'いいえ'}<br>登録状態：${registration?.active?.state||registration?.waiting?.state||registration?.installing?.state||'未登録'}<br>制御状態：${navigator.serviceWorker?.controller?'制御中':'未制御'}<br>Manifest URL：${escapeHtml(manifest?new URL(manifest.href,document.baseURI).href:'なし')}<br>standalone：${matchMedia('(display-mode: standalone)').matches?'はい':'いいえ'}<br>通信状態：${navigator.onLine?'オンライン':'オフライン'}<br>猫画像：${loaded} / ${images.length}<br>アプリ：v${APP_VERSION}</p><strong>診断ではデータを変更していません</strong>`;dialog.showModal();};}
  function showUpdate(registration){if($('#pwaUpdate'))return;const notice=document.createElement('div');notice.id='pwaUpdate';notice.className='pwa-update';notice.innerHTML='<span>新しいバージョンがあります</span><button>更新する</button>';document.body.append(notice);notice.querySelector('button').onclick=()=>{window.__pwaRefreshing=true;registration.waiting?.postMessage({type:'SKIP_WAITING'});};}
  async function setupPwaRegistration(){if(!('serviceWorker' in navigator))return;try{const registration=await navigator.serviceWorker.register('./service-worker.js',{scope:'./'});if(registration.waiting)showUpdate(registration);registration.addEventListener('updatefound',()=>{const worker=registration.installing;worker?.addEventListener('statechange',()=>{if(worker.state==='installed'&&navigator.serviceWorker.controller)showUpdate(registration);});});navigator.serviceWorker.addEventListener('controllerchange',()=>{if(window.__pwaRefreshing)location.reload();});}catch(error){console.warn('Service Workerを登録できませんでした。',error);}}
  $('#entryForm').addEventListener('submit', e=>{ e.preventDefault(); if(quickLocked)return; const amount=Math.floor(Number($('#amount').value)); if(!Number.isFinite(amount)||amount<=0){ $('#amount').setCustomValidity('1円以上の金額を入力してください。'); $('#amount').reportValidity(); return; } $('#amount').setCustomValidity('');quickLocked=true; const entry={id:crypto.randomUUID?.()||`${Date.now()}-${Math.random()}`,type:formMode,amount,category:formMode==='spend'?$('#category').value:null,memo:$('#memo').value.trim(),createdAt:new Date().toISOString()}; state.entries.unshift(entry); saveState();const dailyCoinAwarded=entry.type==='save'&&window.ChokinCoins.awardDaily(); enhancedCelebrate(entry,null,false,null,{dailyCoinAwarded}); });
  document.addEventListener('click', e=>{ const nav=e.target.closest('[data-nav]'); if(nav) navigate(nav.dataset.nav); const open=e.target.closest('[data-open]'); if(open) openForm(open.dataset.open); const quick=e.target.closest('[data-quick]'); if(quick) quickSave(Number(quick.dataset.quick)); const del=e.target.closest('[data-delete]'); if(del){deletingId=del.dataset.delete; $('#deleteDialog').showModal();} const filter=e.target.closest('[data-collection-filter]');if(filter){collectionFilter=filter.dataset.collectionFilter;renderCollection();}const collectionCat=e.target.closest('[data-collection-cat]');if(collectionCat)openCollectionDetail(collectionCat.dataset.collectionCat);if(e.target.matches('[data-tip]')){const t=$('#tip');t.textContent=e.target.dataset.tip;t.style.display='block';setTimeout(()=>t.style.display='none',3500);} });
  $('#closeEvent').onclick=closeEvent; $('#skipEvent').onclick=closeEvent; $('#revenge').onclick=()=>{ closeEvent(); openForm('save', revengeAmount); };
  $('#catGacha').onclick=startCatGacha;
  $('#confirmDelete').onclick=()=>{state.entries=state.entries.filter(x=>x.id!==deletingId);saveState();render();};
  $('#undoQuick').onclick=()=>{ if (!pendingQuickId) return; state.entries = state.entries.filter(entry => entry.id !== pendingQuickId); pendingQuickId = null; clearTimeout(undoTimer); $('#quickUndo').hidden = true; saveState(); render(); };
  ['sound','vibration','effects'].forEach(k=> $(`#${k}`).addEventListener('change',e=>{state.settings[k]=e.target.checked;saveState();}));
  $('#exportBackup').onclick = exportBackup;
  $('#importBackup').onclick = () => $('#backupFile').click();
  $('#backupFile').addEventListener('change', e => { const file = e.target.files[0]; if (file) importBackup(file); e.target.value = ''; });
  $('#clearEntries').onclick = () => { if (!confirm('すべての貯金・出費記録を削除しますか？')) return; if (!confirm('この操作は元に戻せません。本当に削除しますか？')) return; state.entries = []; saveState(); render(); alert('すべての記録を削除しました。'); };
  $('#collectionDetail .cat-detail-close').onclick=()=>$('#collectionDetail').close();$('#collectionDetail').addEventListener('click',event=>{if(event.target===$('#collectionDetail'))$('#collectionDetail').close();});
  $('#closeFirstGuide').onclick=()=>{localStorage.setItem(GUIDE_KEY,'seen');$('#firstGuide').close();};
  window.addEventListener('load',setupPwaRegistration);
  document.querySelector('.app-version').textContent = `v${APP_VERSION}`;
  const firstUse=localStorage.getItem(KEY)===null,welcomeCoinGranted=window.ChokinCoins.grantWelcome();load(); setupQuickSettings(); setupEffectPreview(); setupCatGallery(); setupCollectionSettings(); setupCoinSettings(); setupPwaSupport(); render();scheduleCoinDayRefresh();if(firstUse&&localStorage.getItem(GUIDE_KEY)!=='seen')showFirstGuide();if(welcomeCoinGranted)setTimeout(showWelcomeCoin,500);
})();
