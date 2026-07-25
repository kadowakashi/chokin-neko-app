(() => {
  'use strict';
  const assets = window.ChokinVisualAssets?.SCENES || {};
  let mountToken = 0;
  let availabilityPromise = null;
  const objectUrls = new Set();
  const keyFor = (showName, type) => showName.includes('legendary') ? 'temple' : showName.includes('treasure') ? 'treasure' : showName === 'cosmic' ? 'cosmic' : showName === 'gold' ? 'gold' : showName === 'shock' ? 'shock' : showName === 'solar' ? 'solar' : showName.includes('cat-blessing') ? 'cat' : showName.includes('gacha-legend') ? 'gachaLegend' : showName.includes('gacha-super') || showName.includes('gacha-ultra') ? 'gachaSuper' : showName.includes('gacha-') ? 'gachaNormal' : type === 'regret' ? 'regret' : type === 'necessary' ? 'necessary' : type === 'best' ? 'best' : null;
  const availableAssets = () => availabilityPromise || (availabilityPromise = fetch('./assets/manifest.json').then(response => response.ok ? response.json() : {available:[]}).then(data => Array.isArray(data.available) ? data.available : []).catch(() => []));
  async function mount(container, showName, type) {
    const token = ++mountToken, entries = assets[keyFor(showName, type)];
    if (!entries || !container) return false;
    try {
      const available=await availableAssets(), mounted=[];
      for(const asset of entries){
        if(!available.includes(asset.src))continue;
        let url=null;const image=new Image();image.alt='';image.setAttribute('aria-hidden','true');image.decoding='async';image.className=`${asset.mode==='main'?'generated-scene-main':'generated-scene-bg'} ${asset.className||''}`;
        if(asset.direct){
          image.src=`./${asset.src}`;
          await new Promise(resolve=>{
            let settled=false,timer=0;
            const finish=()=>{if(settled)return;settled=true;clearTimeout(timer);image.onload=null;image.onerror=null;resolve();};
            image.onload=finish;image.onerror=finish;timer=setTimeout(finish,5000);
            if(image.complete)finish();
          });
          await image.decode().catch(()=>{});
          if(!image.complete||!image.naturalWidth)continue;
        }else{
          const response=await fetch(`./${asset.src}`,{cache:'no-cache'});if(!response.ok)continue;
          url=URL.createObjectURL(await response.blob());if(token!==mountToken||!container.isConnected){URL.revokeObjectURL(url);continue;}
          objectUrls.add(url);image.src=url;await image.decode().catch(()=>{});
        }
        const imageProcessor=window.ChokinCatImages,requiresCleanBackground=asset.src==='assets/scenes/necessary_expense_stamp_cat.png',canProcess=imageProcessor?.isProcessableSource?.(asset.src)||imageProcessor?.isCatSource?.(asset.src);
        if(asset.mode==='main'&&requiresCleanBackground&&!canProcess){URL.revokeObjectURL(url);objectUrls.delete(url);continue;}
        if(asset.mode==='main'&&canProcess){
          const cleaned=await imageProcessor.processElement(image,asset.src);
          if(cleaned){URL.revokeObjectURL(url);objectUrls.delete(url);url=null;}
          else if(requiresCleanBackground){URL.revokeObjectURL(url);objectUrls.delete(url);continue;}
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
