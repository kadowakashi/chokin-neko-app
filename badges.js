(() => {
  "use strict";

  const STORAGE_KEY = "chokin-event-app.badgeState.v1";
  const SCHEMA_VERSION = 1;
  const CATEGORY_ORDER = ["count", "days", "amount", "goals"];
  const CATEGORY_LABELS = {
    count: "貯金回数",
    days: "貯金した日",
    amount: "累計貯金額",
    goals: "目標達成",
  };
  const DEFINITIONS = Object.freeze([
    { id: "save-count-1", category: "count", name: "はじめての貯金", description: "最初の一歩を記録しました！", threshold: 1, metric: "saveCount", visualTier: "bronze", iconType: "paw", sortOrder: 10 },
    { id: "save-count-10", category: "count", name: "貯金10回", description: "コツコツ10回、積み重ねました！", threshold: 10, metric: "saveCount", visualTier: "silver", iconType: "paw-star", sortOrder: 20 },
    { id: "save-count-30", category: "count", name: "貯金30回", description: "30回分の貯金が集まりました！", threshold: 30, metric: "saveCount", visualTier: "gold", iconType: "paw-stars", sortOrder: 30 },
    { id: "save-count-100", category: "count", name: "貯金100回", description: "100回の積み重ねが形になりました！", threshold: 100, metric: "saveCount", visualTier: "gold", iconType: "paw-crown", sortOrder: 40 },
    { id: "save-days-10", category: "days", name: "貯金した日10日", description: "10日分の肉球が集まりました！", threshold: 10, metric: "saveDays", visualTier: "blue", iconType: "calendar-paw", sortOrder: 50 },
    { id: "save-days-30", category: "days", name: "貯金した日30日", description: "30日分、貯金した日が増えました！", threshold: 30, metric: "saveDays", visualTier: "violet", iconType: "calendar-star", sortOrder: 60 },
    { id: "save-total-1000", category: "amount", name: "累計1,000円", description: "貯金の合計が1,000円になりました！", threshold: 1000, metric: "saveTotal", visualTier: "silver", iconType: "coin", sortOrder: 70 },
    { id: "save-total-10000", category: "amount", name: "累計10,000円", description: "貯金の合計が10,000円になりました！", threshold: 10000, metric: "saveTotal", visualTier: "gold", iconType: "coin-halo", sortOrder: 80 },
    { id: "goal-count-1", category: "goals", name: "はじめての目標達成", description: "最初の目標を達成しました！", threshold: 1, metric: "goalCount", visualTier: "silver", iconType: "flag-star", sortOrder: 90 },
    { id: "goal-count-3", category: "goals", name: "目標達成3回", description: "3つの目標を達成しました！", threshold: 3, metric: "goalCount", visualTier: "gold", iconType: "trophy-stars", sortOrder: 100 },
  ]);
  const DEFINITION_BY_ID = new Map(DEFINITIONS.map((definition) => [definition.id, definition]));

  let options = {
    getEntries: () => [],
    getSettings: () => ({ sound: true, vibration: true, effects: true }),
    navigate: () => {},
  };
  let state = createDefaultState();
  let loaded = false;
  let writable = true;
  let readHadAnomalies = false;
  let pendingIds = new Set();
  let pendingKind = "new";
  let displaying = null;
  let retryTimer = 0;

  function createDefaultState() {
    return {
      schemaVersion: SCHEMA_VERSION,
      earned: {},
      announcedBadgeIds: [],
      initialBackfillHandled: false,
    };
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function isPlainObject(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
  }

  function validDate(value) {
    return typeof value === "string" && value.trim() !== "" && Number.isFinite(Date.parse(value));
  }

  function normalizeState(value) {
    if (!isPlainObject(value) || value.schemaVersion !== SCHEMA_VERSION || !isPlainObject(value.earned) || !Array.isArray(value.announcedBadgeIds) || typeof value.initialBackfillHandled !== "boolean") {
      return null;
    }
    const earned = {};
    let anomalies = 0;
    Object.entries(value.earned).forEach(([id, earnedAt]) => {
      if (DEFINITION_BY_ID.has(id) && (earnedAt === null || validDate(earnedAt))) earned[id] = earnedAt;
      else anomalies += 1;
    });
    const announcedBadgeIds = [...new Set(value.announcedBadgeIds.filter((id) => typeof id === "string" && DEFINITION_BY_ID.has(id)))];
    anomalies += value.announcedBadgeIds.length - announcedBadgeIds.length;
    return { data: {
        schemaVersion: SCHEMA_VERSION,
        earned,
        announcedBadgeIds,
        initialBackfillHandled: value.initialBackfillHandled,
      }, anomalies };
  }

  function loadState() {
    if (loaded) return;
    loaded = true;
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) return;
    try {
      const normalized = normalizeState(JSON.parse(raw));
      if (!normalized) throw new Error("バッジデータの形式が不正です");
      state = normalized.data;
      readHadAnomalies = normalized.anomalies > 0;
    } catch (error) {
      writable = false;
      console.warn("バッジデータを変更せず、安全な一時状態で起動しました。", error);
    }
  }

  function persist() {
    if (!writable) return false;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      readHadAnomalies = false;
      return true;
    } catch (error) {
      writable = false;
      console.warn("バッジデータを保存できませんでした。", error);
      return false;
    }
  }

  function amountOf(entry) {
    const amount = Number(entry?.amount);
    return Number.isInteger(amount) && amount > 0 ? amount : 0;
  }

  function getValidSaves(entries = options.getEntries()) {
    return (Array.isArray(entries) ? entries : [])
      .filter((entry) => entry?.type === "save" && amountOf(entry) > 0 && validDate(entry?.createdAt))
      .map((entry) => ({ ...entry, amount: amountOf(entry), timestamp: Date.parse(entry.createdAt) }))
      .sort((a, b) => a.timestamp - b.timestamp);
  }

  function localDateKey(value) {
    const date = new Date(value);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function goalFingerprint(goal) {
    if (!goal || typeof goal !== "object") return "";
    if (typeof goal.id === "string" && goal.id) return `id:${goal.id}`;
    return `v1:${JSON.stringify([goal.createdAt || "", goal.itemName || "", Number(goal.targetAmount) || 0])}`;
  }

  function currentGoalAchievement(goal, saves) {
    if (!goal || goal.status === "ended") return null;
    const targetAmount = Number(goal.targetAmount);
    const startingAmount = Number(goal.startingAmount) || 0;
    if (!Number.isFinite(targetAmount) || targetAmount <= 0) return null;
    const createdAt = validDate(goal.createdAt) ? Date.parse(goal.createdAt) : -Infinity;
    let progress = startingAmount;
    let achievedAt = validDate(goal.achievedAt) ? goal.achievedAt : null;
    if (progress >= targetAmount && !achievedAt) achievedAt = validDate(goal.createdAt) ? goal.createdAt : null;
    for (const save of saves) {
      if (save.timestamp < createdAt) continue;
      progress += save.amount;
      if (progress >= targetAmount && !achievedAt) achievedAt = save.createdAt;
    }
    return progress >= targetAmount ? { fingerprint: goalFingerprint(goal), achievedAt } : null;
  }

  function getGoalAchievements(saves) {
    const result = new Map();
    const history = window.ChokinGoalHistory?.exportData?.();
    (Array.isArray(history?.items) ? history.items : []).forEach((item) => {
      const fingerprint = typeof item.sourceGoalFingerprint === "string" && item.sourceGoalFingerprint
        ? item.sourceGoalFingerprint
        : goalFingerprint(item);
      if (!fingerprint || result.has(fingerprint)) return;
      const achievedAt = validDate(item.achievedAt) ? item.achievedAt : (validDate(item.archivedAt) ? item.archivedAt : null);
      result.set(fingerprint, { fingerprint, achievedAt });
    });
    const current = window.ChokinSavingsGoal?.exportData?.();
    const currentAchievement = currentGoalAchievement(current, saves);
    if (currentAchievement?.fingerprint && !result.has(currentAchievement.fingerprint)) {
      result.set(currentAchievement.fingerprint, currentAchievement);
    }
    return [...result.values()];
  }

  function calculateMetrics(entries) {
    const saves = getValidSaves(entries);
    const days = new Map();
    let total = 0;
    const totalCrossings = [];
    saves.forEach((save) => {
      if (!days.has(localDateKey(save.createdAt))) days.set(localDateKey(save.createdAt), save.createdAt);
      total += save.amount;
      totalCrossings.push({ total, createdAt: save.createdAt });
    });
    const goals = getGoalAchievements(saves);
    return {
      saveCount: saves.length,
      saveDays: days.size,
      saveTotal: total,
      goalCount: goals.length,
      saves,
      dayDates: [...days.values()],
      totalCrossings,
      goalDates: goals.map((goal) => goal.achievedAt),
    };
  }

  function reachedAt(definition, metrics) {
    if (definition.metric === "saveCount") return metrics.saves[definition.threshold - 1]?.createdAt || null;
    if (definition.metric === "saveDays") return metrics.dayDates[definition.threshold - 1] || null;
    if (definition.metric === "saveTotal") return metrics.totalCrossings.find((item) => item.total >= definition.threshold)?.createdAt || null;
    if (definition.metric === "goalCount") {
      if (metrics.goalDates.some((date) => !validDate(date))) return null;
      return [...metrics.goalDates].sort((a, b) => Date.parse(a) - Date.parse(b))[definition.threshold - 1] || null;
    }
    return null;
  }

  function queueBadges(ids, kind) {
    const announced = new Set(state.announcedBadgeIds);
    ids.forEach((id) => {
      if (DEFINITION_BY_ID.has(id) && !announced.has(id) && !displaying?.ids.includes(id)) pendingIds.add(id);
    });
    if (kind === "backfill") pendingKind = "backfill";
  }

  function evaluate({ queue = true } = {}) {
    loadState();
    const metrics = calculateMetrics();
    let changed = false;
    let earnedChanged = false;
    DEFINITIONS.forEach((definition) => {
      if (metrics[definition.metric] >= definition.threshold && !Object.prototype.hasOwnProperty.call(state.earned, definition.id)) {
        state.earned[definition.id] = reachedAt(definition, metrics);
        changed = true;
        earnedChanged = true;
      }
    });
    const unannounced = DEFINITIONS.filter((definition) => Object.prototype.hasOwnProperty.call(state.earned, definition.id) && !state.announcedBadgeIds.includes(definition.id)).map((definition) => definition.id);
    if (!state.initialBackfillHandled) {
      if (unannounced.length > 0) {
        if (queue) queueBadges(unannounced, "backfill");
      } else {
        state.initialBackfillHandled = true;
        changed = true;
      }
    } else if (queue && unannounced.length > 0) {
      queueBadges(unannounced, "new");
    }
    if (changed && (!readHadAnomalies || earnedChanged)) persist();
    renderSettings();
    if (document.getElementById("badges")?.classList.contains("active")) renderScreen();
    if (queue) tryShowQueued();
    return metrics;
  }

  function isPresentationBusy() {
    const celebration = document.getElementById("celebration");
    if (celebration && (celebration.classList.contains("show") || celebration.getAttribute("aria-hidden") === "false")) return true;
    const goalAchievement = document.getElementById("goalAchievement");
    if (goalAchievement && !goalAchievement.hidden) return true;
    return [...document.querySelectorAll("dialog[open]")].some((dialog) => dialog.id !== "badgeEarnedDialog");
  }

  function retryLater() {
    if (retryTimer) return;
    retryTimer = window.setTimeout(() => {
      retryTimer = 0;
      tryShowQueued();
    }, 250);
  }

  function iconMarkup(iconType) {
    const common = 'viewBox="0 0 64 64" aria-hidden="true"';
    const paw = '<ellipse cx="32" cy="41" rx="14" ry="11"/><circle cx="17" cy="27" r="6"/><circle cx="29" cy="19" r="6"/><circle cx="43" cy="21" r="6"/><circle cx="49" cy="32" r="6"/>';
    const star = '<path d="m49 8 2.7 5.5 6.1.9-4.4 4.3 1 6-5.4-2.9-5.4 2.9 1-6-4.4-4.3 6.1-.9z"/>';
    if (iconType === "paw-star") return `<svg ${common}>${paw}${star}</svg>`;
    if (iconType === "paw-stars") return `<svg ${common}>${paw}${star}<path d="m13 5 2 4 4.4.7-3.2 3.1.8 4.4-4-2.1-4 2.1.8-4.4-3.2-3.1 4.4-.7z"/></svg>`;
    if (iconType === "paw-crown") return `<svg ${common}>${paw}<path d="M18 11l8 6 6-10 6 10 8-6-3 13H21z"/></svg>`;
    if (iconType === "calendar-paw") return `<svg ${common}><rect x="9" y="13" width="46" height="42" rx="8"/><path d="M9 25h46M21 8v11M43 8v11"/><ellipse cx="32" cy="43" rx="8" ry="6"/><circle cx="23" cy="36" r="3"/><circle cx="30" cy="33" r="3"/><circle cx="38" cy="34" r="3"/><circle cx="42" cy="40" r="3"/></svg>`;
    if (iconType === "calendar-star") return `<svg ${common}><rect x="8" y="14" width="42" height="40" rx="8"/><path d="M8 25h42M19 9v11M39 9v11"/>${star}</svg>`;
    if (iconType === "coin" || iconType === "coin-halo") return `<svg ${common}>${iconType === "coin-halo" ? '<circle cx="32" cy="32" r="29" stroke-dasharray="4 5"/>' : ''}<circle cx="32" cy="32" r="23"/><circle cx="32" cy="32" r="16"/><path d="M23 24h18M26 31h12M32 24v19M24 37c3 4 13 4 16 0"/></svg>`;
    if (iconType === "flag-star") return `<svg ${common}><path d="M16 54V10M17 12h29l-7 10 7 10H17"/>${star}</svg>`;
    if (iconType === "trophy-stars") return `<svg ${common}><path d="M20 17h24v11c0 9-5 15-12 17-7-2-12-8-12-17zM25 45h14M23 53h18M20 21H11v5c0 8 5 12 11 13M44 21h9v5c0 8-5 12-11 13"/><path d="m10 8 2 4 4 .6-3 3 .8 4-3.8-2-3.8 2 .8-4-3-3 4-.6zm44 0 2 4 4 .6-3 3 .8 4-3.8-2-3.8 2 .8-4-3-3 4-.6z"/></svg>`;
    return `<svg ${common}>${paw}</svg>`;
  }

  function playFeedback() {
    const settings = options.getSettings() || {};
    if (settings.vibration !== false && navigator.vibrate) {
      try { navigator.vibrate([35, 40, 55]); } catch (_) { /* 非対応端末では何もしない */ }
    }
    if (settings.sound === false) return;
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return;
      const context = new AudioContextClass();
      [523.25, 659.25, 783.99].forEach((frequency, index) => {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.type = "sine";
        oscillator.frequency.value = frequency;
        gain.gain.setValueAtTime(0.0001, context.currentTime + index * 0.08);
        gain.gain.exponentialRampToValueAtTime(0.12, context.currentTime + index * 0.08 + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + index * 0.08 + 0.22);
        oscillator.connect(gain).connect(context.destination);
        oscillator.start(context.currentTime + index * 0.08);
        oscillator.stop(context.currentTime + index * 0.08 + 0.24);
      });
      window.setTimeout(() => context.close().catch(() => {}), 700);
    } catch (_) { /* 音声失敗でも表示を継続する */ }
  }

  function showBatch(ids, kind) {
    const dialog = document.getElementById("badgeEarnedDialog");
    const title = document.getElementById("badgeEarnedTitle");
    const list = document.getElementById("badgeEarnedList");
    const stars = document.getElementById("badgeEarnedStars");
    if (!dialog || !title || !list || !stars) return;
    displaying = { ids: [...ids], kind };
    title.textContent = kind === "backfill"
      ? `これまでの記録から${ids.length}個のバッジを獲得しました！`
      : ids.length === 1 ? "新しいバッジを獲得！" : `新しいバッジを${ids.length}個獲得！`;
    list.replaceChildren();
    ids.slice(0, 3).forEach((id) => {
      const definition = DEFINITION_BY_ID.get(id);
      const item = document.createElement("div");
      item.className = `badge-modal-item tier-${definition.visualTier}`;
      item.innerHTML = `<span class="badge-modal-icon">${iconMarkup(definition.iconType)}</span>`;
      const name = document.createElement("strong");
      name.textContent = definition.name;
      const description = document.createElement("small");
      description.textContent = definition.description;
      const copy = document.createElement("span");
      copy.append(name, description);
      item.append(copy);
      list.append(item);
    });
    if (ids.length > 3) {
      const rest = document.createElement("p");
      rest.className = "badge-modal-rest";
      rest.textContent = `ほか${ids.length - 3}個`; 
      list.append(rest);
    }
    stars.replaceChildren();
    const settings = options.getSettings() || {};
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    dialog.classList.toggle("reduced", settings.effects === false || reduced);
    if (settings.effects !== false && !reduced) {
      for (let index = 0; index < 20; index += 1) {
        const star = document.createElement("i");
        star.style.setProperty("--x", `${8 + ((index * 37) % 84)}%`);
        star.style.setProperty("--y", `${5 + ((index * 23) % 82)}%`);
        star.style.setProperty("--delay", `${(index % 7) * 70}ms`);
        stars.append(star);
      }
    }
    dialog.showModal();
    playFeedback();
  }

  function tryShowQueued() {
    if (displaying || pendingIds.size === 0 || document.visibilityState === "hidden") return;
    if (isPresentationBusy()) {
      retryLater();
      return;
    }
    showBatch([...pendingIds].sort((a, b) => DEFINITION_BY_ID.get(a).sortOrder - DEFINITION_BY_ID.get(b).sortOrder), pendingKind);
  }

  function acknowledge(showCollection) {
    if (!displaying) return;
    displaying.ids.forEach((id) => {
      if (!state.announcedBadgeIds.includes(id)) state.announcedBadgeIds.push(id);
      pendingIds.delete(id);
    });
    if (displaying.kind === "backfill") state.initialBackfillHandled = true;
    persist();
    const dialog = document.getElementById("badgeEarnedDialog");
    displaying = null;
    dialog?.close();
    renderSettings();
    if (showCollection) {
      options.navigate("badges");
      renderScreen();
    }
    evaluate();
  }

  function formatProgress(definition, value) {
    const safeValue = Math.max(0, Number(value) || 0);
    if (definition.metric === "saveTotal") return `${safeValue.toLocaleString("ja-JP")} / ${definition.threshold.toLocaleString("ja-JP")}円`;
    if (definition.metric === "saveDays") return `${safeValue} / ${definition.threshold}日`;
    return `${safeValue} / ${definition.threshold}回`;
  }

  function formatEarnedAt(value) {
    if (!validDate(value)) return "獲得済み";
    return `${new Intl.DateTimeFormat("ja-JP", { year: "numeric", month: "short", day: "numeric" }).format(new Date(value))}獲得`;
  }

  function formatRemaining(definition, value) {
    const remaining = Math.max(0, definition.threshold - Math.max(0, Number(value) || 0));
    if (definition.metric === "saveTotal") return `あと${remaining.toLocaleString("ja-JP")}円`;
    if (definition.metric === "saveDays") return `あと${remaining}日`;
    return `あと${remaining}回`;
  }

  function makeCard(definition, metrics) {
    const earned = Object.prototype.hasOwnProperty.call(state.earned, definition.id);
    const current = Math.max(0, Number(metrics[definition.metric]) || 0);
    const ratio = Math.min(1, current / definition.threshold);
    const card = document.createElement("article");
    card.className = `badge-card tier-${definition.visualTier} ${earned ? "is-earned" : "is-progress"}`;
    const icon = document.createElement("div");
    icon.className = "badge-icon";
    icon.innerHTML = iconMarkup(definition.iconType);
    const body = document.createElement("div");
    body.className = "badge-card-body";
    const name = document.createElement("h4");
    name.textContent = definition.name;
    const description = document.createElement("p");
    description.textContent = definition.description;
    const progressText = document.createElement("div");
    progressText.className = "badge-progress-text";
    progressText.textContent = earned ? formatEarnedAt(state.earned[definition.id]) : `現在 ${formatProgress(definition, current)}　${formatRemaining(definition, current)}`;
    const track = document.createElement("div");
    track.className = "badge-progress-track";
    const fill = document.createElement("span");
    fill.style.width = `${ratio * 100}%`;
    track.append(fill);
    body.append(name, description, progressText, track);
    card.append(icon, body);
    return card;
  }

  function renderScreen() {
    loadState();
    const groups = document.getElementById("badgeGroups");
    const count = document.getElementById("badgeEarnedCount");
    const next = document.getElementById("badgeNext");
    if (!groups || !count || !next) return;
    const metrics = calculateMetrics();
    const earnedCount = DEFINITIONS.filter((definition) => Object.prototype.hasOwnProperty.call(state.earned, definition.id)).length;
    count.textContent = `${earnedCount} / ${DEFINITIONS.length} 獲得`;
    const nextDefinition = DEFINITIONS
      .filter((definition) => !Object.prototype.hasOwnProperty.call(state.earned, definition.id))
      .sort((a, b) => {
        const ratioA = Math.min(1, metrics[a.metric] / a.threshold);
        const ratioB = Math.min(1, metrics[b.metric] / b.threshold);
        return ratioB - ratioA || a.sortOrder - b.sortOrder;
      })[0];
    next.replaceChildren();
    next.classList.remove("is-complete");
    if (nextDefinition) {
      const label = document.createElement("span");
      label.textContent = "次のバッジ";
      const name = document.createElement("strong");
      name.textContent = nextDefinition.name;
      const progress = document.createElement("small");
      progress.textContent = formatProgress(nextDefinition, metrics[nextDefinition.metric]);
      const remaining = document.createElement("small");
      remaining.textContent = formatRemaining(nextDefinition, metrics[nextDefinition.metric]);
      next.append(label, name, progress, remaining);
    } else {
      next.classList.add("is-complete");
      const complete = document.createElement("strong");
      complete.textContent = `${DEFINITIONS.length}個すべて獲得しました！`;
      const message = document.createElement("small");
      message.textContent = "今後追加されるバッジもお楽しみに";
      next.append(complete, message);
    }
    groups.replaceChildren();
    CATEGORY_ORDER.forEach((category) => {
      const section = document.createElement("section");
      section.className = "badge-category";
      const heading = document.createElement("h3");
      heading.textContent = CATEGORY_LABELS[category];
      const grid = document.createElement("div");
      grid.className = "badge-grid";
      DEFINITIONS.filter((definition) => definition.category === category).forEach((definition) => grid.append(makeCard(definition, metrics)));
      section.append(heading, grid);
      groups.append(section);
    });
  }

  function renderSettings() {
    loadState();
    const summary = document.getElementById("badgeSettingsSummary");
    if (!summary) return;
    const earnedCount = DEFINITIONS.filter((definition) => Object.prototype.hasOwnProperty.call(state.earned, definition.id)).length;
    summary.textContent = `${earnedCount} / ${DEFINITIONS.length} 獲得`;
  }

  function exportData() {
    loadState();
    return clone(state);
  }

  function importData(value) {
    pendingIds.clear();
    displaying = null;
    if (value == null) {
      try { localStorage.removeItem(STORAGE_KEY); } catch (_) { /* 旧バックアップ復元は他データを優先する */ }
      state = createDefaultState();
      loaded = true;
      writable = true;
      readHadAnomalies = false;
      renderSettings();
      return true;
    }
    const normalized = normalizeState(value);
    if (!normalized) return false;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized.data));
      state = normalized.data;
      loaded = true;
      writable = true;
      readHadAnomalies = false;
      renderSettings();
      return true;
    } catch (error) {
      console.warn("バッジデータを復元できませんでした。", error);
      return false;
    }
  }

  function setup(nextOptions = {}) {
    options = { ...options, ...nextOptions };
    loadState();
    document.getElementById("badgeModalClose")?.addEventListener("click", () => acknowledge(false));
    document.getElementById("badgeModalView")?.addEventListener("click", () => acknowledge(true));
    document.getElementById("badgeEarnedDialog")?.addEventListener("cancel", (event) => event.preventDefault());
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState !== "hidden") tryShowQueued();
    });
    renderSettings();
  }

  function getSnapshot() {
    loadState();
    return { state: clone(state), metrics: clone(calculateMetrics()), writable };
  }

  window.ChokinBadges = {
    setup,
    evaluate,
    renderScreen,
    renderSettings,
    tryShowQueued,
    exportData,
    importData,
    getStorageKey: () => STORAGE_KEY,
    getDefinitions: () => clone(DEFINITIONS),
    getSnapshot,
  };
})();
