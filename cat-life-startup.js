(function (root) {
  'use strict';

  const FINANCIAL_JOURNAL_KEY = 'chokin-event-app.catLifeFinancialJournal.v1';
  const RESTORE_JOURNAL_KEY = 'chokin-event-app.catLifeRestoreJournal.v1';
  const PROGRESSION_JOURNAL_KEY = 'chokin-event-app.catLifeGoalProgressionJournal.v1';
  const GACHA_JOURNAL_KEY = 'chokin-event-app.gachaTransactionJournal.v2';
  const LEGACY_GACHA_JOURNAL_KEY = 'chokin-event-app.gachaTransaction.v1';
  const SCRIPT_PATH = /^\.\/[a-z0-9][a-z0-9._-]*\.js\?v=[0-9]+(?:\.[0-9]+)*$/i;
  const main = document.querySelector('main');
  const startState = status => document.documentElement.setAttribute('data-app-startup', status);

  function scriptList() {
    const element = document.getElementById('chokinAppScripts');
    if (!element || element.type !== 'application/json') throw new Error('Application script configuration is unavailable.');
    const list = JSON.parse(element.textContent);
    if (!Array.isArray(list) || !list.length || !list.every(path => typeof path === 'string' && SCRIPT_PATH.test(path))) throw new Error('Invalid application script configuration.');
    const names = list.map(path => path.split('?')[0]);
    if (new Set(names).size !== list.length || names.at(-1) !== './app.js') throw new Error('Application script order is invalid.');
    const gacha = names.indexOf('./gacha-transaction.js');
    if (gacha < 0 || names.indexOf('./cat-collection.js') <= gacha || names.indexOf('./cat-coins.js') <= gacha) throw new Error('Gacha recovery must precede store initialization.');
    return list;
  }

  function loadScript(path) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      const url = new URL(path, document.baseURI);
      let evaluationError = false;
      const onError = event => {
        if (event instanceof ErrorEvent && event.filename === url.href) evaluationError = true;
      };
      const finish = failed => {
        root.removeEventListener('error', onError, true);
        script.onload = null;
        script.onerror = null;
        if (failed || evaluationError) reject(new Error('An application component could not be started.'));
        else resolve();
      };
      root.addEventListener('error', onError, true);
      script.async = false;
      script.src = url.href;
      script.onload = () => finish(false);
      script.onerror = () => finish(true);
      document.head.append(script);
    });
  }

  async function recoverBeforeInitialization(storage) {
    const financialPending = storage.getItem(FINANCIAL_JOURNAL_KEY) !== null;
    const restorePending = storage.getItem(RESTORE_JOURNAL_KEY) !== null;
    const progressionPending = storage.getItem(PROGRESSION_JOURNAL_KEY) !== null;
    if (!financialPending && !restorePending && !progressionPending) return { financialBlocked: false };
    const gachaPending = storage.getItem(GACHA_JOURNAL_KEY) !== null || storage.getItem(LEGACY_GACHA_JOURNAL_KEY) !== null;
    if ([financialPending, restorePending, progressionPending].filter(Boolean).length > 1 || gachaPending) throw new Error('Multiple unresolved state operations require review.');
    try {
    // These modules are pure until create/recover is called. No collection/coin initialization has run.
    await Promise.all([
      import('./cat-life.js?v=1'),
      import('./cat-life-runtime.js?v=2'),
      import('./cat-life-events.js?v=2'),
      import('./cat-life-financial.js?v=1'),
      import('./cat-life-financial-transaction.js?v=3'),
      progressionPending || restorePending ? import('./cat-life-goal-progression.js?v=1') : Promise.resolve(),
      progressionPending ? import('./cat-life-goal-progression-runtime.js?v=1') : Promise.resolve(),
      financialPending ? import('./cat-life-financial-runtime.js?v=2') : restorePending ? import('./cat-life-restore.js?v=3') : Promise.resolve()
    ]);
    const response = await fetch('./assets/cats/cat-world.json?v=1', { credentials: 'same-origin' });
    if (!response.ok) throw new Error('The cat life master is unavailable for recovery.');
    const catWorld = await response.json();
    const lifeRuntime = root.ChokinCatLifeRuntimeLoader.createRuntime({ catLife: root.ChokinCatLife, catWorld, storage });
    const events = root.ChokinCatLifeEvents;
    const model = root.ChokinCatLifeFinancial.createModel({ life: root.ChokinCatLife, events, runtime: root.ChokinCatLifeRuntimeLoader });
    let operation;
    if (financialPending) {
      operation = root.ChokinCatLifeFinancialRuntime.create({
        storage, lifeRuntime, eventRuntime: events.createRuntime({ storage }), model,
        transactions: root.ChokinCatLifeFinancialTransaction, events, financialKey: root.ChokinCatLifeFinancial.STORAGE_KEY
      });
    } else if (restorePending) {
      const progression = root.ChokinCatLifeGoalProgression;
      const progressionModel = progression.createModel({ life: root.ChokinCatLife, catWorld });
      operation = root.ChokinCatLifeRestore.create({ storage, lifeRuntime, events, model, transactions: root.ChokinCatLifeFinancialTransaction, activation: root.ChokinCatLifeFinancialActivation, progression, progressionModel });
    } else {
      const progression = root.ChokinCatLifeGoalProgression;
      const progressionModel = progression.createModel({ life: root.ChokinCatLife, catWorld });
      operation = root.ChokinCatLifeGoalProgressionRuntime.create({ storage, lifeRuntime, model: progressionModel, progression, transactions: root.ChokinCatLifeFinancialTransaction });
    }
    operation.recover();
    if (operation.pending() || storage.getItem(FINANCIAL_JOURNAL_KEY) !== null || storage.getItem(RESTORE_JOURNAL_KEY) !== null || storage.getItem(PROGRESSION_JOURNAL_KEY) !== null) throw new Error('The saved state could not be recovered safely.');
    return { financialBlocked: false };
    } catch (error) {
      // The financial journal does not contain the user's saving/spending or coin stores.
      // Preserve it and keep unrelated functions available; their cat-life writers remain blocked.
      if (financialPending && !restorePending) return { financialBlocked: true };
      throw error;
    }
  }

  function showFinancialStop() {
    document.documentElement.setAttribute('data-financial-startup', 'blocked');
    const panel = document.createElement('p');
    panel.setAttribute('role', 'status');
    panel.textContent = '猫たちの暮らしの保存状態を確認できないため、暮らし・ガチャの処理を停止しています。貯金・出費の記録は利用できます。データを初期化せず、再読み込み後も続く場合はサポートへご相談ください。';
    document.body.prepend(panel);
  }

  function showSafeStop() {
    startState('blocked');
    if (main) main.inert = true;
    const panel = document.createElement('section');
    panel.setAttribute('role', 'alert');
    panel.setAttribute('aria-live', 'assertive');
    const title = document.createElement('h1');
    title.textContent = '保存状態の確認のため、起動を停止しました';
    const text = document.createElement('p');
    text.textContent = '保存データは削除されていません。アプリを再読み込みしてください。続く場合は、データを初期化せずサポートへご相談ください。';
    const reload = document.createElement('button');
    reload.type = 'button';
    reload.textContent = '再読み込み';
    reload.addEventListener('click', () => root.location.reload());
    panel.append(title, text, reload);
    document.body.prepend(panel);
  }

  async function start() {
    startState('loading');
    if (main) main.inert = true;
    try {
      const scripts = scriptList();
      const coordination = root.ChokinCatLifeCoordination;
      if (typeof coordination?.runStartup !== 'function') throw new Error('State coordination is unavailable.');
      let financialBlocked = false;
      await coordination.runStartup(async () => {
        ({ financialBlocked } = await recoverBeforeInitialization(root.localStorage));
        for (const path of scripts) {
          await loadScript(path);
          if (!financialBlocked && path.split('?')[0] === './gacha-transaction.js' && root.ChokinGachaTransaction?.ensureReady?.() !== true) throw new Error('Gacha recovery did not complete.');
        }
      });
      if (main) main.inert = false;
      startState('ready');
      if (financialBlocked) showFinancialStop();
    } catch {
      showSafeStop();
    }
  }
  void start();
})(window);
