(() => {
  'use strict';
  const BASE='./assets/animations/capsule-gacha/';
  const FILES=Object.freeze({
    idle:'cat_capsule_idle.png',tap1:'cat_capsule_tap_1.png',tap2:'cat_capsule_tap_2.png',push:'cat_capsule_push.png',react:'cat_capsule_react.png',
    closed:'capsule_closed.png',squash:'capsule_squash.png',top:'capsule_top.png',bottom:'capsule_bottom.png',glow:'capsule_inner_glow.png'
  });
  const urls=Object.freeze(Object.fromEntries(Object.entries(FILES).map(([key,file])=>[key,`${BASE}${file}`])));
  const cache=new Map();
  const PAW='<svg viewBox="0 0 120 110" aria-hidden="true"><g fill="currentColor"><ellipse cx="24" cy="33" rx="14" ry="19"/><ellipse cx="49" cy="20" rx="14" ry="19"/><ellipse cx="76" cy="20" rx="14" ry="19"/><ellipse cx="99" cy="35" rx="14" ry="19"/><path d="M21 80c0-25 17-41 39-41s39 16 39 41c0 19-17 28-39 28S21 99 21 80Z"/></g></svg>';
  const waitImage=(key,timeout=3500)=>{
    if(cache.has(key))return cache.get(key);
    const promise=new Promise(resolve=>{
      const image=new Image();let settled=false;
      const done=ok=>{if(settled)return;settled=true;clearTimeout(timer);resolve(ok?image:null);};
      const timer=setTimeout(()=>done(false),timeout);
      image.decoding='async';image.onload=()=>{const decoded=typeof image.decode==='function'?image.decode().catch(()=>{}):Promise.resolve();decoded.finally(()=>done(true));};image.onerror=()=>done(false);image.src=urls[key];
    });cache.set(key,promise);return promise;
  };
  const preload=()=>Promise.all(Object.keys(urls).map(key=>waitImage(key))).then(images=>images.every(Boolean));
  const fallback=className=>{const span=document.createElement('span');span.className=`capsule-gacha-paw ${className}`;span.innerHTML=PAW;return span;};
  function play(options={}){
    const host=options.host;if(!host)throw new Error('カプセル演出の表示先がありません。');
    let ended=false,revealed=false,catState='idle',capsuleState='closed';const timers=[];
    const reduced=!!options.reduced,duration=reduced?1250:5000;
    const stage=document.createElement('div');stage.className=`capsule-gacha-animation rarity-${String(options.rarity||'NORMAL').toLowerCase()}${reduced?' reduced':''}`;stage.setAttribute('aria-hidden','true');
    stage.innerHTML='<div class="capsule-gacha-aurora"></div><div class="capsule-gacha-rings"><i></i><i></i><i></i></div><div class="capsule-gacha-stars"></div><div class="capsule-gacha-flare"></div><div class="capsule-gacha-cat-slot"></div><div class="capsule-gacha-capsule-slot"></div>';
    const catSlot=stage.querySelector('.capsule-gacha-cat-slot'),capsuleSlot=stage.querySelector('.capsule-gacha-capsule-slot');
    const catImage=document.createElement('img'),capsuleImage=document.createElement('img');catImage.className='capsule-gacha-cat';capsuleImage.className='capsule-gacha-capsule';catImage.alt='';capsuleImage.alt='';
    catSlot.append(catImage);capsuleSlot.append(capsuleImage);
    const setImage=(image,slot,key,kind)=>{image.hidden=false;image.classList.remove('image-failed');image.src=urls[key];image.onerror=()=>{image.hidden=true;image.classList.add('image-failed');if(!slot.querySelector(`.${kind}-fallback`))slot.append(fallback(`${kind}-fallback`));};};
    const setCat=key=>{catState=key;catImage.className=`capsule-gacha-cat cat-${key}`;setImage(catImage,catSlot,key,'cat');};
    const setCapsule=key=>{capsuleState=key;capsuleImage.className=`capsule-gacha-capsule capsule-${key}`;setImage(capsuleImage,capsuleSlot,key,'capsule');};
    const schedule=(time,fn)=>{const id=setTimeout(()=>{if(!ended)fn();},time);timers.push(id);};
    const clear=()=>{timers.splice(0).forEach(clearTimeout);};
    const cleanup=()=>{if(ended)return;ended=true;clear();stage.remove();};
    const reveal=reason=>{if(revealed)return;revealed=true;clear();stage.classList.add('is-revealing');schedule(90,()=>{});const callback=options.onReveal;cleanup();callback?.(reason);};
    const open=()=>{
      stage.classList.add('is-open');capsuleSlot.replaceChildren();
      ['bottom','glow','top'].forEach(key=>{const image=document.createElement('img');image.className=`capsule-gacha-open capsule-${key}`;image.alt='';capsuleSlot.append(image);setImage(image,capsuleSlot,key,'capsule');});
      options.onPop?.();
    };
    host.replaceChildren(stage);setCat('idle');setCapsule('closed');
    const stars=stage.querySelector('.capsule-gacha-stars');stars.innerHTML=Array.from({length:reduced?8:24},(_,i)=>`<i style="--i:${i};--x:${7+(i*37)%87}%;--y:${9+(i*53)%76}%;--d:${(i%8)*.09}s"></i>`).join('');
    preload().catch(()=>false);
    if(reduced){schedule(260,()=>{setCat('push');setCapsule('squash');stage.classList.add('is-pushing');});schedule(650,open);schedule(860,()=>{capsuleSlot.replaceChildren();setCat('react');stage.classList.add('is-reacting');});schedule(duration,()=>reveal('complete'));}
    else{
      schedule(200,()=>stage.classList.add('is-looking'));
      schedule(1000,()=>{setCat('tap1');stage.classList.add('is-tap1');options.onTap?.(1);});
      schedule(1600,()=>{setCat('tap2');setCapsule('squash');stage.classList.remove('is-tap1');stage.classList.add('is-tap2');options.onTap?.(2);});
      schedule(2200,()=>{setCat('push');setCapsule('squash');stage.classList.remove('is-tap2');stage.classList.add('is-pushing');});
      schedule(3500,open);
      schedule(4200,()=>{capsuleSlot.replaceChildren();setCat('react');stage.classList.add('is-reacting');});
      schedule(duration,()=>reveal('complete'));
    }
    return {skip:()=>reveal('skip'),cleanup,get duration(){return duration;},state:()=>({ended,revealed,catState,capsuleState})};
  }
  window.ChokinCapsuleGacha={FILES,urls,preload,play};
})();
