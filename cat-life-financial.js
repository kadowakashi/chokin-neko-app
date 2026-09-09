(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ChokinCatLifeFinancial = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const STORAGE_KEY = 'chokin-event-app.catLifeFinancial.v1';
  const MASTER_SHA256 = '61f054c19d3c960aa017b185bcfb75fef1a5a456eb09db082f2716cab019c889';
  // Financial v1's approved authored definitions are immutable, independent of display projections.
  const DEFINITIONS = Object.freeze([
    Object.freeze({"eventId":"celebrate.e1","catId":"celebrate","title":"紙吹雪の材料集め","narrative":"余ったきれいな紙を集め、次のお祝いに備えた。","eventType":"saving","insufficientFundsText":null,"spendBehavior":"light","amountScale":1,"financialClass":"no_cash"}),
    Object.freeze({"eventId":"celebrate.e2","catId":"celebrate","title":"小さな記念日","narrative":"今日まで続いたことを、小さなお菓子で祝おうとした。","eventType":"expense","insufficientFundsText":"今日は言葉のお祝いにして、次の機会を楽しみにした。","spendBehavior":"medium","amountScale":1,"financialClass":"no_cash"}),
    Object.freeze({"eventId":"celebrate.e3","catId":"celebrate","title":"きらめく合同ステージ","narrative":"アイドル猫と明るい応援会を開いた。","eventType":"relationship","insufficientFundsText":null,"spendBehavior":"large","amountScale":2,"financialClass":"no_cash"}),
    Object.freeze({"eventId":"black.e1","catId":"black","title":"夜の見回り","narrative":"落とし物を見つけ、持ち主へ返してお礼を受け取った。","eventType":"saving","insufficientFundsText":null,"spendBehavior":"none","amountScale":1,"financialClass":"no_cash"}),
    Object.freeze({"eventId":"black.e2","catId":"black","title":"古い毛布の手入れ","narrative":"買い替えず、丁寧に繕って使い続けた。","eventType":"neutral","insufficientFundsText":null,"spendBehavior":"light","amountScale":1,"financialClass":"no_cash"}),
    Object.freeze({"eventId":"black.e3","catId":"black","title":"静かな巡回","narrative":"忍者猫と夜の倉庫を見回った。","eventType":"relationship","insufficientFundsText":null,"spendBehavior":"medium","amountScale":2,"financialClass":"no_cash"}),
    Object.freeze({"eventId":"calico.e1","catId":"calico","title":"端切れの活用","narrative":"余った布で使いやすい袋を作った。","eventType":"saving","insufficientFundsText":null,"spendBehavior":"none","amountScale":1,"financialClass":"no_cash"}),
    Object.freeze({"eventId":"calico.e2","catId":"calico","title":"道具の買い替え","narrative":"長く使える台所道具を慎重に選んだ。","eventType":"expense","insufficientFundsText":"今日は手入れでしのぎ、次の機会に見送った。","spendBehavior":"medium","amountScale":2,"financialClass":"expense"}),
    Object.freeze({"eventId":"calico.e3","catId":"calico","title":"作り置き会","narrative":"シェフ猫と食材を無駄なく使い切った。","eventType":"relationship","insufficientFundsText":null,"spendBehavior":"medium","amountScale":2,"financialClass":"no_cash"}),
    Object.freeze({"eventId":"orange_tabby.e1","catId":"orange_tabby","title":"朝の配達","narrative":"早起きして近所の荷物運びを手伝った。","eventType":"saving","insufficientFundsText":null,"spendBehavior":"none","amountScale":1,"financialClass":"no_cash"}),
    Object.freeze({"eventId":"orange_tabby.e2","catId":"orange_tabby","title":"寄り道のおやつ","narrative":"走った後のおやつを楽しもうとした。","eventType":"expense","insufficientFundsText":"今日は水を飲んで、次のお楽しみにした。","spendBehavior":"medium","amountScale":1,"financialClass":"no_cash"}),
    Object.freeze({"eventId":"orange_tabby.e3","catId":"orange_tabby","title":"朝の競争","narrative":"ぶち猫と日課の速さを楽しく競った。","eventType":"relationship","insufficientFundsText":null,"spendBehavior":"large","amountScale":1,"financialClass":"no_cash"}),
    Object.freeze({"eventId":"hachiware.e1","catId":"hachiware","title":"帳面の見直し","narrative":"重複していた予定を見つけ、余分な出費を避けた。","eventType":"saving","insufficientFundsText":null,"spendBehavior":"light","amountScale":1,"financialClass":"no_cash"}),
    Object.freeze({"eventId":"hachiware.e2","catId":"hachiware","title":"文具の補充","narrative":"長く使える記録道具を選ぼうとした。","eventType":"expense","insufficientFundsText":"今ある道具を整え、買い足しは次回にした。","spendBehavior":"none","amountScale":1,"financialClass":"expense"}),
    Object.freeze({"eventId":"hachiware.e3","catId":"hachiware","title":"模様の相談会","narrative":"ハチワレ猫と互いの計画を確認し合った。","eventType":"relationship","insufficientFundsText":null,"spendBehavior":"medium","amountScale":2,"financialClass":"no_cash"}),
    Object.freeze({"eventId":"gray.e1","catId":"gray","title":"集計の発見","narrative":"記録の偏りを見つけ、次の計画を整えた。","eventType":"saving","insufficientFundsText":null,"spendBehavior":"none","amountScale":1,"financialClass":"no_cash"}),
    Object.freeze({"eventId":"gray.e2","catId":"gray","title":"観測道具の更新","narrative":"読みやすい記録道具を導入しようとした。","eventType":"expense","insufficientFundsText":"手元の道具を調整し、更新は後日にした。","spendBehavior":"none","amountScale":2,"financialClass":"no_cash"}),
    Object.freeze({"eventId":"gray.e3","catId":"gray","title":"数字の謎解き","narrative":"探偵猫と不思議な増減の理由を見つけた。","eventType":"relationship","insufficientFundsText":null,"spendBehavior":"light","amountScale":2,"financialClass":"no_cash"}),
    Object.freeze({"eventId":"surprised.e1","catId":"surprised","title":"思わぬお礼","narrative":"道案内のお礼を受け取り、大きな目で喜んだ。","eventType":"saving","insufficientFundsText":null,"spendBehavior":"none","amountScale":1,"financialClass":"no_cash"}),
    Object.freeze({"eventId":"surprised.e2","catId":"surprised","title":"不思議な小物","narrative":"見たことのない小物を持ち帰ろうとした。","eventType":"expense","insufficientFundsText":"写真だけ残し、持ち帰るのは次回にした。","spendBehavior":"medium","amountScale":1,"financialClass":"no_cash"}),
    Object.freeze({"eventId":"surprised.e3","catId":"surprised","title":"静かな深呼吸","narrative":"黒猫に教わり、驚いた時の深呼吸を練習した。","eventType":"relationship","insufficientFundsText":null,"spendBehavior":"large","amountScale":1,"financialClass":"no_cash"}),
    Object.freeze({"eventId":"ninja.e1","catId":"ninja","title":"無駄取りの術","narrative":"気づかれないまま余分な支度を減らした。","eventType":"saving","insufficientFundsText":null,"spendBehavior":"none","amountScale":1,"financialClass":"no_cash"}),
    Object.freeze({"eventId":"ninja.e2","catId":"ninja","title":"足袋の手入れ","narrative":"古い足袋を繕い、まだ使えるようにした。","eventType":"neutral","insufficientFundsText":null,"spendBehavior":"medium","amountScale":1,"financialClass":"no_cash"}),
    Object.freeze({"eventId":"ninja.e3","catId":"ninja","title":"月夜の稽古","narrative":"侍猫と互いの型を磨いた。","eventType":"relationship","insufficientFundsText":null,"spendBehavior":"medium","amountScale":2,"financialClass":"no_cash"}),
    Object.freeze({"eventId":"wizard.e1","catId":"wizard","title":"節約の小魔法","narrative":"古い道具を組み合わせ、買い足しを減らした。","eventType":"saving","insufficientFundsText":null,"spendBehavior":"light","amountScale":1,"financialClass":"no_cash"}),
    Object.freeze({"eventId":"wizard.e2","catId":"wizard","title":"珍しい触媒","narrative":"新しい実験に使う触媒を求めた。","eventType":"expense","insufficientFundsText":"代用品を研究し、購入は見送った。","spendBehavior":"medium","amountScale":2,"financialClass":"expense"}),
    Object.freeze({"eventId":"wizard.e3","catId":"wizard","title":"星の魔法式","narrative":"宇宙猫と夜空の法則を解き明かした。","eventType":"relationship","insufficientFundsText":null,"spendBehavior":"large","amountScale":3,"financialClass":"no_cash"}),
    Object.freeze({"eventId":"detective.e1","catId":"detective","title":"消えた小銭の謎","narrative":"記録漏れを見つけ、帳面を正しく整えた。","eventType":"neutral","insufficientFundsText":null,"spendBehavior":"none","amountScale":1,"financialClass":"no_cash"}),
    Object.freeze({"eventId":"detective.e2","catId":"detective","title":"新しい虫眼鏡","narrative":"細かな文字を読むための道具を検討した。","eventType":"expense","insufficientFundsText":"明るい場所で調べ、購入は先送りした。","spendBehavior":"light","amountScale":1,"financialClass":"expense"}),
    Object.freeze({"eventId":"detective.e3","catId":"detective","title":"灰色の報告書","narrative":"灰猫と長い記録から規則性を発見した。","eventType":"relationship","insufficientFundsText":null,"spendBehavior":"medium","amountScale":2,"financialClass":"no_cash"}),
    Object.freeze({"eventId":"chef.e1","catId":"chef","title":"残り物の一皿","narrative":"在庫を組み合わせ、買い足さず一皿を作った。","eventType":"saving","insufficientFundsText":null,"spendBehavior":"light","amountScale":1,"financialClass":"no_cash"}),
    Object.freeze({"eventId":"chef.e2","catId":"chef","title":"良い包丁を見つけた","narrative":"長く使えそうな良い包丁を見つけ、慎重に購入を考えた。","eventType":"expense","insufficientFundsText":"良い包丁を見つけたけれど、今日は見送った。","spendBehavior":"medium","amountScale":3,"financialClass":"expense"}),
    Object.freeze({"eventId":"chef.e3","catId":"chef","title":"庭から食卓へ","narrative":"ガーデニング猫のハーブを丁寧に料理した。","eventType":"relationship","insufficientFundsText":null,"spendBehavior":"large","amountScale":2,"financialClass":"no_cash"}),
    Object.freeze({"eventId":"cosmic.e1","catId":"cosmic","title":"流星の観測記録","narrative":"貴重な観測記録をまとめ、研究の謝礼を受けた。","eventType":"saving","insufficientFundsText":null,"spendBehavior":"light","amountScale":2,"financialClass":"income"}),
    Object.freeze({"eventId":"cosmic.e2","catId":"cosmic","title":"望遠鏡の調整","narrative":"遠い星を見るため機材を整えようとした。","eventType":"expense","insufficientFundsText":"今あるレンズを磨き、更新は次の周期にした。","spendBehavior":"medium","amountScale":3,"financialClass":"no_cash"}),
    Object.freeze({"eventId":"cosmic.e3","catId":"cosmic","title":"星屑の魔法","narrative":"魔法使い猫と星屑の安全な活用法を研究した。","eventType":"relationship","insufficientFundsText":null,"spendBehavior":"large","amountScale":3,"financialClass":"no_cash"}),
    Object.freeze({"eventId":"samurai.e1","catId":"samurai","title":"朝稽古の継続","narrative":"新しい道具に頼らず、基本の型を磨いた。","eventType":"saving","insufficientFundsText":null,"spendBehavior":"none","amountScale":1,"financialClass":"no_cash"}),
    Object.freeze({"eventId":"samurai.e2","catId":"samurai","title":"道具の修繕","narrative":"長く使うために必要な修繕をしようとした。","eventType":"expense","insufficientFundsText":"応急手当を施し、本修繕は次の機会とした。","spendBehavior":"medium","amountScale":2,"financialClass":"no_cash"}),
    Object.freeze({"eventId":"samurai.e3","catId":"samurai","title":"守りの型比べ","narrative":"騎士猫と互いの守備の技を交換した。","eventType":"relationship","insufficientFundsText":null,"spendBehavior":"large","amountScale":2,"financialClass":"no_cash"}),
    Object.freeze({"eventId":"pirate.e1","catId":"pirate","title":"漂着した宝箱","narrative":"古い小箱から使える航海道具を見つけた。","eventType":"saving","insufficientFundsText":null,"spendBehavior":"light","amountScale":2,"financialClass":"no_cash"}),
    Object.freeze({"eventId":"pirate.e2","catId":"pirate","title":"港の宴","narrative":"航海の無事を祝う宴を開こうとした。","eventType":"expense","insufficientFundsText":"今日は歌だけで祝い、宴は次の港へ持ち越した。","spendBehavior":"large","amountScale":3,"financialClass":"no_cash"}),
    Object.freeze({"eventId":"pirate.e3","catId":"pirate","title":"竜の追い風","narrative":"ドラゴン猫の風を借りて危険な海域を越えた。","eventType":"relationship","insufficientFundsText":null,"spendBehavior":"very_large","amountScale":3,"financialClass":"no_cash"}),
    Object.freeze({"eventId":"knight.e1","catId":"knight","title":"見回りの謝礼","narrative":"町の見回りを手伝い、感謝の品を受け取った。","eventType":"saving","insufficientFundsText":null,"spendBehavior":"none","amountScale":1,"financialClass":"no_cash"}),
    Object.freeze({"eventId":"knight.e2","catId":"knight","title":"鎧の修繕","narrative":"守りを保つため必要な修繕をしようとした。","eventType":"expense","insufficientFundsText":"今できる手入れを行い、本修繕は見送った。","spendBehavior":"medium","amountScale":2,"financialClass":"no_cash"}),
    Object.freeze({"eventId":"knight.e3","catId":"knight","title":"東西の守備会議","narrative":"侍猫と町の守り方を話し合った。","eventType":"relationship","insufficientFundsText":null,"spendBehavior":"large","amountScale":2,"financialClass":"no_cash"}),
    Object.freeze({"eventId":"angel.e1","catId":"angel","title":"羽のお守り","narrative":"小さなお守りを作り、感謝を受け取った。","eventType":"saving","insufficientFundsText":null,"spendBehavior":"light","amountScale":1,"financialClass":"no_cash"}),
    Object.freeze({"eventId":"angel.e2","catId":"angel","title":"困った仲間への贈り物","narrative":"無理のない範囲で必要な品を届けようとした。","eventType":"expense","insufficientFundsText":"今日は言葉と手伝いを届け、品物は次の機会にした。","spendBehavior":"medium","amountScale":2,"financialClass":"no_cash"}),
    Object.freeze({"eventId":"angel.e3","catId":"angel","title":"長い祈り","narrative":"猫神と仲間の穏やかな未来を願った。","eventType":"relationship","insufficientFundsText":null,"spendBehavior":"large","amountScale":3,"financialClass":"no_cash"}),
    Object.freeze({"eventId":"dragon.e1","catId":"dragon","title":"洞窟の鉱石","narrative":"古い洞窟で価値ある鉱石を見つけた。","eventType":"saving","insufficientFundsText":null,"spendBehavior":"none","amountScale":3,"financialClass":"no_cash"}),
    Object.freeze({"eventId":"dragon.e2","catId":"dragon","title":"炎の祝宴","narrative":"大きな成果を豪快に祝おうとした。","eventType":"expense","insufficientFundsText":"小さな焚き火で祝い、大宴会は次回に譲った。","spendBehavior":"large","amountScale":4,"financialClass":"no_cash"}),
    Object.freeze({"eventId":"dragon.e3","catId":"dragon","title":"海を越える翼","narrative":"海賊猫の船を追い風で助けた。","eventType":"relationship","insufficientFundsText":null,"spendBehavior":"very_large","amountScale":3,"financialClass":"no_cash"}),
    Object.freeze({"eventId":"royal.e1","catId":"royal","title":"マタタビの収穫が好調","narrative":"国有マタタビ畑の実りが増え、売上の一部を王国の備えへ回した。","eventType":"saving","insufficientFundsText":null,"spendBehavior":"none","amountScale":3,"financialClass":"income"}),
    Object.freeze({"eventId":"royal.e2","catId":"royal","title":"畑の設備修繕","narrative":"国有マタタビ畑を長く守るため、設備の修繕を計画した。","eventType":"expense","insufficientFundsText":"応急手当を施し、本格修繕は収穫後へ延期した。","spendBehavior":"large","amountScale":4,"financialClass":"no_cash"}),
    Object.freeze({"eventId":"royal.e3","catId":"royal","title":"畑管理へのお礼","narrative":"ガーデニング猫へ管理の感謝を伝え、次の季節を相談した。","eventType":"relationship","insufficientFundsText":null,"spendBehavior":"large","amountScale":2,"financialClass":"no_cash"}),
    Object.freeze({"eventId":"deity.e1","catId":"deity","title":"福の巡り","narrative":"長く大切にした品が別の仲間の役に立った。","eventType":"saving","insufficientFundsText":null,"spendBehavior":"none","amountScale":2,"financialClass":"no_cash"}),
    Object.freeze({"eventId":"deity.e2","catId":"deity","title":"社の手入れ","narrative":"皆が安心して訪れる社を整えようとした。","eventType":"expense","insufficientFundsText":"皆で掃き清め、修繕は次の巡りへ送った。","spendBehavior":"light","amountScale":3,"financialClass":"no_cash"}),
    Object.freeze({"eventId":"deity.e3","catId":"deity","title":"天使の祈り","narrative":"天使猫と静かに仲間の未来を見守った。","eventType":"relationship","insufficientFundsText":null,"spendBehavior":"medium","amountScale":3,"financialClass":"no_cash"}),
    Object.freeze({"eventId":"gardener.e1","catId":"gardener","title":"種の交換","narrative":"育てた種を交換し、新しい苗を手に入れた。","eventType":"saving","insufficientFundsText":null,"spendBehavior":"light","amountScale":1,"financialClass":"no_cash"}),
    Object.freeze({"eventId":"gardener.e2","catId":"gardener","title":"土づくり","narrative":"次の実りのため、良い土を用意しようとした。","eventType":"expense","insufficientFundsText":"落ち葉で土を育て、買い足しは次回にした。","spendBehavior":"medium","amountScale":2,"financialClass":"expense"}),
    Object.freeze({"eventId":"gardener.e3","catId":"gardener","title":"森と庭の道","narrative":"レンジャー猫と生き物が通れる道を整えた。","eventType":"relationship","insufficientFundsText":null,"spendBehavior":"medium","amountScale":2,"financialClass":"no_cash"}),
    Object.freeze({"eventId":"ranger.e1","catId":"ranger","title":"安全な近道","narrative":"危険を避ける道を見つけ、余分な支度を減らした。","eventType":"saving","insufficientFundsText":null,"spendBehavior":"light","amountScale":1,"financialClass":"no_cash"}),
    Object.freeze({"eventId":"ranger.e2","catId":"ranger","title":"靴の補強","narrative":"長い道に備えて靴を補強しようとした。","eventType":"expense","insufficientFundsText":"手持ちの材料で応急補強し、買い替えは見送った。","spendBehavior":"medium","amountScale":2,"financialClass":"expense"}),
    Object.freeze({"eventId":"ranger.e3","catId":"ranger","title":"雪道の案内","narrative":"ハチワレ猫と寒い森の安全な道を確かめた。","eventType":"relationship","insufficientFundsText":null,"spendBehavior":"large","amountScale":2,"financialClass":"no_cash"}),
    Object.freeze({"eventId":"idol.e1","catId":"idol","title":"応援のお便り","narrative":"温かな応援を受け取り、次の活動の力にした。","eventType":"saving","insufficientFundsText":null,"spendBehavior":"medium","amountScale":2,"financialClass":"no_cash"}),
    Object.freeze({"eventId":"idol.e2","catId":"idol","title":"舞台の演出","narrative":"新しい光の演出を加えようとした。","eventType":"expense","insufficientFundsText":"手拍子の演出に変え、機材は次の舞台へ見送った。","spendBehavior":"large","amountScale":3,"financialClass":"no_cash"}),
    Object.freeze({"eventId":"idol.e3","catId":"idol","title":"お祝いライブ","narrative":"お祝い猫と小さな達成ライブを開いた。","eventType":"relationship","insufficientFundsText":null,"spendBehavior":"large","amountScale":3,"financialClass":"no_cash"}),
    Object.freeze({"eventId":"hachiware_scarf.e1","catId":"hachiware_scarf","title":"領収書の整理","narrative":"必要な支出を分かりやすく整理し、余分を見つけた。","eventType":"saving","insufficientFundsText":null,"spendBehavior":"light","amountScale":1,"financialClass":"no_cash"}),
    Object.freeze({"eventId":"hachiware_scarf.e2","catId":"hachiware_scarf","title":"マフラーの補修","narrative":"赤いマフラーを長く使うため補修しようとした。","eventType":"expense","insufficientFundsText":"手元の糸で丁寧に繕い、買い替えは見送った。","spendBehavior":"medium","amountScale":1,"financialClass":"expense"}),
    Object.freeze({"eventId":"hachiware_scarf.e3","catId":"hachiware_scarf","title":"ふたりの確認日","narrative":"ぶち猫と必要な物と予定を確認し合った。","eventType":"relationship","insufficientFundsText":null,"spendBehavior":"medium","amountScale":2,"financialClass":"no_cash"})
  ]);
  const SIDECAR_FIELDS = Object.freeze(['schemaVersion','financialFormulaVersion','lastSettledDayKey','records']);
  const PROJECTION_FIELDS = Object.freeze(['occurrenceId','eventId','catId','occurredAt','localDayKey','spendBehavior','effectMode','engineVersion']);
  const SNAPSHOT_FIELDS = Object.freeze(['occurrenceId','effectMode','financialFormulaVersion','financialClass','basisSource','basisAmount','amountScaleSnapshot','spendBehaviorSnapshot','spendRateSnapshot','rawAmount','calculatedAmount','appliedAmount','delta','financialStatus','displayNarrativeMode','balanceBefore','eventBalanceAfter','balanceAfter','goalIdBefore','goalIdAfter','goalCompleted','goalSpentAmount']);
  function emptySidecar() { return { schemaVersion: 1, financialFormulaVersion: 1, lastSettledDayKey: null, records: [] }; }

  function createModel({ life, events, runtime }) {
    if (typeof life?.roundCatAmount !== 'function' || typeof life?.prepareGoalCompletion !== 'function' || typeof events?.dayNumber !== 'function' || typeof runtime?.validateCatLifeRoot !== 'function') throw new TypeError('financial model dependencies are required');
const clone = value => JSON.parse(JSON.stringify(value));
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const positive = value => typeof value === 'number' && Number.isFinite(value) && value > 0;
const money = value => Number.isSafeInteger(value) && value >= 0;
const requireValue = (condition, code) => { if (!condition) throw new Error(code); };
const SPEND_RATES = life.GOAL_SPEND_RATES;
const CLASSES = new Set(['income', 'expense', 'no_cash']);

function selectBasis(catState) {
  if (catState.currentGoal !== null) {
    return positive(catState.currentGoal?.goalBasisAmount)
      ? { basisSource: 'current_goal', basisAmount: catState.currentGoal.goalBasisAmount }
      : { basisSource: 'unavailable', basisAmount: null };
  }
  // Select the last completion, not the latest entry having a usable basis.
  // A bad last basis must not silently fall back to an earlier amount.
  const goals = catState.completedGoals;
  if (!goals.length) return { basisSource: 'unavailable', basisAmount: null };
  if (!goals.every(goal => object(goal) && typeof goal.completedAt === 'string' && Number.isFinite(Date.parse(goal.completedAt)))) {
    return { basisSource: 'unavailable', basisAmount: null };
  }
  const last = goals.map((goal, index) => ({ goal, index }))
    .sort((a, b) => Date.parse(a.goal.completedAt) - Date.parse(b.goal.completedAt) || a.index - b.index).at(-1).goal;
  return positive(last.goalBasisAmount)
    ? { basisSource: 'last_completed_goal', basisAmount: last.goalBasisAmount }
    : { basisSource: 'unavailable', basisAmount: null };
}

function computeFinancialEffectV1({ event, financialClass, spendBehavior, amountScale, catState, effectMode = 'financial_v1' }) {
  requireValue(object(catState) && money(catState.currentBalance), 'invalid_cat_balance');
  const before = catState.currentBalance;
  const historical = effectMode === 'narrative_only';
  requireValue(historical || effectMode === 'financial_v1', 'invalid_effect_mode');
  const result = {
    effectMode, financialFormulaVersion: historical ? null : 1,
    financialClass: historical ? null : financialClass,
    basisSource: 'unavailable', basisAmount: null,
    amountScale: historical ? null : amountScale,
    spendBehavior: historical ? null : spendBehavior, spendRate: historical ? null : SPEND_RATES[spendBehavior],
    rawAmount: 0, calculatedAmount: 0, appliedAmount: 0, delta: 0,
    financialStatus: historical ? 'historical_no_effect' : 'pending',
    balanceBefore: before, balanceAfter: before, displayNarrativeMode: 'normal',
    displayNarrative: typeof event?.narrative === 'string' ? event.narrative : null
  };
  if (historical) return result;
  requireValue(object(event) && typeof event.eventId === 'string' && typeof event.narrative === 'string', 'invalid_event');
  requireValue(CLASSES.has(financialClass), 'invalid_financial_class');
  requireValue(Object.hasOwn(SPEND_RATES, spendBehavior), 'invalid_spend_behavior');
  requireValue(Number.isInteger(amountScale) && amountScale >= 1 && amountScale <= 4, 'invalid_amount_scale');
  requireValue((catState.currentGoal === null || object(catState.currentGoal)) && Array.isArray(catState.completedGoals), 'invalid_goal_container');
  Object.assign(result, selectBasis(catState));
  if (result.basisSource === 'unavailable') { result.financialStatus = 'basis_unavailable'; return result; }
  if (financialClass === 'no_cash') { result.financialStatus = 'no_cash'; return result; }
  if (spendBehavior === 'none') { result.financialStatus = 'zero_rate'; return result; }
  result.rawAmount = result.basisAmount * result.spendRate * amountScale;
  requireValue(Number.isFinite(result.rawAmount) && result.rawAmount > 0 && result.rawAmount <= Number.MAX_SAFE_INTEGER, 'unsafe_financial_amount');
  result.calculatedAmount = life.roundCatAmount(result.rawAmount);
  if (financialClass === 'expense' && before < result.calculatedAmount) {
    result.financialStatus = 'insufficient_funds';
    const hasText = typeof event.insufficientFundsText === 'string' && event.insufficientFundsText.trim().length > 0;
    result.displayNarrativeMode = hasText ? 'insufficient_funds_text' : 'suppressed_missing_insufficient_text';
    // Safe fallback is omission of narrative, not an invented story or a claim of purchase.
    result.displayNarrative = hasText ? event.insufficientFundsText : null;
    return result;
  }
  result.appliedAmount = result.calculatedAmount;
  result.delta = financialClass === 'income' ? result.appliedAmount : -result.appliedAmount;
  result.balanceAfter = before + result.delta;
  requireValue(money(result.balanceAfter), 'unsafe_next_balance');
  result.financialStatus = 'applied';
  return result;
}

function validateRoot(root, world, allowMissingBasis = false) {
  const validation = runtime.validateCatLifeRoot(root, world);
  const remaining = validation.errors.filter(error => !(allowMissingBasis && error.path?.endsWith('.goalBasisAmount')));
  requireValue(remaining.length === 0, 'invalid_cat_life_clone');
  requireValue(!validation.isolation?.unknownCatIds?.length && !validation.isolation?.missingGoalReferences?.length, 'isolated_cat_life_clone');
}

function simulateOccurrence({ catWorld, catLifeRoot, occurrence, appliedOccurrenceIds = [], mainState = { entries: [] } }) {
  requireValue(object(occurrence) && typeof occurrence.occurrenceId === 'string', 'invalid_occurrence');
  requireValue(Array.isArray(appliedOccurrenceIds) && appliedOccurrenceIds.every(id => typeof id === 'string') && new Set(appliedOccurrenceIds).size === appliedOccurrenceIds.length, 'invalid_ledger');
  // Historical records are never upgraded, reclassified or given a financial snapshot.
  if (occurrence.effectMode === 'narrative_only') {
    return { status: 'historical_no_effect', root: clone(catLifeRoot), appliedOccurrenceIds: [...appliedOccurrenceIds], applicationProposed: false, effect: null, snapshot: null, goalCompletion: null };
  }
  requireValue(occurrence.effectMode === 'financial_v1', 'invalid_effect_mode');
  requireValue(validProjection({ ...occurrence, effectMode: 'narrative_only' }), 'invalid_financial_occurrence');
  requireValue(inspectMaster(catWorld).valid, 'classification_master_mismatch');
  const master = catWorld.cats.find(cat => cat.id === occurrence.catId);
  requireValue(master, 'unknown_cat');
  const event = master.lifeEvents.find(item => item.eventId === occurrence.eventId);
  requireValue(event, 'unknown_event');
  requireValue(Number.isFinite(events.dayNumber(occurrence.localDayKey)) && typeof occurrence.occurredAt === 'string' && Number.isFinite(Date.parse(occurrence.occurredAt)), 'invalid_occurrence_date');
  requireValue(occurrence.occurrenceId === `v1:${occurrence.localDayKey}:${master.id}:${event.eventId}`, 'invalid_occurrence_id');
  const definition = DEFINITIONS.find(item => item.eventId === event.eventId && item.catId === master.id);
  requireValue(definition && definition.title === event.title && definition.narrative === event.narrative && definition.eventType === event.eventType && definition.insufficientFundsText === event.insufficientFundsText && definition.amountScale === event.amountScale && definition.spendBehavior === events.eventSpendBehavior(master, event), 'classification_master_mismatch');
  validateRoot(catLifeRoot, catWorld, true);
  requireValue(object(catLifeRoot.cats[master.id]), 'missing_cat_state');
  if (appliedOccurrenceIds.includes(occurrence.occurrenceId)) {
    return { status: 'already_proposed', root: clone(catLifeRoot), appliedOccurrenceIds: [...appliedOccurrenceIds], applicationProposed: false, effect: null, snapshot: null, goalCompletion: null };
  }
  const state = catLifeRoot.cats[master.id];
  const effect = computeFinancialEffectV1({ event, financialClass: definition.financialClass, spendBehavior: definition.spendBehavior, amountScale: event.amountScale, catState: state });
  let next = clone(state);
  const progressBefore = goalProgress(state);
  let completion = null;
  if (effect.delta !== 0) {
    next.currentBalance = effect.balanceAfter;
    if (effect.delta > 0) next.totalSaved += effect.delta;
    else next.totalSpent += -effect.delta;
    requireValue(money(next.totalSaved) && money(next.totalSpent), 'unsafe_totals');
    next.updatedAt = occurrence.occurredAt;
    if (effect.delta > 0 && next.currentGoal && life.isGoalCompleted(next)) {
      completion = life.prepareGoalCompletion({ state: next, masterCat: master, mainState, expectedGoalId: next.currentGoal.goalId, completedAt: occurrence.occurredAt });
      next = completion.state; // The formal Stage3 implementation processes one goal, not a loop.
    }
  }
  const root = clone(catLifeRoot);
  root.cats[master.id] = next;
  if (effect.delta !== 0) root.updatedAt = occurrence.occurredAt;
  validateRoot(root, catWorld, effect.financialStatus === 'basis_unavailable');
  const goalCompleted = completion?.status === 'completed';
  const snapshot = {
    occurrenceId: occurrence.occurrenceId, effectMode: 'financial_v1', financialFormulaVersion: 1,
    financialClass: effect.financialClass, basisSource: effect.basisSource, basisAmount: effect.basisAmount,
    amountScaleSnapshot: effect.amountScale, spendBehaviorSnapshot: effect.spendBehavior, spendRateSnapshot: effect.spendRate,
    rawAmount: effect.rawAmount, calculatedAmount: effect.calculatedAmount, appliedAmount: effect.appliedAmount, delta: effect.delta,
    financialStatus: effect.financialStatus, displayNarrativeMode: effect.displayNarrativeMode,
    balanceBefore: effect.balanceBefore, eventBalanceAfter: effect.balanceAfter, balanceAfter: next.currentBalance,
    goalIdBefore: state.currentGoal?.goalId ?? null, goalIdAfter: next.currentGoal?.goalId ?? null,
    goalCompleted, goalSpentAmount: completion?.spend?.spentAmount ?? 0
  };
  return {
    status: effect.financialStatus, root,
    appliedOccurrenceIds: [...appliedOccurrenceIds, occurrence.occurrenceId], applicationProposed: true,
    effect, snapshot, goalCompletion: completion,
    progressBefore, progressAfter: goalProgress(next),
    nextGoalAlreadyReached: goalCompleted && next.currentGoal !== null && life.isGoalCompleted(next)
  };
}


const exactKeys = (value, keys) => object(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
function goalProgress(state) {
  const goal = object(state?.currentGoal) ? state.currentGoal : null;
  if (!goal) return null;
  const increase = Number(goal.requiredIncrease), current = Number(state.currentBalance), start = Number(goal.startBalance);
  const raw = increase > 0 ? ((current - start) / increase) * 100 : current >= Number(goal.targetBalance) ? 100 : 0;
  return Math.max(0, Math.min(100, Math.round(Number.isFinite(raw) ? raw : 0)));
}
function inspectMaster(world) {
  const errors = [];
  if (!object(world) || !Array.isArray(world.cats)) return { valid: false, errors: [{ code: 'invalid_master' }] };
  const found = new Map();
  world.cats.forEach(cat => {
    if (!object(cat) || !Array.isArray(cat.lifeEvents)) { errors.push({ code: 'invalid_master_cat' }); return; }
    cat.lifeEvents.forEach(event => {
      if (!object(event) || found.has(event.eventId)) { errors.push({ code: 'invalid_master_event' }); return; }
      found.set(event.eventId, { cat, event });
    });
  });
  if (world.cats.length !== 23 || found.size !== DEFINITIONS.length) errors.push({ code: 'classification_count_mismatch' });
  for (const definition of DEFINITIONS) {
    const pair = found.get(definition.eventId);
    if (!pair || pair.cat.id !== definition.catId
      || !['title','narrative','eventType','insufficientFundsText','amountScale'].every(key => pair.event[key] === definition[key])
      || events.eventSpendBehavior(pair.cat, pair.event) !== definition.spendBehavior) errors.push({ code: 'classification_master_mismatch', eventId: definition.eventId });
  }
  return { valid: errors.length === 0, errors };
}
function validProjection(projection) {
  if (!exactKeys(projection, PROJECTION_FIELDS)) return false;
  const definition = DEFINITIONS.find(item => item.eventId === projection.eventId && item.catId === projection.catId);
  return !!definition && typeof projection.occurredAt === 'string' && Number.isFinite(Date.parse(projection.occurredAt))
    && typeof projection.localDayKey === 'string' && Number.isFinite(events.dayNumber(projection.localDayKey))
    && projection.occurrenceId === `v1:${projection.localDayKey}:${projection.catId}:${projection.eventId}`
    && projection.spendBehavior === definition.spendBehavior && projection.effectMode === 'narrative_only' && projection.engineVersion === 1;
}
function validSnapshot(snapshot, projection) {
  if (!exactKeys(snapshot, SNAPSHOT_FIELDS) || !validProjection(projection)) return false;
  const definition = DEFINITIONS.find(item => item.eventId === projection.eventId);
  if (snapshot.occurrenceId !== projection.occurrenceId || snapshot.effectMode !== 'financial_v1' || snapshot.financialFormulaVersion !== 1
    || snapshot.financialClass !== definition.financialClass || snapshot.amountScaleSnapshot !== definition.amountScale
    || snapshot.spendBehaviorSnapshot !== definition.spendBehavior || snapshot.spendRateSnapshot !== SPEND_RATES[definition.spendBehavior]
    || !['current_goal','last_completed_goal','unavailable'].includes(snapshot.basisSource)
    || (snapshot.basisSource === 'unavailable' ? snapshot.basisAmount !== null : !positive(snapshot.basisAmount))
    || !['rawAmount','calculatedAmount','appliedAmount','balanceBefore','eventBalanceAfter','balanceAfter','goalSpentAmount'].every(key => key === 'rawAmount' ? typeof snapshot[key] === 'number' && Number.isFinite(snapshot[key]) && snapshot[key] >= 0 : money(snapshot[key]))
    || !Number.isSafeInteger(snapshot.delta) || typeof snapshot.goalCompleted !== 'boolean') return false;
  const validGoalId = id => id === null || typeof id === 'string' && ['1','2','3'].some(ordinal => id === `${projection.catId}.g${ordinal}`);
  if (!validGoalId(snapshot.goalIdBefore) || !validGoalId(snapshot.goalIdAfter)
    || snapshot.eventBalanceAfter !== snapshot.balanceBefore + snapshot.delta
    || snapshot.balanceAfter !== snapshot.eventBalanceAfter - snapshot.goalSpentAmount) return false;
  let expected;
  try {
    const currentGoal = snapshot.basisSource === 'last_completed_goal' ? null : { goalBasisAmount: snapshot.basisAmount };
    expected = computeFinancialEffectV1({
      event: definition, financialClass: definition.financialClass, spendBehavior: definition.spendBehavior, amountScale: definition.amountScale,
      catState: { currentBalance: snapshot.balanceBefore, currentGoal,
        completedGoals: snapshot.basisSource === 'last_completed_goal' ? [{ goalBasisAmount: snapshot.basisAmount, completedAt: projection.occurredAt }] : [] }
    });
  } catch { return false; }
  if (!['rawAmount','calculatedAmount','appliedAmount','delta','financialStatus','displayNarrativeMode','balanceBefore'].every(key => snapshot[key] === expected[key])
    || snapshot.eventBalanceAfter !== expected.balanceAfter) return false;
  if (snapshot.goalCompleted) {
    if (snapshot.delta <= 0 || snapshot.financialClass !== 'income' || snapshot.goalIdBefore === null) return false;
    const ordinal = Number(snapshot.goalIdBefore.split('.g')[1]);
    if (snapshot.goalIdAfter !== (ordinal === 3 ? null : `${projection.catId}.g${ordinal + 1}`)) return false;
  } else if (snapshot.goalIdBefore !== snapshot.goalIdAfter || snapshot.goalSpentAmount !== 0) return false;
  if (snapshot.basisSource === 'current_goal' && snapshot.goalIdBefore === null) return false;
  if (snapshot.basisSource === 'last_completed_goal' && snapshot.goalIdBefore !== null) return false;
  return true;
}
function validateSidecar(value) {
  const errors = [];
  if (!exactKeys(value, SIDECAR_FIELDS)) return { valid: false, errors: [{ code: 'invalid_financial_sidecar_shape' }] };
  if (value.schemaVersion !== 1 || value.financialFormulaVersion !== 1) errors.push({ code: 'invalid_financial_sidecar_version' });
  if (!Array.isArray(value.records)) return { valid: false, errors: [...errors, { code: 'invalid_financial_records' }] };
  const ids = new Set(); let previousDay = null;
  for (const [index, record] of value.records.entries()) {
    if (!exactKeys(record, ['projection','snapshot']) || !validProjection(record.projection) || !validSnapshot(record.snapshot, record.projection)) {
      errors.push({ code: 'invalid_financial_record', index }); continue;
    }
    const id = record.projection.occurrenceId, day = record.projection.localDayKey;
    if (ids.has(id)) errors.push({ code: 'duplicate_financial_occurrence', index });
    if (previousDay !== null && day <= previousDay) errors.push({ code: 'financial_day_not_increasing', index });
    ids.add(id); previousDay = day;
  }
  if (value.lastSettledDayKey !== previousDay) errors.push({ code: 'financial_high_water_mismatch' });
  return { valid: errors.length === 0, errors };
}
function inspectSidecarRaw(raw) {
  if (raw === null) return { status: 'empty', state: emptySidecar(), raw: null };
  let state; try { state = JSON.parse(raw); } catch { return { status: 'corrupted', state: null, raw }; }
  const checked = validateSidecar(state);
  return checked.valid ? { status: 'ok', state: clone(state), raw } : { status: 'corrupted', state: null, raw, errors: checked.errors };
}
function validateProjectionLink(sidecar, eventState) {
  const checked = validateSidecar(sidecar), eventChecked = events.validateState(eventState);
  if (!checked.valid || !eventChecked.valid) return { valid: false, errors: [...checked.errors, ...eventChecked.errors] };
  const records = new Map(sidecar.records.map(record => [record.projection.occurrenceId, record.projection]));
  const errors = [];
  const historyIds = new Set(eventState.history.map(record => record.occurrenceId));
  const oldestRetainedDay = eventState.history.map(record => record.localDayKey).sort()[0] ?? null;
  for (const record of sidecar.records) {
    if ((oldestRetainedDay === null || record.projection.localDayKey >= oldestRetainedDay) && !historyIds.has(record.projection.occurrenceId)) errors.push({ code: 'missing_financial_projection', occurrenceId: record.projection.occurrenceId });
  }
  for (const projection of eventState.history) {
    const authoritative = records.get(projection.occurrenceId);
    if (authoritative && !PROJECTION_FIELDS.every(key => authoritative[key] === projection[key])) errors.push({ code: 'financial_projection_mismatch', occurrenceId: projection.occurrenceId });
  }
  // History is prunable, but the last settled day may never lead the compatibility state.
  if (sidecar.lastSettledDayKey !== null && (eventState.lastProcessedDayKey === null || eventState.lastProcessedDayKey < sidecar.lastSettledDayKey)) errors.push({ code: 'financial_projection_day_mismatch' });
  return { valid: errors.length === 0, errors };
}

    return Object.freeze({ STORAGE_KEY, MASTER_SHA256, classifications: DEFINITIONS, SPEND_RATES, selectBasis, computeFinancialEffectV1, simulateOccurrence, inspectMaster, emptySidecar, validateSidecar, inspectSidecarRaw, validateProjectionLink });
  }
  return Object.freeze({ STORAGE_KEY, MASTER_SHA256, createModel, emptySidecar });
});
