(() => {
  'use strict';

  const KEY = 'chokin-event-app.savingsGoal.v1';
  const SCHEMA_VERSION = 1;
  const MAX_TARGET = 99999999;
  const CAT_IMAGE = 'assets/cats/cat_hachiware.png';
  const ACHIEVEMENT_SPARKLES = 52;
  const pawFallback = () => window.ChokinVisualAssets?.pawMarkup?.('goal-cat-fallback') || '<span class="goal-cat-fallback" aria-hidden="true">🐾</span>';
  const ICONS = Object.freeze({
    piggy:{label:'貯金箱',symbol:'🐷'}, game:{label:'ゲーム',symbol:'🎮'}, book:{label:'本',symbol:'📚'},
    bicycle:{label:'自転車',symbol:'🚲'}, toy:{label:'おもちゃ',symbol:'🧸'}, clothes:{label:'服',symbol:'👕'},
    travel:{label:'旅行',symbol:'✈️'}, gift:{label:'プレゼント',symbol:'🎁'}, device:{label:'パソコン・スマートフォン',symbol:'💻'},
    other:{label:'その他',symbol:'⭐'}
  });

  let getEntries = () => [];
  let getSettings = () => ({sound:false,vibration:false,effects:false});
  let navigate = () => {};
  let formMode = 'create';
  let setupDone = false;
  let activeAchievementGoal = null;
  let achievementTimer = 0;
  const $ = selector => document.querySelector(selector);
  const yen = amount => `¥${Number(amount || 0).toLocaleString('ja-JP')}`;
  const historyCount = () => window.ChokinGoalHistory?.getCount?.() || 0;
  const historyLinkMarkup = className => {
    const count = historyCount();
    return count ? `<button type="button" class="goal-history-link ${className}" data-goal-history-open aria-label="達成アルバムを開く、達成した目標${count}件">達成アルバムを見る　<span>${count}件</span></button>` : '';
  };
  const escapeHtml = value => String(value).replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[character]));
  const validDate = value => typeof value === 'string' && value !== '' && !Number.isNaN(new Date(value).getTime());
  const validDeadline = value => {
    if (value === null || value === '') return true;
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const [year,month,day] = value.split('-').map(Number), date = new Date(year,month-1,day);
    return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
  };
  const catMarkup = (className, alt='目標へ進むハチワレ') => `<span class="${className} goal-cat-position" style="--goal-position:0%"><span class="goal-cat-sway">${pawFallback()}<img src="./${CAT_IMAGE}" alt="${alt}" onerror="this.hidden=true;this.previousElementSibling.hidden=false"></span></span>`;
  function milestoneIcon(value) {
    const star='<path class="milestone-main" d="M24 4.5l5.9 12 13.2 1.9-9.5 9.3 2.2 13.1L24 34.6l-11.8 6.2 2.2-13.1-9.5-9.3 13.2-1.9z"/>';
    if (value===25) return `<svg class="goal-milestone-icon milestone-25" viewBox="0 0 48 48" aria-hidden="true">${star}</svg>`;
    if (value===50) return `<svg class="goal-milestone-icon milestone-50" viewBox="0 0 48 48" aria-hidden="true"><path class="milestone-accent" d="M14 7l3.2 6.5 7.2 1-5.2 5.1 1.2 7.1-6.4-3.4-6.4 3.4 1.2-7.1-5.2-5.1 7.2-1z"/><g transform="translate(10 8) scale(.78)">${star}</g></svg>`;
    if (value===75) return `<svg class="goal-milestone-icon milestone-75" viewBox="0 0 48 48" aria-hidden="true"><path class="milestone-crown" d="M9 17l7 5 8-11 8 11 7-5-3 14H12z"/><path class="milestone-main" d="M24 23l3.7 7.5 8.3 1.2-6 5.8 1.4 8.2-7.4-3.9-7.4 3.9 1.4-8.2-6-5.8 8.3-1.2z"/></svg>`;
    return `<svg class="goal-milestone-icon milestone-100" viewBox="0 0 48 48" aria-hidden="true"><path class="milestone-rainbow rainbow-a" d="M7 17a17 17 0 0134 0h-4a13 13 0 00-26 0z"/><path class="milestone-rainbow rainbow-b" d="M11 17a13 13 0 0126 0h-4a9 9 0 00-18 0z"/><path class="milestone-cup" d="M15 12h18v8c0 7-3.8 11-7 12v5h7v5H15v-5h7v-5c-3.2-1-7-5-7-12z"/><path class="milestone-accent" d="M10 14H5v5c0 5 4 9 9 9v-4c-3 0-5-2-5-5v-1h3zm28 0h5v5c0 5-4 9-9 9v-4c3 0 5-2 5-5v-1h-3z"/></svg>`;
  }

  function validateGoal(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value) || value.schemaVersion !== SCHEMA_VERSION) return null;
    const name = typeof value.itemName === 'string' ? value.itemName.trim() : '';
    if (!name || name.length > 30 || !Number.isInteger(value.targetAmount) || value.targetAmount < 1 || value.targetAmount > MAX_TARGET || !Number.isSafeInteger(value.startingAmount) || value.startingAmount < 0) return null;
    if (!Object.hasOwn(ICONS,value.icon) || !validDeadline(value.deadline) || typeof value.memo !== 'string' || value.memo.length > 200 || !validDate(value.createdAt) || !validDate(value.updatedAt)) return null;
    if (typeof value.achieved !== 'boolean' || typeof value.achievementShown !== 'boolean' || ![0,25,50,75,100].includes(value.highestMilestone)) return null;
    return {...value,itemName:name,deadline:value.deadline || null,memo:value.memo.slice(0,200)};
  }

  function readGoal() {
    const raw = localStorage.getItem(KEY);
    if (raw === null) return null;
    try { return validateGoal(JSON.parse(raw)); } catch { return null; }
  }
  const writeGoal = goal => localStorage.setItem(KEY,JSON.stringify(goal));
  const validGoalSaves = goal => {
    const created = new Date(goal.createdAt).getTime();
    return (Array.isArray(getEntries()) ? getEntries() : []).filter(entry => {
      const time = new Date(entry?.createdAt).getTime();
      return entry?.type === 'save' && Number.isInteger(entry.amount) && entry.amount > 0 && Number.isFinite(time) && time >= created;
    });
  };
  function progressFor(goal) {
    let progress = goal.startingAmount;
    validGoalSaves(goal).forEach(entry => { progress = Math.min(Number.MAX_SAFE_INTEGER,progress + entry.amount); });
    const percent = Math.round(progress / goal.targetAmount * 100);
    return {progress,percent,barPercent:Math.min(100,percent),remaining:Math.max(0,goal.targetAmount-progress),achieved:progress>=goal.targetAmount};
  }
  const milestoneFor = percent => percent >= 100 ? 100 : percent >= 75 ? 75 : percent >= 50 ? 50 : percent >= 25 ? 25 : 0;
  function updateStatus(goal, options={}) {
    const stats = progressFor(goal), wasAchieved = goal.achieved, milestone = milestoneFor(stats.percent);
    let changed = false;
    if (goal.achieved !== stats.achieved) { goal.achieved = stats.achieved; changed = true; if (!stats.achieved) goal.achievementShown = false; }
    if (milestone > goal.highestMilestone) { goal.highestMilestone = milestone; changed = true; }
    if (changed) { goal.updatedAt = new Date().toISOString(); writeGoal(goal); }
    const newlyAchieved = stats.achieved && !wasAchieved;
    if (stats.achieved && !goal.achievementShown && (options.showPending || newlyAchieved && options.showNewAchievement)) {
      showAchievement(goal,stats);
    }
    return stats;
  }
  function setMascotPositions(root, percent) {
    const destination=`${Math.max(0,Math.min(100,percent))}%`, reduced=matchMedia('(prefers-reduced-motion: reduce)').matches || !getSettings().effects;
    root.classList.toggle('goal-motion-reduced',reduced);
    root.querySelectorAll('.goal-cat-position').forEach(mascot=>{
      if (reduced) mascot.style.setProperty('--goal-position',destination);
      else requestAnimationFrame(()=>requestAnimationFrame(()=>mascot.style.setProperty('--goal-position',destination)));
    });
  }

  function homeMarkup(goal, stats) {
    const icon = ICONS[goal.icon] || ICONS.piggy;
    return `<button type="button" class="goal-home-open" data-goal-open aria-label="貯金目標 ${escapeHtml(goal.itemName)}、達成率${stats.percent}％、詳細を開く"><span class="goal-home-icon" aria-hidden="true">${icon.symbol}</span><span class="goal-home-copy"><small>現在の目標</small><b>${escapeHtml(goal.itemName)}</b><span>${yen(stats.progress)} / ${yen(goal.targetAmount)}</span></span><strong>${stats.achieved?'目標達成！':`あと ${yen(stats.remaining)}`}</strong><span class="goal-home-journey" aria-hidden="true"><span class="goal-home-route">${catMarkup('goal-home-mascot','')}</span><span class="goal-home-target">${icon.symbol}</span></span><span class="goal-home-progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${stats.barPercent}" aria-valuetext="達成率 ${stats.percent}％"><i style="width:${stats.barPercent}%"></i></span><em>達成率 ${stats.percent}％</em></button>`;
  }
  function renderHome() {
    const host = $('#goalHomeCard'); if (!host) return;
    const goal = readGoal();
    if (!goal) {
      host.innerHTML = '<div class="goal-home-empty"><span aria-hidden="true">⭐</span><div><small>貯金目標</small><b>ほしいものを決めよう</b></div><button type="button" data-goal-create>目標を設定する</button></div>';
      return;
    }
    const stats = updateStatus(goal,{showNewAchievement:true,showPending:true});
    host.innerHTML = homeMarkup(goal,stats);
    setMascotPositions(host,stats.barPercent);
  }

  function deadlineText(deadline) {
    if (!deadline) return '';
    const [year,month,day] = deadline.split('-').map(Number), target = new Date(year,month-1,day), now = new Date(), today = new Date(now.getFullYear(),now.getMonth(),now.getDate()), days = Math.ceil((target-today)/86400000), shown = `${year}年${month}月${day}日`;
    return days >= 0 ? `期限：${shown}（あと${days}日）` : `期限：${shown}<br><span>期限を過ぎましたが、目標はそのまま続けられます</span>`;
  }
  const milestoneMessage = percent => percent >= 100 ? '目標達成！' : percent >= 90 ? 'あと少し！' : percent >= 75 ? 'もう少し！' : percent >= 50 ? '半分まできた！' : percent >= 25 ? 'いい調子！' : '一歩ずつ近づこう！';
  function recentMarkup(goal) {
    const saves = validGoalSaves(goal).slice().sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt)).slice(0,5);
    if (!saves.length) return '<p class="goal-empty-note">目標を作ってからの貯金はまだありません。</p>';
    return `<div class="goal-recent-list">${saves.map(entry=>`<div><time datetime="${escapeHtml(entry.createdAt)}">${new Date(entry.createdAt).toLocaleDateString('ja-JP',{month:'numeric',day:'numeric'})}</time><b>＋${yen(entry.amount)}</b></div>`).join('')}</div>`;
  }
  function renderDetail(options={}) {
    const host = $('#goalDetailBody'); if (!host) return;
    const goal = readGoal();
    if (!goal) { host.innerHTML = `<section class="goal-missing"><h3>目標はまだありません</h3><p>ほしいものを決めて、最初の一歩を始めましょう。</p><button type="button" class="submit" data-goal-create>目標を設定する</button>${historyCount()?historyLinkMarkup('goal-detail-history-link'):''}</section>`; return; }
    const stats = updateStatus(goal,{showPending:options.showPending===true}), icon = ICONS[goal.icon] || ICONS.piggy, milestones=[25,50,75,100];
    const archiveAction = stats.achieved ? '<button type="button" class="goal-archive-end" data-goal-archive-end>アルバムに残して目標を終了</button>' : '';
    host.innerHTML = `<section class="goal-hero${stats.achieved?' achieved':''}"><div class="goal-title-row"><span class="goal-detail-icon" aria-hidden="true">${icon.symbol}</span><div><small>ほしいもの</small><h3>${escapeHtml(goal.itemName)}</h3><p>${yen(stats.progress)} / ${yen(goal.targetAmount)}</p></div></div><div class="goal-journey" aria-label="猫が目標へ進む表示"><div class="goal-route">${catMarkup('goal-mascot')}</div><span class="goal-target-icon" aria-label="目標 ${escapeHtml(icon.label)}">${icon.symbol}</span></div><div class="goal-progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${stats.barPercent}" aria-valuetext="達成率 ${stats.percent}％、${yen(stats.progress)}、目標 ${yen(goal.targetAmount)}"><i style="width:${stats.barPercent}%"></i></div><div class="goal-progress-copy"><strong>達成率 ${stats.percent}％</strong><b>${milestoneMessage(stats.percent)}</b></div><div class="goal-milestones">${milestones.map(value=>`<span class="milestone-${value} ${stats.percent>=value?'reached':''}">${milestoneIcon(value)}<b>${value}％</b></span>`).join('')}</div></section><section class="goal-numbers"><div><span>現在の進捗</span><b>${yen(stats.progress)}</b></div><div><span>${stats.achieved?'達成額':'あと'}</span><b>${stats.achieved?'目標達成！':yen(stats.remaining)}</b></div></section>${goal.deadline?`<p class="goal-deadline">${deadlineText(goal.deadline)}</p>`:''}${goal.memo?`<section class="goal-memo"><h3>メモ</h3><p>${escapeHtml(goal.memo)}</p></section>`:''}<section class="goal-recent"><h3>最近の貯金</h3>${recentMarkup(goal)}</section><div class="goal-actions">${historyLinkMarkup('goal-detail-history-link')}<button type="button" data-goal-edit>目標を編集</button><button type="button" data-goal-new>新しい目標に変更</button>${archiveAction}<button type="button" class="danger-outline" data-goal-delete>目標を削除</button></div>`;
    setMascotPositions(host,stats.barPercent);
  }

  function renderFormHistoryLink() {
    const form = $('#savingsGoalForm'); if (!form) return;
    const markup = historyLinkMarkup('goal-form-history-link');
    let slot = form.querySelector('.goal-form-history-slot');
    if (!markup) { slot?.remove(); return; }
    if (!slot) { slot=document.createElement('div'); slot.className='goal-form-history-slot'; form.append(slot); }
    slot.innerHTML = markup;
  }

  function openForm(mode) {
    const goal = readGoal(); if (mode === 'edit' && !goal) return;
    formMode = mode; $('#goalFormTitle').textContent = mode === 'edit' ? '貯金目標を編集' : '貯金目標を設定';
    $('#goalItemName').value = mode === 'edit' ? goal.itemName : '';
    $('#goalTargetAmount').value = mode === 'edit' ? goal.targetAmount : '';
    $('#goalStartingAmount').value = mode === 'edit' ? goal.startingAmount : 0;
    $('#goalIcon').value = mode === 'edit' ? goal.icon : 'piggy';
    $('#goalDeadline').value = mode === 'edit' ? goal.deadline || '' : '';
    $('#goalMemo').value = mode === 'edit' ? goal.memo : '';
    $('#goalFormError').textContent = ''; renderFormHistoryLink(); navigate('goal-form'); setTimeout(()=>$('#goalItemName').focus(),50);
  }
  function formValues() {
    const itemName=$('#goalItemName').value.trim(), targetAmount=Number($('#goalTargetAmount').value), startingRaw=$('#goalStartingAmount').value.trim(), startingAmount=startingRaw===''?0:Number(startingRaw), icon=$('#goalIcon').value, deadline=$('#goalDeadline').value||null, memo=$('#goalMemo').value.trim();
    if (!itemName || itemName.length > 30) return {error:'「ほしいもの」を1～30文字で入力してください。'};
    if (!Number.isInteger(targetAmount) || targetAmount < 1 || targetAmount > MAX_TARGET) return {error:'目標金額は1円～99,999,999円の整数で入力してください。'};
    if (!Number.isSafeInteger(startingAmount) || startingAmount < 0) return {error:'すでに貯めている金額は0円以上の整数で入力してください。'};
    if (!Object.hasOwn(ICONS,icon) || !validDeadline(deadline)) return {error:'アイコンまたは期限を確認してください。'};
    if (memo.length > 200) return {error:'メモは200文字以内で入力してください。'};
    return {itemName,targetAmount,startingAmount,icon,deadline,memo};
  }
  function saveForm(event) {
    event.preventDefault(); const values=formValues(), error=$('#goalFormError');
    if (values.error) { error.textContent=values.error; return; }
    const oldGoal=readGoal(), now=new Date().toISOString(), createdAt=formMode==='edit'&&oldGoal?oldGoal.createdAt:now;
    const draft={schemaVersion:SCHEMA_VERSION,...values,createdAt,updatedAt:now,achieved:false,achievementShown:false,highestMilestone:0}, stats=progressFor(draft), milestone=milestoneFor(stats.percent);
    draft.achieved=stats.achieved; draft.highestMilestone=formMode==='edit'&&oldGoal?Math.max(oldGoal.highestMilestone,milestone):milestone;
    draft.achievementShown=stats.achieved&&formMode==='edit'&&oldGoal?.achieved&&oldGoal.achievementShown;
    const history=window.ChokinGoalHistory, goalRaw=localStorage.getItem(KEY), historyRaw=history?.getRaw?.() ?? null;
    try {
      if (formMode==='replace' && oldGoal) {
        const oldStats=progressFor(oldGoal);
        if (oldStats.achieved) {
          if (!history?.archiveGoal) throw new Error('達成アルバムを利用できません。');
          history.archiveGoal(oldGoal,oldStats.progress,getEntries());
        }
      }
      writeGoal(draft);
    } catch {
      try { if (goalRaw===null)localStorage.removeItem(KEY);else localStorage.setItem(KEY,goalRaw); } catch {}
      try { history?.restoreRaw?.(historyRaw); } catch {}
      error.textContent='保存できませんでした。現在の目標は変更されていません。'; return;
    }
    navigate('goal'); renderDetail({showPending:true}); renderHome(); window.ChokinBadges?.evaluate?.();
  }

  function achievementSound() {
    const settings=getSettings(); if (!settings.sound || !window.AudioContext) return;
    try { const context=new AudioContext(); [523,659,784,1047].forEach((frequency,index)=>{const oscillator=context.createOscillator(),gain=context.createGain();oscillator.connect(gain);gain.connect(context.destination);oscillator.frequency.value=frequency;gain.gain.setValueAtTime(.001,context.currentTime+index*.08);gain.gain.exponentialRampToValueAtTime(.1,context.currentTime+index*.08+.02);gain.gain.exponentialRampToValueAtTime(.001,context.currentTime+index*.08+.5);oscillator.start(context.currentTime+index*.08);oscillator.stop(context.currentTime+index*.08+.52);}); } catch {}
  }
  function markAchievementShown() {
    if (!activeAchievementGoal || activeAchievementGoal.achievementShown) return;
    const stored = readGoal();
    if (!stored || stored.createdAt !== activeAchievementGoal.createdAt || !progressFor(stored).achieved) return;
    stored.achievementShown = true;
    stored.updatedAt = new Date().toISOString();
    writeGoal(stored);
    activeAchievementGoal = stored;
  }
  function clearAchievementAnimation() {
    if (achievementTimer) { clearTimeout(achievementTimer); achievementTimer = 0; }
  }
  function sparkleMarkup() {
    return Array.from({length:ACHIEVEMENT_SPARKLES},(_,index)=>{
      const type=index<36?'tiny':index<48?'star':'glow', direction=index%2===0?1:-1;
      return `<i class="sparkle-${type} sparkle-motion-${index%3}" style="--sx:${(index*43+7)%96}%;--sy:${(index*67+11)%92}%;--size:${type==='tiny'?5+(index%4)*2:type==='star'?13+(index%4)*3:28+(index%3)*8}px;--spark-duration:${(4.8+(index%9)*.55).toFixed(2)}s;--spark-delay:-${((index%13)*.43).toFixed(2)}s;--dx:${direction*(5+(index%5)*3)}px;--dy:${-6-(index%6)*3}px;--spin:${direction*(30+(index%5)*22)}deg;--spark-opacity:${(.34+(index%5)*.1).toFixed(2)}"></i>`;
    }).join('');
  }
  function stopAchievementDecorations() {
    const overlay=$('#goalAchievement'), particles=$('#goalAchievementParticles'), sparkles=$('#goalAchievementSparkles');
    clearAchievementAnimation();
    if (particles) particles.innerHTML='';
    if (sparkles) sparkles.innerHTML='';
    if (overlay) overlay.classList.remove('animating','paused');
  }
  function finishAchievementAnimation() {
    const overlay=$('#goalAchievement'), particles=$('#goalAchievementParticles');
    if (!overlay || overlay.hidden) return;
    clearAchievementAnimation();
    overlay.classList.remove('animating');
    overlay.classList.add('settled');
    if (particles) particles.innerHTML='';
    const mascot=$('#goalDetailBody .goal-mascot');
    if (mascot) mascot.style.setProperty('--goal-position','100%');
    markAchievementShown();
  }
  function syncAchievementVisibility() {
    const overlay=$('#goalAchievement');
    if (!overlay || overlay.hidden) return;
    overlay.classList.toggle('paused',document.visibilityState==='hidden');
  }
  function showAchievement(goal,stats) {
    const overlay=$('#goalAchievement'); if (!overlay || !overlay.hidden) return;
    $('#goalAchievementName').textContent=goal.itemName; $('#goalAchievementAmount').textContent=yen(stats.progress);
    const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches || !getSettings().effects, effects=!reduced, particles=$('#goalAchievementParticles'), sparkles=$('#goalAchievementSparkles');
    const colors=['#ffd75a','#ffffff','#a983ff','#6fe6ff','#ff86c8','#ff9f43'];
    stopAchievementDecorations();
    particles.innerHTML=effects?Array.from({length:56},(_,index)=>{
      const width=6+(index%4)*2, height=index%3===0?width:10+(index%4)*3, drift=(index%2?1:-1)*(12+(index%7)*7);
      return `<i style="--x:${(index*47)%100}%;--d:${((index%14)*.06).toFixed(2)}s;--fall:${(2.35+(index%9)*.1).toFixed(2)}s;--drift:${drift}px;--spin:${360+(index%5)*180}deg;--c:${colors[index%colors.length]};--w:${width}px;--h:${height}px;--radius:${index%5===0?'50%':index%3===0?'2px':'1px'}"></i>`;
    }).join(''):'';
    sparkles.innerHTML=sparkleMarkup();
    activeAchievementGoal=goal;
    overlay.classList.remove('show','animating','settled','paused');
    overlay.classList.toggle('reduced',reduced);
    overlay.hidden=false;
    requestAnimationFrame(()=>{
      overlay.classList.add('show');
      overlay.classList.toggle('animating',effects);
      requestAnimationFrame(markAchievementShown);
    });
    if (effects) achievementTimer=setTimeout(finishAchievementAnimation,3400);
    else overlay.classList.add('settled');
    syncAchievementVisibility();
    achievementSound(); if (getSettings().vibration && navigator.vibrate) navigator.vibrate([40,60,80,50,120]);
  }
  function hideAchievement(immediate=false){
    const overlay=$('#goalAchievement');if(!overlay)return;
    markAchievementShown(); stopAchievementDecorations(); overlay.classList.remove('show');
    const finish=()=>{overlay.hidden=true;overlay.classList.remove('settled','reduced','paused');activeAchievementGoal=null;window.ChokinBadges?.tryShowQueued?.();};
    if (immediate) finish(); else setTimeout(finish,200);
  }
  function openGoalReplacementDialog() {
    const goal=readGoal(), dialog=$('#goalReplaceDialog'); if (!goal || !dialog) return;
    const overlay=$('#goalAchievement');
    if (overlay && !overlay.hidden) { markAchievementShown(); stopAchievementDecorations(); }
    const stats=progressFor(goal);
    $('#goalReplaceName').textContent=goal.itemName;
    $('#goalReplaceAmount').textContent=yen(stats.progress);
    if (!dialog.open) dialog.showModal();
  }
  function confirmGoalReplacement() {
    hideAchievement();
    openForm('replace');
  }

  function openArchiveEndDialog() {
    const goal=readGoal(), dialog=$('#goalArchiveEndDialog'); if(!goal||!dialog)return;
    const stats=progressFor(goal); if(!stats.achieved)return;
    $('#goalArchiveEndName').textContent=goal.itemName;
    $('#goalArchiveEndTarget').textContent=yen(goal.targetAmount);
    $('#goalArchiveEndProgress').textContent=yen(stats.progress);
    if(!dialog.open)dialog.showModal();
  }

  function confirmArchiveEnd() {
    const goal=readGoal(), history=window.ChokinGoalHistory, dialog=$('#goalArchiveEndDialog'); if(!goal)return;
    const stats=progressFor(goal); if(!stats.achieved){dialog?.close();renderDetail();return;}
    const goalRaw=localStorage.getItem(KEY), historyRaw=history?.getRaw?.() ?? null;
    try {
      if(!history?.archiveGoal)throw new Error('達成アルバムを利用できません。');
      history.archiveGoal(goal,stats.progress,getEntries());
      localStorage.removeItem(KEY);
    } catch {
      try { if(goalRaw===null)localStorage.removeItem(KEY);else localStorage.setItem(KEY,goalRaw); } catch {}
      try { history?.restoreRaw?.(historyRaw); } catch {}
      dialog?.close(); alert('保存できませんでした。現在の目標は変更されていません。'); return;
    }
    dialog?.close(); navigate('home'); renderHome(); window.ChokinBadges?.evaluate?.();
  }

  function setup(options) {
    if (setupDone) return; setupDone=true;
    getEntries=options.getEntries; getSettings=options.getSettings; navigate=options.navigate;
    $('#savingsGoalForm').addEventListener('submit',saveForm);
    document.addEventListener('click',event=>{
      if (event.target.closest('[data-goal-create]')) openForm('create');
      if (event.target.closest('[data-goal-open]')) { navigate('goal'); renderDetail(); }
      if (event.target.closest('[data-goal-edit]')) openForm('edit');
      if (event.target.closest('[data-goal-new]')) openGoalReplacementDialog();
      if (event.target.closest('[data-goal-archive-end]')) openArchiveEndDialog();
      if (event.target.closest('[data-goal-delete]')) { const goal=readGoal();if(goal){const achieved=progressFor(goal).achieved, note=achieved?'\n\nこの操作では達成アルバムに保存されません。\n履歴へ残したい場合は、「アルバムに残して目標を終了」を使用してください。':'';if(confirm(`「${goal.itemName}」の目標を削除しますか？\n\n貯金記録そのものは削除されません。${note}`)){localStorage.removeItem(KEY);navigate('home');renderHome();window.ChokinBadges?.evaluate?.();}} }
      if (event.target.closest('[data-goal-cancel]')) { const goal=readGoal();navigate(goal?'goal':'home');if(goal)renderDetail(); }
    });
    $('#closeGoalAchievement').onclick=()=>hideAchievement();
    $('#newGoalAfterAchievement').onclick=openGoalReplacementDialog;
    $('#confirmGoalReplacement').onclick=confirmGoalReplacement;
    $('#cancelGoalArchiveEnd').onclick=()=>$('#goalArchiveEndDialog').close();
    $('#confirmGoalArchiveEnd').onclick=confirmArchiveEnd;
    document.addEventListener('visibilitychange',syncAchievementVisibility);
    renderHome();
  }

  function exportData(){const goal=readGoal();return goal?structuredClone(goal):null;}
  function importData(value){if(value===null){localStorage.removeItem(KEY);renderHome();return true;}const goal=validateGoal(value);if(!goal)return false;writeGoal(goal);renderHome();return true;}

  const onNavigate=()=>{const overlay=$('#goalAchievement');if(overlay&&!overlay.hidden)hideAchievement(true);else stopAchievementDecorations();};
  window.ChokinSavingsGoal=Object.freeze({setup,renderHome,renderDetail,renderFormHistoryLink,exportData,importData,onNavigate,getStorageKey:()=>KEY});
})();
