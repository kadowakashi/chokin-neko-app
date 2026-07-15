(() => {
  'use strict';
  const assets = window.ChokinVisualAssets?.SCENES || {};
  let mountToken = 0;
  let availabilityPromise = null;
  const objectUrls = new Set();
  const keyFor = (showName, type) => showName.includes('legendary') ? 'temple' : showName.includes('treasure') ? 'treasure' : showName === 'cosmic' ? 'cosmic' : showName === 'gold' ? 'gold' : showName === 'shock' ? 'shock' : showName.includes('cat-blessing') ? 'cat' : showName.includes('gacha-legend') ? 'gachaLegend' : showName.includes('gacha-super') || showName.includes('gacha-ultra') ? 'gachaSuper' : showName.includes('gacha-') ? 'gachaNormal' : type === 'regret' ? 'regret' : type === 'necessary' ? 'necessary' : type === 'best' ? 'best' : null;
  const availableAssets = () => availabilityPromise || (availabilityPromise = fetch('./assets/manifest.json').then(response => response.ok ? response.json() : {available:[]}).then(data => Array.isArray(data.available) ? data.available : []).catch(() => []));
  async function mount(container, showName, type) {
    const token = ++mountToken, entries = assets[keyFor(showName, type)];
    if (!entries || !container) return false;
    try {
      const available=await availableAssets(), mounted=[];
      for(const asset of entries){
        if(!available.includes(asset.src))continue;
        const response=await fetch(`./${asset.src}`,{cache:'no-cache'});if(!response.ok)continue;
        let url=URL.createObjectURL(await response.blob());if(token!==mountToken||!container.isConnected){URL.revokeObjectURL(url);continue;}
        objectUrls.add(url);const image=new Image();image.alt='';image.decoding='async';image.src=url;image.className=`${asset.mode==='main'?'generated-scene-main':'generated-scene-bg'} ${asset.className||''}`;await image.decode().catch(()=>{});
        if(asset.mode==='main'&&window.ChokinCatImages?.isCatSource(asset.src)){
          const cleaned=await window.ChokinCatImages.processElement(image,asset.src);
          if(cleaned){URL.revokeObjectURL(url);objectUrls.delete(url);url=null;}
        }
        if(token!==mountToken){if(url){URL.revokeObjectURL(url);objectUrls.delete(url);}continue;}container.prepend(image);container.classList.add(asset.mode==='main'?'has-generated-main':'has-generated-bg');mounted.push(asset.src);
      }
      return mounted.length>0;
    } catch { return false; }
  }
  function clear(container) {
    mountToken++;
    container?.classList.remove('has-generated-main','has-generated-bg');
    container?.querySelectorAll('.generated-scene-main,.generated-scene-bg').forEach(image => image.remove());
    objectUrls.forEach(url => URL.revokeObjectURL(url)); objectUrls.clear();
  }
  window.ChokinAssets = {mount, clear, manifest: Object.freeze({...assets})};
})();
