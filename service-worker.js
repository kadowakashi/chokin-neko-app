const SHELL_CACHE = 'chokin-v100-shell-r7';
const RUNTIME_CACHE = 'chokin-v100-runtime-assets-r1';

const SHELL_ASSETS = [
  './', './index.html', './favicon.svg', './manifest.webmanifest',
  './icons/icon-192.png', './icons/icon-512.png', './icons/icon-maskable-512.png', './icons/apple-touch-icon.png',
  './styles.css', './fixes.css', './v021-quick.css', './v03-scenes.css', './v04-canvas.css', './v05-fever.css',
  './v05-controls.css', './v051-polish.css', './v06-cats.css', './v08-collection.css', './v092-save-spectacle.css',
  './v093-assets.css', './v097-calendar.css', './v098-goal.css', './v099-goal-history.css', './v0910-badges.css',
  './v0911-restore-preview.css', './v0912-onboarding.css', './v0913-daily-note.css', './v0916-capsule-gacha.css',
  './visual-assets.js', './cat-image-processor.js', './onboarding.js', './gacha-transaction.js', './cat-collection.js',
  './cat-coins.js', './daily-note.js', './cat-characters.js', './game-effects.js', './asset-loader.js',
  './canvas-effects.js', './capsule-gacha-animation.js', './goal-history.js', './savings-goal.js', './badges.js',
  './restore-preview.js', './app.js', './assets/manifest.json', './assets/cats/cat-catalog.json'
];

const scopeUrl = new URL('./', self.registration.scope);
const shellUrls = new Set(SHELL_ASSETS.map(path => {
  const url = new URL(path, scopeUrl);
  url.search = '';
  url.hash = '';
  return url.href;
}));

function normalizedUrl(input) {
  const url = new URL(input);
  url.search = '';
  url.hash = '';
  return url.href;
}

function isInScope(url) {
  return url.origin === scopeUrl.origin && url.pathname.startsWith(scopeUrl.pathname);
}

function isRuntimeAsset(url) {
  return isInScope(url) && url.pathname.startsWith(`${scopeUrl.pathname}assets/`);
}

async function cacheSuccessfulResponse(cacheName, request, response) {
  if (response && response.ok && response.status === 200) {
    try {
      const cache = await caches.open(cacheName);
      await cache.put(request, response.clone());
    } catch {
      // A runtime cache quota error must not hide an otherwise usable response.
    }
  }
  return response;
}

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    try {
      const shell = await caches.open(SHELL_CACHE);
      await shell.addAll(SHELL_ASSETS);
    } catch (error) {
      await caches.delete(SHELL_CACHE);
      throw error;
    }
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keep = new Set([SHELL_CACHE, RUNTIME_CACHE]);
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith('chokin-') && !keep.has(key)).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET' || request.headers.has('range')) return;

  const url = new URL(request.url);
  if (!isInScope(url)) return;

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        return await fetch(request);
      } catch {
        return (await caches.match('./index.html', { cacheName: SHELL_CACHE, ignoreSearch: true })) || Response.error();
      }
    })());
    return;
  }

  if (shellUrls.has(normalizedUrl(request.url))) {
    event.respondWith((async () => {
      const cached = await caches.match(request, { cacheName: SHELL_CACHE, ignoreSearch: true });
      if (cached) return cached;
      const response = await fetch(request);
      return cacheSuccessfulResponse(SHELL_CACHE, request, response);
    })());
    return;
  }

  if (isRuntimeAsset(url)) {
    event.respondWith((async () => {
      const cached = await caches.match(request, { cacheName: RUNTIME_CACHE, ignoreSearch: true });
      if (cached) return cached;
      const response = await fetch(request);
      return cacheSuccessfulResponse(RUNTIME_CACHE, request, response);
    })());
  }
});
