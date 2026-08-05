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
  const fallback=(key,kind)=>{const span=document.createElement('span');
    if(kind==='cat'){span.className='capsule-gacha-paw cat-fallback';span.innerHTML=PAW;}
    else if(key==='glow')span.className='capsule-gacha-glow-fallback';
    else span.className=`capsule-gacha-body-fallback capsule-${key}-fallback`;
    span.setAttribute('aria-hidden','true');return span;
  };
  function play(options={}){
    const host=options.host;if(!host)throw new Error('カプセル演出の表示先がありません。');
    let ended=false,revealed=false,catState='idle',capsuleState='closed';const timers=[];
    const reduced=!!options.reduced,duration=reduced?1250:5000;
    const stage=document.createElement('div');stage.className=`capsule-gacha-animation rarity-${String(options.rarity||'NORMAL').toLowerCase()}${reduced?' reduced':''}`;stage.setAttribute('aria-hidden','true');
    stage.innerHTML='<div class="capsule-gacha-aurora"></div><div class="capsule-gacha-rings"><i></i><i></i><i></i></div><div class="capsule-gacha-stars"></div><div class="capsule-gacha-flare"></div><div class="capsule-gacha-cat-slot"></div><div class="capsule-gacha-capsule-slot"></div>';
    const catSlot=stage.querySelector('.capsule-gacha-cat-slot'),capsuleSlot=stage.querySelector('.capsule-gacha-capsule-slot');
    let catFrameToken=0,capsuleFrameToken=0;
    const preparedImage=(image,className,key)=>{image.className=className;image.alt='';image.hidden=false;image.dataset.capsuleFrame=key;return image;};
    const setCat=key=>{const token=++catFrameToken;catState=key;catSlot.dataset.pendingFrame=key;catSlot.dataset.frameState='loading';waitImage(key).then(source=>{if(ended||!stage.isConnected||(token!==catFrameToken&&catSlot.childElementCount))return;catSlot.replaceChildren(source?preparedImage(source,`capsule-gacha-cat cat-${key}`,key):fallback(key,'cat'));catSlot.dataset.frame=key;catSlot.dataset.frameState=source?'loaded':'failed';});};
    const setCapsule=key=>{const token=++capsuleFrameToken;capsuleState=key;capsuleSlot.dataset.pendingFrame=key;capsuleSlot.dataset.frameState='loading';waitImage(key).then(source=>{if(ended||!stage.isConnected||(token!==capsuleFrameToken&&capsuleSlot.childElementCount))return;capsuleSlot.replaceChildren(source?preparedImage(source,`capsule-gacha-capsule capsule-${key}`,key):fallback(key,'capsule'));capsuleSlot.dataset.frame=key;capsuleSlot.dataset.frameState=source?'loaded':'failed';});};
    const schedule=(time,fn)=>{const id=setTimeout(()=>{if(!ended)fn();},time);timers.push(id);};
    const clear=()=>{timers.splice(0).forEach(clearTimeout);};
    const cleanup=()=>{if(ended)return;ended=true;clear();stage.remove();};
    const reveal=reason=>{if(revealed)return;revealed=true;clear();stage.classList.add('is-revealing');schedule(90,()=>{});const callback=options.onReveal;cleanup();callback?.(reason);};
    const open=()=>{
      const token=++capsuleFrameToken,keys=['bottom','glow','top'];capsuleState='open';capsuleSlot.dataset.pendingFrame='open';capsuleSlot.dataset.frameState='loading';stage.classList.remove('is-tap1','is-tap2','is-pushing');stage.classList.add('is-open');
      Promise.all(keys.map(key=>waitImage(key))).then(sources=>{if(ended||token!==capsuleFrameToken||!stage.isConnected)return;const nodes=keys.map((key,index)=>sources[index]?preparedImage(sources[index],`capsule-gacha-open capsule-${key}`,key):fallback(key,'capsule'));capsuleSlot.replaceChildren(...nodes);capsuleSlot.dataset.frame='open';capsuleSlot.dataset.frameState=sources.every(Boolean)?'loaded':'failed';});
      options.onPop?.();
    };
    host.replaceChildren(stage);setCat('idle');setCapsule('closed');
    const stars=stage.querySelector('.capsule-gacha-stars');stars.innerHTML=Array.from({length:reduced?8:24},(_,i)=>`<i style="--i:${i};--x:${7+(i*37)%87}%;--y:${9+(i*53)%76}%;--d:${(i%8)*.09}s"></i>`).join('');
    if(reduced){schedule(220,()=>{setCat('push');setCapsule('squash');stage.classList.add('is-pushing');});schedule(520,open);schedule(780,()=>{setCat('react');stage.classList.add('is-reacting');});schedule(duration,()=>reveal('complete'));}
    else{
      schedule(200,()=>stage.classList.add('is-looking'));
      schedule(800,()=>{setCat('tap1');stage.classList.add('is-tap1');options.onTap?.(1);});
      schedule(1500,()=>{setCat('tap2');stage.classList.remove('is-tap1');stage.classList.add('is-tap2');options.onTap?.(2);});
      schedule(2200,()=>{setCat('push');setCapsule('squash');stage.classList.remove('is-tap2');stage.classList.add('is-pushing');});
      schedule(2900,open);
      schedule(3700,()=>{setCat('react');stage.classList.add('is-reacting');});
      schedule(duration,()=>reveal('complete'));
    }
    return {skip:()=>reveal('skip'),cleanup,get duration(){return duration;},state:()=>({ended,revealed,catState,capsuleState})};
  }
  window.ChokinCapsuleGacha={FILES,urls,preload,play};
})();
