const CACHE='chokin-v093-catcoin1';
const ASSETS=['./','./index.html','./favicon.svg','./icons/icon-192.png','./icons/icon-512.png','./icons/icon-maskable-512.png','./icons/apple-touch-icon.png','./styles.css','./fixes.css','./v021-quick.css','./v03-scenes.css','./v04-canvas.css','./v05-fever.css','./v05-controls.css','./v051-polish.css','./v06-cats.css','./v08-collection.css','./v092-save-spectacle.css','./v093-assets.css','./visual-assets.js','./cat-image-processor.js','./cat-collection.js','./cat-coins.js','./cat-characters.js','./game-effects.js','./asset-loader.js','./canvas-effects.js','./app.js','./assets/manifest.json','./assets/cats/cat-catalog.json','./assets/coins/cat_coin.png','./manifest.webmanifest'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS))));
self.addEventListener('activate',event=>event.waitUntil(Promise.all([caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('chokin-')&&key!==CACHE).map(key=>caches.delete(key)))),self.clients.claim()])));
self.addEventListener('message',event=>{if(event.data?.type==='SKIP_WAITING')self.skipWaiting();});
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  const url=new URL(event.request.url),isCatImage=url.pathname.includes('/assets/cats/')&&/\.(png|webp)$/i.test(url.pathname),isCatData=url.pathname.endsWith('/cat-characters.js')||url.pathname.endsWith('/cat-catalog.json'),isAsset=url.pathname.includes('/assets/');
  if(isCatData){event.respondWith(fetch(event.request).then(response=>{if(response.ok)caches.open(CACHE).then(cache=>cache.put(event.request,response.clone()));return response;}).catch(()=>caches.match(event.request,{ignoreSearch:true})));return;}
  if(isCatImage){event.respondWith(caches.match(event.request,{ignoreSearch:true}).then(cached=>{const refresh=fetch(event.request).then(response=>{if(response.ok)caches.open(CACHE).then(cache=>cache.put(event.request,response.clone()));return response;}).catch(()=>cached);return cached||refresh;}));return;}
  if(isAsset){event.respondWith(fetch(event.request).then(response=>{if(response.ok)caches.open(CACHE).then(cache=>cache.put(event.request,response.clone()));return response;}).catch(()=>caches.match(event.request,{ignoreSearch:true})));return;}
  event.respondWith(caches.match(event.request,{ignoreSearch:true}).then(cached=>cached||fetch(event.request).then(response=>response.ok?response:Promise.reject(new Error(`HTTP ${response.status}`))).catch(()=>event.request.mode==='navigate'?caches.match('./index.html'):undefined)));
});
