(() => {
  'use strict';
  const assets = {
    cosmic: [{src:'assets/scenes/space_bg.png',mode:'background',className:'asset-space-bg'},{src:'assets/cats/cat_cosmic.png',mode:'main',className:'asset-cosmic-cat'}],
    treasure: [{src:'assets/scenes/treasure_chest_closed.png',mode:'main',className:'asset-chest-closed'},{src:'assets/scenes/treasure_chest_open.png',mode:'main',className:'asset-chest-open'}],
    cat: [{src:'assets/cats/cat_celebrate.png',mode:'main',className:'asset-celebrate-cat'}],
    temple: [{src:'assets/scenes/cat_temple_bg.png',mode:'background',className:'asset-temple-bg'},{src:'assets/cats/cat_royal.png',mode:'main',className:'asset-royal-cat'}],
    gachaNormal: [{src:'assets/cats/cat_celebrate.png',mode:'main',className:'asset-gacha-cat'}],
    gachaSuper: [{src:'assets/cats/cat_cosmic.png',mode:'main',className:'asset-gacha-cat'}],
    gachaLegend: [{src:'assets/cats/cat_royal.png',mode:'main',className:'asset-gacha-cat'}],
    regret: [{src:'assets/cats/cat_surprised.png',mode:'main',className:'asset-surprised-cat'}],
    best: [{src:'assets/cats/cat_royal.png',mode:'main',className:'asset-royal-cat'}]
  };
  let mountToken = 0;
  let availabilityPromise = null;
  const objectUrls = new Set();
  const keyFor = (showName, type) => showName.includes('legendary') ? 'temple' : showName.includes('treasure') ? 'treasure' : showName === 'cosmic' ? 'cosmic' : showName.includes('cat-blessing') ? 'cat' : showName.includes('gacha-legend') ? 'gachaLegend' : showName.includes('gacha-super') || showName.includes('gacha-ultra') ? 'gachaSuper' : showName.includes('gacha-') ? 'gachaNormal' : type === 'regret' ? 'regret' : type === 'best' ? 'best' : null;
  const availableAssets = () => availabilityPromise || (availabilityPromise = fetch('./assets/manifest.json').then(response => response.ok ? response.json() : {available:[]}).then(data => Array.isArray(data.available) ? data.available : []).catch(() => []));
  async function cleanMainImage(image) {
    const scale=Math.min(1,384/Math.max(image.naturalWidth,image.naturalHeight)),width=Math.max(1,Math.round(image.naturalWidth*scale)),height=Math.max(1,Math.round(image.naturalHeight*scale));
    const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;const context=canvas.getContext('2d',{willReadFrequently:true});context.drawImage(image,0,0,width,height);
    const frame=context.getImageData(0,0,width,height),data=frame.data,visited=new Uint8Array(width*height),queue=new Int32Array(width*height);let head=0,tail=0,removed=0;
    const pale=index=>{const p=index*4,r=data[p],g=data[p+1],b=data[p+2];return r>210&&g>210&&b>210&&Math.max(r,g,b)-Math.min(r,g,b)<22;};
    const push=index=>{if(index>=0&&index<visited.length&&!visited[index]&&pale(index)){visited[index]=1;queue[tail++]=index;}};
    for(let x=0;x<width;x++){push(x);push((height-1)*width+x);}for(let y=0;y<height;y++){push(y*width);push(y*width+width-1);}
    while(head<tail){const index=queue[head++],x=index%width;data[index*4+3]=0;removed++;if(x>0)push(index-1);if(x<width-1)push(index+1);if(index>=width)push(index-width);if(index<width*(height-1))push(index+width);}
    if(removed<width*height*.08)return null;context.putImageData(frame,0,0);return new Promise(resolve=>canvas.toBlob(blob=>resolve(blob?URL.createObjectURL(blob):null),'image/png'));
  }
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
        if(asset.mode==='main'){const cleaned=await cleanMainImage(image);if(cleaned){URL.revokeObjectURL(url);objectUrls.delete(url);url=cleaned;objectUrls.add(url);image.src=url;await image.decode().catch(()=>{});}}
        if(token!==mountToken){URL.revokeObjectURL(url);objectUrls.delete(url);continue;}container.prepend(image);container.classList.add(asset.mode==='main'?'has-generated-main':'has-generated-bg');mounted.push(asset.src);
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
