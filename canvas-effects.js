(() => {
  'use strict';
  let frameId = 0, activeCanvas = null, running = false, resumeAnimation = null;
  const TAU = Math.PI * 2;
  const rand = (min,max) => min + Math.random() * (max-min);
  function sceneKey(name, type) { return name.includes('legendary') ? 'temple' : name.includes('treasure') ? 'treasure' : name === 'cosmic' ? 'cosmic' : name === 'cat-slot' ? 'cat' : name.startsWith('gacha-') ? 'gacha' : name === 'shock' ? 'shock' : name === 'gold' ? 'gold' : name.includes('cat-blessing') ? 'cat' : type; }
  function setup(canvas) {
    const rect = canvas.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.max(1, Math.round(rect.width*dpr)); canvas.height = Math.max(1, Math.round(rect.height*dpr));
    const ctx = canvas.getContext('2d', {alpha:true}); ctx.setTransform(dpr,0,0,dpr,0,0);
    return {ctx,w:rect.width,h:rect.height,dpr};
  }
  const makeParticles = (count, factory) => Array.from({length:count},(_,index)=>factory(index));
  function start(canvas, showName, type, options={}) {
    stop(true); if (!canvas) return;
    activeCanvas = canvas; running = true; canvas.dataset.fxState='running';let ambientTick=0;
    const reduced = !!options.reduced, rarity = options.rarity || 'NORMAL', key = sceneKey(showName,type), startTime = performance.now();
    const surface = setup(canvas);
    const count = reduced ? 12 : Math.min(90, Math.round((window.innerWidth || 375)/5));
    const particles = makeParticles(count, i => ({angle:rand(0,TAU),speed:rand(.5,1.6),size:rand(2,7),delay:rand(0,.7),spin:rand(-3,3),x:rand(0,1),y:rand(0,1),hue:i%3}));
    const ambient = makeParticles(reduced?15:40,i=>({x:rand(0,1),y:rand(0,1),speed:rand(.012,.04),size:rand(1.2,4),phase:rand(0,TAU),star:i<(reduced?2:6)}));canvas.dataset.fxParticles=String(ambient.length);canvas.dataset.fxStars=String(reduced?2:6);
    const stars = makeParticles(reduced?18:70,()=>({angle:rand(0,TAU),depth:rand(.04,1),size:rand(.5,2.8)}));
    const coins = makeParticles(reduced?8:28,()=>({x:rand(-48,48),vx:rand(-65,65),vy:rand(-270,-145),size:rand(5,11),delay:rand(0,.45),spin:rand(-8,8)}));
    const render = now => {
      if (!running || canvas !== activeCanvas) return;
      if(document.hidden){running=false;canvas.dataset.fxState='paused';resumeAnimation=()=>{if(canvas===activeCanvas&&document.querySelector('#celebration')?.getAttribute('aria-hidden')==='false'){running=true;canvas.dataset.fxState='running';frameId=requestAnimationFrame(render);}};return;}
      const {ctx,w,h} = surface, rawTime = Math.max(0,(now-startTime)/1000), t=rawTime>=1.82&&rawTime<2.08?1.82:rawTime;
      ctx.clearRect(0,0,w,h);
      if(rawTime>4.15){drawAmbient(ctx,w,h,rawTime,ambient,rarity,reduced);canvas.dataset.fxMode='ambient';if(++ambientTick%12===0)canvas.dataset.fxTick=String(ambientTick);frameId=requestAnimationFrame(render);return;}
      if (key === 'treasure') drawTreasure(ctx,w,h,t,coins,reduced);
      else if (key === 'cosmic') drawCosmic(ctx,w,h,t,stars);
      else if (key === 'temple') drawTemple(ctx,w,h,t,particles);
      else if (key === 'shock') drawShock(ctx,w,h,t);
      else if (key === 'gold') drawGold(ctx,w,h,t,particles);
      else if (key === 'cat' || key === 'best' || key === 'gacha') drawCelebration(ctx,w,h,t,particles,key);
      else if (key === 'regret') drawRegret(ctx,w,h,t,particles);
      else drawCalm(ctx,w,h,t,particles);
      drawClimax(ctx,w,h,rawTime,particles,rarity,reduced);
      frameId = requestAnimationFrame(render);
    };
    frameId = requestAnimationFrame(render);
  }
  function glow(ctx,x,y,r,color,alpha=1) { const g=ctx.createRadialGradient(x,y,0,x,y,r); g.addColorStop(0,color); g.addColorStop(.28,color); g.addColorStop(1,'transparent'); ctx.globalAlpha=alpha; ctx.fillStyle=g; ctx.fillRect(x-r,y-r,r*2,r*2); ctx.globalAlpha=1; }
  function drawTreasure(ctx,w,h,t,coins,reduced) {
    const x=w/2, openingY=h*.485, open=Math.max(0,Math.min(1,(t-2.04)/.36));
    ctx.save(); ctx.beginPath(); ctx.rect(x-88,openingY-7,176,35); ctx.clip(); glow(ctx,x,openingY+8,110,'rgba(255,211,61,.95)',.25+.65*open); ctx.restore();
    if (open>0) {
      ctx.save(); ctx.globalCompositeOperation='screen'; const cone=ctx.createLinearGradient(x,openingY,x,openingY-h*.42); cone.addColorStop(0,`rgba(255,223,106,${.48*open})`); cone.addColorStop(1,'rgba(255,231,154,0)'); ctx.fillStyle=cone; ctx.beginPath(); ctx.moveTo(x-70,openingY); ctx.lineTo(x-145,openingY-h*.4); ctx.lineTo(x+145,openingY-h*.4); ctx.lineTo(x+70,openingY); ctx.closePath(); ctx.fill(); ctx.restore();
      glow(ctx,x,openingY,Math.min(w*.48,210)*open,'rgba(255,192,40,.55)',.55);
    }
    if (t>2.12) coins.forEach((coin,index)=>{ const p=t-2.12-coin.delay; if(p<0||p>1.45)return; const px=x+coin.x+coin.vx*p, py=openingY+coin.vy*p+190*p*p; ctx.save(); ctx.globalAlpha=Math.sin(Math.min(1,p/1.35)*Math.PI); ctx.translate(px,py); ctx.rotate(coin.spin*p); ctx.scale(Math.max(.18,Math.abs(Math.cos(p*8))),1); ctx.fillStyle=index%2?'#ffd84d':'#fff0a0'; ctx.strokeStyle='#a85b08'; ctx.lineWidth=2; ctx.beginPath(); ctx.arc(0,0,coin.size,0,TAU); ctx.fill(); ctx.stroke(); ctx.restore(); });
  }
  function drawCosmic(ctx,w,h,t,stars) { const x=w/2,y=h*.44, pull=Math.min(1,t/.75), release=Math.max(0,t-.72); ctx.save(); ctx.globalCompositeOperation='screen'; stars.forEach(star=>{ const radius=(12+star.depth*Math.max(w,h)*.75)*(release?Math.min(1,release*1.5):1-pull*.82); const px=x+Math.cos(star.angle)*radius, py=y+Math.sin(star.angle)*radius; const len=8+release*55*star.depth; ctx.strokeStyle=`rgba(${star.depth>.55?'180,220,255':'130,105,255'},${.25+.7*star.depth})`; ctx.lineWidth=star.size; ctx.beginPath(); ctx.moveTo(px,py); ctx.lineTo(px-Math.cos(star.angle)*len,py-Math.sin(star.angle)*len); ctx.stroke(); }); glow(ctx,x,y,80+Math.sin(t*4)*24,'rgba(112,86,255,.5)',.8); ctx.restore(); }
  function drawTemple(ctx,w,h,t,particles) { const x=w/2,y=h*.42; ctx.save(); ctx.globalCompositeOperation='screen'; for(let i=0;i<18;i++){ const angle=i/18*TAU+t*.18, inner=45, outer=Math.max(w,h)*.55; ctx.strokeStyle=`rgba(255,225,120,${.08+.22*Math.max(0,t-.45)})`; ctx.lineWidth=i%3?3:9; ctx.beginPath();ctx.moveTo(x+Math.cos(angle)*inner,y+Math.sin(angle)*inner);ctx.lineTo(x+Math.cos(angle)*outer,y+Math.sin(angle)*outer);ctx.stroke(); } if(t>.55){ const alpha=Math.min(.42,(t-.55)*.5); ctx.fillStyle=`rgba(255,236,166,${alpha})`; ctx.fillRect(x-w*.2,0,w*.4,h*.72); } particles.forEach((p,i)=>{ const py=(p.y*h+t*(22+p.speed*18))%h, px=p.x*w+Math.sin(t+p.angle)*18; ctx.fillStyle=`rgba(255,235,142,${.25+.55*(i%3===0)})`;ctx.fillRect(px,py,p.size,p.size*1.8);}); ctx.restore(); }
  function drawShock(ctx,w,h,t) { const x=w/2,y=h*.45, charge=Math.min(1,t/.7); glow(ctx,x,y,30+charge*70,'rgba(58,226,255,.65)',.8); if(t>.68){ [0,.15,.3].forEach(delay=>{const p=(t-.68-delay)/.72;if(p<=0||p>=1)return;ctx.strokeStyle=`rgba(166,248,255,${1-p})`;ctx.lineWidth=8*(1-p)+2;ctx.beginPath();ctx.arc(x,y,p*Math.max(w,h)*.65,0,TAU);ctx.stroke();}); } }
  function drawGold(ctx,w,h,t,particles) { const x=w/2,y=h*.44, burst=Math.max(0,Math.min(1,(t-.45)/.65)); glow(ctx,x,y,50+burst*Math.min(w,h)*.7,'rgba(255,192,31,.7)',.75); particles.forEach((p,i)=>{const age=t-.75-p.delay;if(age<0)return;const px=p.x*w+Math.sin(p.angle+age)*25,py=((p.y*h+age*(120+p.speed*70))%h);ctx.save();ctx.translate(px,py);ctx.rotate(age*p.spin);ctx.fillStyle=i%3===0?'#fff3a5':i%3===1?'#ffbd2e':'#f46f72';ctx.fillRect(-p.size/2,-p.size,p.size,p.size*2.2);ctx.restore();}); }
  function drawCelebration(ctx,w,h,t,particles,key) { const x=w/2,y=h*.42; glow(ctx,x,y,80+Math.max(0,t-.7)*75,key==='best'?'rgba(235,101,255,.42)':'rgba(255,115,186,.38)',.8); particles.forEach((p,i)=>{const age=t-.7-p.delay;if(age<0)return;const r=35+age*(90+p.speed*45),px=x+Math.cos(p.angle)*r,py=y+Math.sin(p.angle)*r-age*18;ctx.fillStyle=i%2?'#ffd75f':'#ff8fc7';ctx.beginPath();ctx.arc(px,py,p.size,0,TAU);ctx.fill();}); }
  function drawRegret(ctx,w,h,t,particles) { particles.slice(0,24).forEach((p,i)=>{const age=t-p.delay;if(age<0)return;ctx.strokeStyle=`rgba(255,66,89,${Math.max(0,.65-age*.2)})`;ctx.lineWidth=2+p.size/3;ctx.beginPath();ctx.moveTo(p.x*w,0);ctx.lineTo(p.x*w-20,h);ctx.stroke();}); }
  function drawCalm(ctx,w,h,t,particles) { particles.slice(0,20).forEach(p=>{ctx.fillStyle='rgba(130,205,235,.28)';ctx.beginPath();ctx.arc(p.x*w,(p.y*h+t*18)%h,p.size,0,TAU);ctx.fill();}); }
  function drawAmbient(ctx,w,h,t,particles,rarity,reduced) {
    const rank=Math.max(0,['NORMAL','RARE','SUPER','ULTRA','LEGEND'].indexOf(rarity));ctx.save();ctx.globalCompositeOperation='screen';
    particles.forEach((p,i)=>{const y=((p.y-t*p.speed)%1+1)%1*h,x=(p.x+Math.sin(t*.35+p.phase)*.025)*w,alpha=.28+.25*Math.sin(t*.8+p.phase);if(p.star)sparkle(ctx,x,y,p.size*(1.5+rank*.12),rank>=3?`hsl(${(t*24+i*57)%360} 100% 78%)`:'#ffe58a',alpha);else{ctx.fillStyle=i%4===0?'rgba(255,255,255,.55)':'rgba(255,211,74,.48)';ctx.beginPath();ctx.arc(x,y,p.size,0,TAU);ctx.fill();}});
    const pulse=(Math.sin(t*.9)+1)/2;ctx.strokeStyle=`rgba(255,221,105,${.08+pulse*.12})`;ctx.lineWidth=2;ctx.beginPath();ctx.arc(w/2,h*.45,55+pulse*22,0,TAU);ctx.stroke();ctx.restore();
  }
  function sparkle(ctx,x,y,size,color,alpha) {
    ctx.save();ctx.globalAlpha=alpha;ctx.strokeStyle=color;ctx.lineCap='round';ctx.shadowColor=color;ctx.shadowBlur=size*.8;
    ctx.lineWidth=Math.max(1,size*.13);ctx.beginPath();ctx.moveTo(x-size,y);ctx.lineTo(x+size,y);ctx.moveTo(x,y-size);ctx.lineTo(x,y+size);ctx.moveTo(x-size*.5,y-size*.5);ctx.lineTo(x+size*.5,y+size*.5);ctx.moveTo(x+size*.5,y-size*.5);ctx.lineTo(x-size*.5,y+size*.5);ctx.stroke();ctx.restore();
  }
  function drawClimax(ctx,w,h,t,particles,rarity,reduced) {
    if(t<1.95)return;
    const rank=Math.max(0,['NORMAL','RARE','SUPER','ULTRA','LEGEND'].indexOf(rarity)),x=w/2,y=h*.45,age=t-2.08;
    if(t<2.08){ctx.save();ctx.fillStyle=`rgba(0,0,8,${Math.min(.62,(t-1.95)*4.7)})`;ctx.fillRect(0,0,w,h);ctx.restore();return;}
    const flash=Math.max(0,1-age*5.5),power=.45+rank*.16;
    ctx.save();ctx.globalCompositeOperation='screen';
    if(flash>0){ctx.fillStyle=`rgba(255,255,245,${flash*.72})`;ctx.fillRect(0,0,w,h);}
    if(rank>=2){const columns=reduced?2:4+rank;for(let i=0;i<columns;i++){const cx=(i+.5)*w/columns,beam=ctx.createLinearGradient(cx,h,cx,0);beam.addColorStop(0,`rgba(255,205,45,${.18+rank*.07})`);beam.addColorStop(1,'rgba(255,245,176,0)');ctx.fillStyle=beam;ctx.beginPath();ctx.moveTo(cx-w*.09,h);ctx.lineTo(cx-w*.025,0);ctx.lineTo(cx+w*.025,0);ctx.lineTo(cx+w*.09,h);ctx.fill();}}
    const rings=reduced?1:1+Math.min(3,rank);for(let i=0;i<rings;i++){const p=(age-i*.11)/(.72+i*.08);if(p<=0||p>=1)continue;ctx.strokeStyle=rank>=3?`hsla(${(t*110+i*85)%360},100%,72%,${1-p})`:`rgba(255,218,72,${1-p})`;ctx.lineWidth=(10-rank)*(1-p)+2;ctx.shadowColor=rank>=3?'#ff65e8':'#ffd63c';ctx.shadowBlur=22;ctx.beginPath();ctx.arc(x,y,p*Math.max(w,h)*.62,0,TAU);ctx.stroke();}
    const total=reduced?8:Math.min(particles.length,18+rank*13);for(let i=0;i<total;i++){const p=particles[i],phase=(age+p.delay*.35)%1.15,px=(p.x*w+Math.sin(t*p.speed+p.angle)*35+w)%w,py=(p.y*h-phase*h*.7+h)%h,size=(2+p.size)*(1+(i%4===0));const hue=rank>=3?(i*47+t*75)%360:i%4===0?48:i%4===1?190:i%4===2?325:0;sparkle(ctx,px,py,size,`hsl(${hue} 100% 76%)`,Math.max(0,.95-phase*.58)*power);}
    if(age>.22&&age<.72){const p=(age-.22)/.5;ctx.save();ctx.translate(x,y);ctx.rotate(-.42);ctx.fillStyle=`rgba(255,255,225,${Math.sin(p*Math.PI)*(.55+rank*.08)})`;ctx.shadowColor=rank>=3?'#ff6be8':'#fff09b';ctx.shadowBlur=22;ctx.fillRect(-w*.75+p*w*1.5,-2,w*.48,4);ctx.restore();}
    ctx.restore();
  }
  function stop(clear=false) { if(frameId) cancelAnimationFrame(frameId); frameId=0; running=false; resumeAnimation=null; if(activeCanvas)activeCanvas.dataset.fxState='stopped'; if(clear&&activeCanvas){ const ctx=activeCanvas.getContext('2d'); ctx?.clearRect(0,0,activeCanvas.width,activeCanvas.height); } activeCanvas=null; }
  document.addEventListener('visibilitychange',()=>{if(!document.hidden&&resumeAnimation){const resume=resumeAnimation;resumeAnimation=null;resume();}});
  window.ChokinCanvasFX = {start,stop,isRunning:()=>running};
})();
