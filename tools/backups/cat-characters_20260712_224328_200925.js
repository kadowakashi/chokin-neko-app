(() => {
  'use strict';
  const cats = [
    ['celebrate','お祝い猫','NORMAL','cat_celebrate','assets/cats/cat_celebrate.png',10,'#fff4dc','#ffd75a','お祝い猫が未来への一歩を祝福しています','CELEBRATION CAT FEVER'],
    ['black','黒猫','NORMAL','cat_black','assets/cats/cat_black.png',10,'#222222','#ffd75a','黒猫が未来資産を見守っています','BLACK CAT FEVER'],
    ['calico','三毛猫','NORMAL','cat_calico','assets/cats/cat_calico.png',10,'#f7e6cf','#e98752','三毛猫が幸運を運んできました','CALICO FEVER'],
    ['orange_tabby','茶トラ','NORMAL','cat_orange_tabby','assets/cats/cat_orange_tabby.png',10,'#d98235','#fff0a0','茶トラが元気よく貯金を応援しています','ORANGE CAT FEVER'],
    ['hachiware','ハチワレ','NORMAL','cat_hachiware','assets/cats/cat_hachiware.png',10,'#30333c','#f4f6ff','ハチワレが堅実な一歩を確認しました','HACHIWARE FEVER'],
    ['gray','灰猫','NORMAL','cat_gray','assets/cats/cat_gray.png',10,'#687080','#bde7ff','灰猫が静かに未来を強化しました','GRAY CAT FEVER'],
    ['surprised','驚き猫','RARE','cat_surprised','assets/cats/cat_surprised.png',8,'#f0b36f','#ff6f91','驚き猫も目を見張る貯金です','SURPRISE CAT FEVER'],
    ['ninja','忍者猫','RARE','cat_ninja','assets/cats/cat_ninja.png',8,'#171b2c','#8e7cff','忍者猫が気配なく未来資産を守りました','NINJA CAT FEVER'],
    ['wizard','魔法使い猫','RARE','cat_wizard','assets/cats/cat_wizard.png',8,'#42206b','#c58cff','貯金魔法が鮮やかに発動しました','MAGIC CAT FEVER'],
    ['detective','探偵猫','RARE','cat_detective','assets/cats/cat_detective.png',8,'#5a4335','#7ac7ff','探偵猫が未来への手がかりを発見しました','DETECTIVE CAT FEVER'],
    ['chef','シェフ猫','RARE','cat_chef','assets/cats/cat_chef.png',8,'#fff8eb','#ff7b65','シェフ猫が最高の未来を仕込みました','CHEF CAT FEVER'],
    ['cosmic','宇宙猫','SUPER','cat_cosmic','assets/cats/cat_cosmic.png',6,'#18256b','#71dbff','銀河級の貯金エネルギーを観測しました','COSMIC CAT FEVER'],
    ['samurai','侍猫','SUPER','cat_samurai','assets/cats/cat_samurai.png',6,'#521d24','#ffc857','侍猫が未来への覚悟を認定しました','SAMURAI CAT FEVER'],
    ['pirate','海賊猫','SUPER','cat_pirate','assets/cats/cat_pirate.png',6,'#172b46','#ffcc4d','海賊猫が未来のお宝を発見しました','PIRATE CAT FEVER'],
    ['knight','騎士猫','SUPER','cat_knight','assets/cats/cat_knight.png',6,'#6e7891','#ffe58b','騎士猫があなたの未来資産を守ります','KNIGHT CAT FEVER'],
    ['angel','天使猫','ULTRA','cat_angel','assets/cats/cat_angel.png',4,'#e9f6ff','#ffd8f5','天使猫の祝福が未来まで届きます','ANGEL CAT FEVER'],
    ['dragon','ドラゴン猫','ULTRA','cat_dragon','assets/cats/cat_dragon.png',4,'#741f30','#ffb52e','貯金エネルギーが炎となって限界突破！','DRAGON CAT FEVER'],
    ['royal','王様猫','LEGEND','cat_royal','assets/cats/cat_royal.png',2,'#6d183e','#ffe05e','王様猫が伝説級の貯金を宣言しました','ROYAL CAT FEVER'],
    ['deity','猫神','LEGEND','cat_deity','assets/cats/cat_deity.png',2,'#fff1b8','#ffbd2e','猫神の加護が未来資産へ降り注ぎます','CAT GOD FEVER']
  ].map(([id,name,rarity,imageKey,imagePath,weight,themeColor,accentColor,message,feverTitle])=>Object.freeze({id,name,rarity,imageKey,imagePath,gachaEnabled:true,slotEnabled:true,weight,themeColor,accentColor,message,feverTitle}));
  const RECENT_KEY='chokin-event-app.gachaRecent.v1';
  const weightedPick = list => { const total=list.reduce((sum,item)=>sum+item.adjustedWeight,0);let value=Math.random()*total;for(const item of list){value-=item.adjustedWeight;if(value<=0)return item.cat;}return list[0]?.cat; };
  const byRarity = rarity => cats.filter(cat=>cat.rarity===rarity);
  function recent() { try { const value=JSON.parse(localStorage.getItem(RECENT_KEY)||'[]');return Array.isArray(value)?value.slice(0,3):[]; } catch { return []; } }
  function choose(rarity,{persist=true,slot=false}={}) {
    const pool=(slot?cats.filter(cat=>cat.slotEnabled):cats.filter(cat=>cat.gachaEnabled&&cat.rarity===rarity));
    const history=recent(), weighted=pool.map(cat=>({cat,adjustedWeight:cat.weight*(history.includes(cat.id)?.35:1)}));
    const selected=weightedPick(weighted)||cats[0];
    if(persist&&!slot){try{localStorage.setItem(RECENT_KEY,JSON.stringify([selected.id,...history.filter(id=>id!==selected.id)].slice(0,3)));}catch{}}
    return selected;
  }
  const get = id => cats.find(cat=>cat.id===id)||cats[0];
  window.ChokinCats={all:Object.freeze(cats),byRarity,choose,get,recentKey:RECENT_KEY};
})();
