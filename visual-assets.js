(() => {
  'use strict';
  const COINS = Object.freeze({
    cat: 'assets/coins/cat_coin.png',
    gold: 'assets/coins/gold_coin.png',
    sparkle: 'assets/coins/gold_coin_sparkle.png',
    premium: 'assets/coins/premium_coin.png'
  });
  const SCENES = Object.freeze({
    cosmic: [{src:'assets/scenes/space_bg.png',mode:'background',className:'asset-space-bg'},{src:'assets/cats/cat_cosmic.png',mode:'main',className:'asset-cosmic-cat'}],
    treasure: [{src:'assets/scenes/treasure_chest_closed.png',mode:'main',className:'asset-chest-closed'},{src:'assets/scenes/treasure_chest_open.png',mode:'main',className:'asset-chest-open'}],
    cat: [{src:'assets/cats/cat_celebrate.png',mode:'main',className:'asset-celebrate-cat'}],
    temple: [{src:'assets/scenes/cat_temple_bg.png',mode:'background',className:'asset-temple-bg'},{src:'assets/scenes/cat_temple_foreground.png',mode:'main',className:'asset-temple-foreground'},{src:'assets/cats/cat_royal.png',mode:'main',className:'asset-royal-cat'}],
    gold: [{src:'assets/scenes/gold_sun.png',mode:'main',className:'asset-gold-sun'}],
    shock: [{src:'assets/scenes/energy_core.png',mode:'main',className:'asset-energy-core'}],
    necessary: [{src:'assets/scenes/receipt_stamp.png',mode:'main',className:'asset-receipt-stamp'}],
    gachaNormal: [{src:'assets/cats/cat_celebrate.png',mode:'main',className:'asset-gacha-cat'}],
    gachaSuper: [{src:'assets/cats/cat_cosmic.png',mode:'main',className:'asset-gacha-cat'}],
    gachaLegend: [{src:'assets/cats/cat_royal.png',mode:'main',className:'asset-gacha-cat'}],
    regret: [{src:'assets/cats/cat_surprised.png',mode:'main',className:'asset-surprised-cat'}],
    best: [{src:'assets/cats/cat_royal.png',mode:'main',className:'asset-royal-cat'}]
  });
  const images = new Map();
  let available = new Set();
  const ready = fetch('./assets/manifest.json').then(response=>response.ok?response.json():{available:[]}).then(async data=>{
    available=new Set(Array.isArray(data.available)?data.available:[]);
    await Promise.all(Object.entries(COINS).map(async ([kind,path])=>{
      if(!available.has(path))return;
      const image=new Image();image.decoding='async';image.src=`./${path}`;
      try{await image.decode();images.set(kind,image);document.documentElement.style.setProperty(`--${kind}-coin-image`,`url('./${path}')`);document.documentElement.classList.add(`has-${kind}-coin-image`);}catch{}
    }));
  }).catch(()=>{});
  const coinMarkup=(kind='cat',label='🪙')=>`<span class="coin-visual coin-${kind}" aria-hidden="true"><span>${label}</span></span>`;
  const scene=key=>SCENES[key]||null;
  const getCoinImage=kind=>images.get(kind)||null;
  const isAvailable=path=>available.has(path);
  window.ChokinVisualAssets={COINS,SCENES,ready,coinMarkup,scene,getCoinImage,isAvailable};
})();
