(() => {
  "use strict";

  const SUPPORTED_BACKUP_VERSION = 1;
  const ROOT_FIELDS = new Set(["backupVersion", "exportedAt", "appVersion", "data"]);
  const DATA_FIELDS = new Set(["version", "entries", "settings", "futureSettings", "quickAmounts", "catCollection", "catCoins", "savingsGoal", "goalHistory", "badgeState", "dailyNotes"]);
  let options = {};
  let candidate = null;
  let restoring = false;

  const $ = (selector) => document.querySelector(selector);
  const owns = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
  const plainObject = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value);

  function metadataDate(value) {
    if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) return "記録なし";
    return new Intl.DateTimeFormat("ja-JP", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
  }

  function versionText(value) {
    if (typeof value !== "string" || !value.trim()) return "記録なし";
    const text = value.trim();
    return text.startsWith("v") ? text : `v${text}`;
  }

  function warning(level, message) {
    return { level, message };
  }

  function analyzeBackup(backup, fileName = "") {
    if (!plainObject(backup)) return { restorable: false, error: "バックアップのルート形式が正しくありません。" };
    if (backup.backupVersion !== SUPPORTED_BACKUP_VERSION) return { restorable: false, error: "対応していないバックアップ形式です。" };
    if (!plainObject(backup.data)) return { restorable: false, error: "復元に必要なデータ領域がありません。" };
    const mainState = options.normalizeMainData?.(backup.data);
    if (!mainState) return { restorable: false, error: "貯金記録または設定を読み取れません。" };

    const data = backup.data;
    const has = {
      collection: owns(data, "catCollection"),
      coins: owns(data, "catCoins"),
      goal: owns(data, "savingsGoal"),
      history: owns(data, "goalHistory"),
      badges: owns(data, "badgeState"),
      dailyNotes: owns(data, "dailyNotes"),
    };
    const inspections = {
      collection: window.ChokinCollection.inspectData(has.collection ? data.catCollection : null),
      coins: window.ChokinCoins.inspectData(has.coins ? data.catCoins : null),
      goal: window.ChokinSavingsGoal.inspectData(has.goal ? data.savingsGoal : null),
      history: window.ChokinGoalHistory.inspectData(has.history ? data.goalHistory : null),
      badges: window.ChokinBadges.inspectData(has.badges ? data.badgeState : null),
      dailyNotes: window.ChokinDailyNotes.inspectData(has.dailyNotes ? data.dailyNotes : null),
    };
    const saves = mainState.entries.filter((entry) => entry.type === "save");
    const spends = mainState.entries.filter((entry) => entry.type === "spend");
    const notices = [];
    if (!validMetadata(backup.exportedAt) || typeof backup.appVersion !== "string" || !backup.appVersion.trim()) {
      notices.push(warning("info", "作成日時またはアプリバージョンが記録されていない旧バックアップです。"));
    }
    if (!has.badges) notices.push(warning("notice", "このバックアップにはバッジデータがありません。復元後、記録から再判定します。"));
    else if (!inspections.badges.valid) notices.push(warning("notice", "バッジデータを読み取れないため、この項目は復元されません。"));
    else if (inspections.badges.anomalies) notices.push(warning("notice", `バッジデータの${inspections.badges.anomalies}項目を読み取れません。読み取れた内容だけを復元します。`));
    if (!has.history) notices.push(warning("info", "達成アルバムは含まれていません。データなしとして復元します。"));
    else if (!inspections.history.valid) notices.push(warning("notice", "達成アルバムを読み取れないため、この項目は復元されません。"));
    else if (inspections.history.invalidItems) notices.push(warning("notice", `達成アルバムの${inspections.history.invalidItems}件を読み取れません。検証済みの履歴だけを復元します。`));
    if (!has.goal) notices.push(warning("info", "現在の目標は含まれていません。設定なしとして復元します。"));
    else if (!inspections.goal.valid) notices.push(warning("notice", "現在の目標を読み取れないため、この項目は復元されません。"));
    if (!has.collection) notices.push(warning("notice", "猫図鑑は含まれていません。初期状態として復元します。"));
    else if (!inspections.collection.readable) notices.push(warning("notice", "猫図鑑を読み取れないため、安全な初期状態として復元します。"));
    else if (inspections.collection.repaired) notices.push(warning("notice", "猫図鑑の一部を読み取れません。読み取れた内容を安全な値へ補正して復元します。"));
    if (!has.coins) notices.push(warning("notice", "ねこコインは含まれていません。データなしとして復元します。"));
    else if (!inspections.coins.balanceReadable) notices.push(warning("notice", "ねこコイン残高を読み取れません。安全な初期値へ補正して復元します。"));
    if (!has.dailyNotes) notices.push(warning("info", "ひとこと日記は含まれていません。データなしとして復元します。"));
    else if (inspections.dailyNotes.invalidItems) notices.push(warning("notice", `ひとこと日記の${inspections.dailyNotes.invalidItems}件を読み取れません。検証済みの日記だけを復元します。`));

    const unknownRoot = Object.keys(backup).filter((key) => !ROOT_FIELDS.has(key));
    const unknownData = Object.keys(data).filter((key) => !DATA_FIELDS.has(key));
    if (unknownRoot.length + unknownData.length > 0) notices.push(warning("info", `未対応の保存項目が${unknownRoot.length + unknownData.length}件あります。これらは復元されません。`));
    notices.push(warning("notice", "現在の記録・設定・対応データは、このバックアップの内容に置き換わります。"));

    return {
      restorable: true,
      backup,
      mainState,
      fileName: String(fileName || "記録なし"),
      metadata: {
        exportedAt: metadataDate(backup.exportedAt),
        appVersion: versionText(backup.appVersion),
        backupVersion: String(backup.backupVersion),
      },
      summary: {
        saveCount: saves.length,
        spendCount: spends.length,
        saveTotal: saves.reduce((total, entry) => total + entry.amount, 0),
      },
      has,
      inspections,
      notices,
    };
  }

  function validMetadata(value) {
    return typeof value === "string" && Number.isFinite(Date.parse(value));
  }

  function addRow(host, label, value, stateText = "") {
    const row = document.createElement("div");
    row.className = "restore-preview-row";
    const term = document.createElement("dt");
    term.textContent = label;
    const detail = document.createElement("dd");
    const main = document.createElement("strong");
    main.textContent = value;
    detail.append(main);
    if (stateText) {
      const state = document.createElement("small");
      state.textContent = stateText;
      detail.append(state);
    }
    row.append(term, detail);
    host.append(row);
  }

  function goalValue(item) {
    if (!candidate.has.goal || item.state === "none") return ["設定なし", "データなし"];
    if (!item.valid) return ["読み取れません", "この項目は復元されません"];
    return [item.data.itemName, "復元できます"];
  }

  function historyValue(item) {
    if (!candidate.has.history) return ["データなし", "0件として復元"];
    if (!item.valid) return ["読み取れません", "この項目は復元されません"];
    return [`${item.count}件`, item.state === "partial" ? "一部を読み取れません" : "復元できます"];
  }

  function badgeValue(item) {
    if (!candidate.has.badges) return ["復元後に記録から再判定", "旧形式"];
    if (item.state === "none") return ["データなし", "復元後に記録から再判定"];
    if (!item.valid) return ["読み取れません", "この項目は復元されません"];
    return [`${item.earnedCount} / ${item.total}獲得`, item.state === "partial" ? "一部を読み取れません" : "復元できます"];
  }

  function collectionValue(item) {
    if (!candidate.has.collection) return ["データなし", "初期状態として復元"];
    if (!item.readable) return ["読み取れません", "安全な初期状態として復元"];
    return [`${item.obtained} / ${item.total}匹`, item.state === "partial" ? "一部を読み取れません" : "復元できます"];
  }

  function coinValue(item) {
    if (!candidate.has.coins) return ["データなし", "初期状態として復元"];
    if (!item.balanceReadable) return ["読み取れません", "安全な初期値へ補正"];
    return [`${item.balance}枚`, "復元できます"];
  }

  function dailyNoteValue(item) {
    if (!candidate.has.dailyNotes) return ["データなし", "日記なしとして復元"];
    return [`${item.noteCount}件`, item.invalidItems ? "一部を読み取れません" : "復元できます"];
  }

  function renderCandidate() {
    const meta = $("#restorePreviewMeta");
    const items = $("#restorePreviewItems");
    const warnings = $("#restorePreviewWarnings");
    meta.replaceChildren();
    items.replaceChildren();
    warnings.replaceChildren();
    addRow(meta, "ファイル名", candidate.fileName);
    addRow(meta, "作成日時", candidate.metadata.exportedAt);
    addRow(meta, "アプリバージョン", candidate.metadata.appVersion);
    addRow(meta, "バックアップ形式", `v${candidate.metadata.backupVersion}`);
    addRow(items, "貯金記録", `${candidate.summary.saveCount}件`, "復元できます");
    addRow(items, "出費記録", `${candidate.summary.spendCount}件`, "復元できます");
    addRow(items, "累計貯金額", `${candidate.summary.saveTotal.toLocaleString("ja-JP")}円`, "出費は減算しません");
    addRow(items, "現在の目標", ...goalValue(candidate.inspections.goal));
    addRow(items, "達成アルバム", ...historyValue(candidate.inspections.history));
    addRow(items, "実績・バッジ", ...badgeValue(candidate.inspections.badges));
    addRow(items, "猫図鑑", ...collectionValue(candidate.inspections.collection));
    addRow(items, "ねこコイン", ...coinValue(candidate.inspections.coins));
    addRow(items, "ひとこと日記", ...dailyNoteValue(candidate.inspections.dailyNotes));
    candidate.notices.forEach((notice) => {
      const item = document.createElement("p");
      item.className = `restore-preview-notice is-${notice.level}`;
      const label = document.createElement("strong");
      label.textContent = notice.level === "error" ? "復元不可" : notice.level === "notice" ? "注意" : "情報";
      const text = document.createElement("span");
      text.textContent = notice.message;
      item.append(label, text);
      warnings.append(item);
    });
    $("#confirmRestorePreview").disabled = !candidate.restorable;
    $("#restorePreviewStatus").textContent = "内容を確認してから復元してください。";
  }

  function showReadError(message) {
    const host = $("#restoreReadError");
    host.textContent = message;
    host.hidden = false;
  }

  function clearReadError() {
    const host = $("#restoreReadError");
    host.textContent = "";
    host.hidden = true;
  }

  function clearCandidate({ focus = true } = {}) {
    candidate = null;
    restoring = false;
    const input = $("#backupFile");
    if (input) input.value = "";
    const dialog = $("#restorePreviewDialog");
    if (dialog?.open) dialog.close();
    $("#confirmRestorePreview").disabled = false;
    $("#restorePreviewStatus").textContent = "";
    if (focus) window.setTimeout(() => $("#importBackup")?.focus(), 0);
  }

  async function selectFile(file) {
    candidate = null;
    clearReadError();
    if (!file) return;
    let parsed;
    try {
      parsed = JSON.parse(await file.text());
    } catch {
      showReadError("バックアップを読み取れませんでした。JSONファイルが壊れているか、対応していない形式です。");
      $("#backupFile").value = "";
      return;
    }
    const analyzed = analyzeBackup(parsed, file.name);
    if (!analyzed.restorable) {
      showReadError(`バックアップを復元できません。${analyzed.error}`);
      $("#backupFile").value = "";
      return;
    }
    candidate = analyzed;
    renderCandidate();
    const dialog = $("#restorePreviewDialog");
    dialog.showModal();
    window.setTimeout(() => $("#cancelRestorePreview")?.focus(), 0);
  }

  async function confirmRestore() {
    if (!candidate || restoring || !candidate.restorable) return;
    restoring = true;
    const button = $("#confirmRestorePreview");
    const status = $("#restorePreviewStatus");
    button.disabled = true;
    status.textContent = "復元しています。しばらくお待ちください。";
    let result;
    try {
      result = await options.applyCandidate(candidate);
    } catch (error) {
      result = { ok: false, rollbackOk: false, message: error?.message || "復元処理に失敗しました。" };
    }
    if (!result?.ok) {
      restoring = false;
      button.disabled = false;
      status.textContent = result?.rollbackOk === false
        ? "復元に失敗し、元データの復旧も完了できませんでした。アプリを閉じずにバックアップを書き出してください。"
        : `復元に失敗しました。現在のデータは元の状態へ戻しました。${result?.message || ""}`;
      status.focus();
      return;
    }
    clearCandidate({ focus: false });
    options.onRestored?.(result);
    window.setTimeout(() => $("#importBackup")?.focus(), 0);
  }

  function trapFocus(event) {
    if (event.key !== "Tab") return;
    const dialog = $("#restorePreviewDialog");
    const focusables = [...dialog.querySelectorAll("button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex='-1'])")];
    if (!focusables.length) return;
    const first = focusables[0], last = focusables[focusables.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }

  function setup(nextOptions) {
    options = nextOptions;
    $("#importBackup").addEventListener("click", () => $("#backupFile").click());
    $("#backupFile").addEventListener("change", (event) => selectFile(event.target.files?.[0]));
    $("#cancelRestorePreview").addEventListener("click", () => clearCandidate());
    $("#confirmRestorePreview").addEventListener("click", confirmRestore);
    const dialog = $("#restorePreviewDialog");
    dialog.addEventListener("cancel", (event) => { event.preventDefault(); if (!restoring) clearCandidate(); });
    dialog.addEventListener("click", (event) => { if (event.target === dialog && !restoring) clearCandidate(); });
    dialog.addEventListener("keydown", trapFocus);
  }

  window.ChokinRestorePreview = Object.freeze({ setup, analyzeBackup });
})();
