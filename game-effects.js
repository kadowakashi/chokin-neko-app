(() => {
  'use strict';
  const RARITY_RATES = Object.freeze({NORMAL:50,RARE:28,SUPER:14,ULTRA:6,LEGEND:2});
  const RARITIES = ['NORMAL','RARE','SUPER','ULTRA','LEGEND'];
  const PREVIEWS = Object.freeze([
    ['10円・ちょこっと','normal','NORMAL',10],['50円・NICE','normal','NORMAL',50],['100円・GREAT','normal','RARE',100],
    ['300円・SUPER','normal','SUPER',300],['500円・ULTRA','normal','ULTRA',500],['1,000円・FEVER','normal','LEGEND',1000],
    ['猫スロット','cat-slot','SUPER'],
    ['猫ガチャ NORMAL','gacha-normal','NORMAL'],['猫ガチャ RARE','gacha-rare','RARE'],['猫ガチャ SUPER','gacha-super','SUPER'],
    ['猫ガチャ ULTRA','gacha-ultra','ULTRA'],['猫ガチャ LEGEND','gacha-legend','LEGEND'],
    ['激熱カットイン','hot-cutin','ULTRA'],['猫神社','temple','LEGEND'],['宇宙猫','cosmic','SUPER'],['宝箱','treasure','RARE']
  ]);
  const pick = list => list[Math.floor(Math.random()*list.length)];
  const rarityRank = rarity => RARITIES.indexOf(rarity);
  const chooseRarityCat = rarity => window.ChokinCats.choose(rarity,{persist:false});
  function makeSlotResult(rarity, preview=false) {
    const makeMatch=preview||Math.random()<.2, matched=chooseRarityCat(rarity);
    const cats=makeMatch?[matched,matched,matched]:Array.from({length:3},()=>window.ChokinCats.choose(rarity,{persist:false,slot:true}));
    const same=cats.every(cat=>cat.id===cats[0].id),high=cats.filter(cat=>rarityRank(cat.rarity)>=2),ultra=cats.filter(cat=>rarityRank(cat.rarity)>=3);
    const title=same?cats[0].feverTitle:high.length===3?'SUPER CAT RUSH':ultra.length>=2?'LEGENDARY CAT PARADE':'CAT CHANCE';
    return {cats,same,special:same||high.length===3||ultra.length>=2,title,hero:same?cats[0]:high[0]||cats[0]};
  }
  function makeSlotResultForCat(cat) {
    const same=Math.random()<.2,cats=same?[cat,cat,cat]:[window.ChokinCats.choose(cat.rarity,{persist:false,slot:true}),cat,window.ChokinCats.choose(cat.rarity,{persist:false,slot:true})];
    const high=cats.filter(item=>rarityRank(item.rarity)>=2),ultra=cats.filter(item=>rarityRank(item.rarity)>=3),title=same?cat.feverTitle:high.length===3?'SUPER CAT RUSH':ultra.length>=2?'LEGENDARY CAT PARADE':'CAT CHANCE';
    return {cats,same,special:same||high.length===3||ultra.length>=2,title,hero:cat};
  }
  function enrich(result,persistCats=false) {
    if(result.show.startsWith('gacha-'))result.cat=window.ChokinCats.choose(result.rarity,{persist:persistCats&&!result.preview});
    if(result.show==='cat-slot')result.slotResult=makeSlotResult(result.rarity,result.preview);
    return result;
  }
  function weighted(weights) { let value=Math.random()*weights.reduce((a,b)=>a+b,0); for(let i=0;i<weights.length;i++){value-=weights[i];if(value<0)return RARITIES[i];} return 'NORMAL'; }
  function rollRarity(amount) {
    const weights=RARITIES.map(rarity=>RARITY_RATES[rarity]);
    if(amount>=10000){weights[0]-=10;weights[1]-=3;weights[2]+=5;weights[3]+=5;weights[4]+=3;}
    else if(amount>=5000){weights[0]-=5;weights[1]-=2;weights[2]+=3;weights[3]+=2;weights[4]+=2;}
    return weighted(weights);
  }
  function plan({amount=100,forcedShow=null,forcedRarity=null,persistCats=false}) {
    if(forcedShow){
      const map={normal:'gold','hot-cutin':'gacha-ultra',temple:'legendary cat-blessing'};
      const rarity=forcedRarity||(forcedShow.startsWith('gacha-')?forcedShow.replace('gacha-','').toUpperCase():forcedShow==='temple'?'LEGEND':forcedShow==='cosmic'?'SUPER':forcedShow==='treasure'?'RARE':'NORMAL');
      return enrich({show:map[forcedShow]||forcedShow,rarity:RARITIES.includes(rarity)?rarity:'NORMAL',confirmed:forcedShow==='hot-cutin',cutIn:forcedShow==='hot-cutin',omen:forcedShow==='hot-cutin'?'gold':pick(['eyes','paw','gold']),preview:true},false);
    }
    let rarity=rollRarity(amount),confirmed=Math.random()<.055;
    if(confirmed&&RARITIES.indexOf(rarity)<2)rarity=pick(['SUPER','ULTRA','LEGEND']);
    const pools={NORMAL:['gold','shock','cat-blessing'],RARE:['treasure','gold','shock'],SUPER:['cosmic','shock','treasure'],ULTRA:['cosmic','shock','cat-blessing'],LEGEND:['legendary cat-blessing','cosmic']};
    const show=pick(pools[rarity]);
    return enrich({show,rarity,confirmed,cutIn:confirmed&&Math.random()<.72,omen:confirmed?'gold':pick(['eyes','paw','gold']),preview:false},persistCats);
  }
  function gachaPlan() {
    let rarity=rollRarity(100),confirmed=Math.random()<.055;
    if(confirmed&&RARITIES.indexOf(rarity)<2)rarity=pick(['SUPER','ULTRA','LEGEND']);
    const pools={NORMAL:['gacha-normal','cat-slot'],RARE:['gacha-rare','cat-slot','treasure'],SUPER:['gacha-super','cat-slot','cosmic'],ULTRA:['gacha-ultra','cat-slot','cosmic'],LEGEND:['gacha-legend','cat-slot','legendary cat-blessing']};
    const show=pick(pools[rarity]),cat=window.ChokinCats.choose(rarity,{persist:true}),result={show,rarity,cat,confirmed,cutIn:confirmed&&Math.random()<.72,omen:confirmed?'gold':pick(['eyes','paw','gold']),preview:false};
    if(show==='cat-slot')result.slotResult=makeSlotResultForCat(cat);
    return result;
  }
  const symbol = (cat, fixed=false) => {
    const color=cat.accentColor||'#ffd75a';
    return `<span class="slot-symbol symbol-cat-id${fixed?' fixed-symbol':''}" style="--symbol-color:${color}"><span class="slot-cat-fallback" aria-hidden="true">CAT</span><img src="./${cat.imagePath}" alt="${cat.name}" onerror="this.hidden=true"><b>${cat.name}</b></span>`;
  };
  function slotVisual(rarity,result) {
    const filler=window.ChokinCats.all.filter(cat=>cat.slotEnabled);
    const reel=(last,index)=>{const track=Array.from({length:4},(_,i)=>symbol(pick(filler))).join('')+symbol(last);return `<div class="slot-reel reel-${index+1}"><div class="slot-track">${track}</div><div class="slot-final final-cat-${last.rarity.toLowerCase()}" aria-hidden="true">${symbol(last,true)}</div></div>`;};
    const hero=result.special?`<div class="slot-fever-hero" style="--cat-theme:${result.hero.themeColor};--cat-accent:${result.hero.accentColor}"><img src="./${result.hero.imagePath}" alt="${result.hero.name}" onerror="this.hidden=true"><b>${result.hero.name}</b></div>`:'';
    return `<div class="slot-scene rarity-${rarity.toLowerCase()}${result.same?' same-cat-fever':''}"><div class="slot-title">CAT CHANCE</div><div class="slot-window">${result.cats.map(reel).join('')}</div><div class="slot-fever">${result.title}</div>${hero}</div>`;
  }
  function gachaVisual(rarity,cutIn,cat) {
    const label={NORMAL:'NORMAL',RARE:'RARE',SUPER:'SUPER',ULTRA:'ULTRA',LEGEND:'LEGEND'}[rarity];
    return `<div class="gacha-scene rarity-${rarity.toLowerCase()}" style="--cat-theme:${cat.themeColor};--cat-accent:${cat.accentColor}"><div class="gacha-aura"></div><div class="cat-capsule"><span class="capsule-top"></span><span class="capsule-core"></span><span class="capsule-bottom"></span></div><div class="gacha-reward"><span class="gacha-cat-fallback">CAT</span><img src="./${cat.imagePath}" alt="${cat.name}" onerror="this.hidden=true"></div><div class="gacha-result-copy"><strong class="rarity-label">${label}</strong><b class="gacha-cat-name">${cat.name}</b></div>${cutIn?`<div class="hot-cutin"><img src="./${cat.imagePath}" alt="" aria-hidden="true"><b>${rarity==='LEGEND'?'LEGEND':'激熱'}</b></div>`:''}</div>`;
  }
  function visual(plan) { return plan.show==='cat-slot'?slotVisual(plan.rarity,plan.slotResult):plan.show.startsWith('gacha-')?gachaVisual(plan.rarity,plan.cutIn,plan.cat):''; }
  window.ChokinGameFX={RARITY_RATES,PREVIEWS,plan,gachaPlan,visual};
})();
