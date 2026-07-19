(() => {
  'use strict';
  const MAX_SIZE = 640;
  const IMAGE_LOAD_TIMEOUT_MS = 8000;
  const cache = new Map();
  const objectUrls = new Set();
  const processingTokens = new WeakMap();
  const processedWarnings = new Set();
  const sourceErrors = new Set();
  const diagnostics = {};
  const jobs = [];
  let activeJobs = 0;
  const catPath = source => /(?:^|\/)assets\/cats\/[^/?#]+\.(?:png|webp)(?:[?#].*)?$/i.test(String(source || ''));
  const treasurePath = source => /(?:^|\/)assets\/scenes\/treasure_chest_(?:closed|open)\.(?:png|webp)(?:[?#].*)?$/i.test(String(source || ''));
  const necessaryPath = source => /(?:^|\/)assets\/scenes\/necessary_expense_stamp_cat\.(?:png|webp)(?:[?#].*)?$/i.test(String(source || ''));
  const processablePath = source => catPath(source) || treasurePath(source) || necessaryPath(source);
  const absolute = source => new URL(source, document.baseURI).href;
  const distance = (r, g, b, color) => Math.hypot(r - color[0], g - color[1], b - color[2]);
  const renderable = image => image.complete && image.naturalWidth > 0 && image.naturalHeight > 0;
  const safeLabel = source => {
    try {
      const parts = new URL(source, document.baseURI).pathname.split('/').filter(Boolean);
      return parts.slice(-3).join('/');
    } catch { return 'cat-image'; }
  };

  function warnProcessedOnce(source) {
    if (processedWarnings.has(source)) return;
    processedWarnings.add(source);
    console.warn(`[CatImageProcessor] Processed image failed; using source image: ${safeLabel(source)}`);
  }

  function reportSourceFailureOnce(source) {
    if (sourceErrors.has(source)) return;
    sourceErrors.add(source);
    console.error(`[CatImageProcessor] Source image failed; using fallback: ${safeLabel(source)}`);
  }

  function estimateBackground(data, width, height) {
    const samples = [], step = Math.max(1, Math.floor(Math.min(width, height) / 160));
    const add = index => {
      const offset = index * 4;
      if (data[offset + 3] > 180) samples.push([data[offset], data[offset + 1], data[offset + 2]]);
    };
    for (let x = 0; x < width; x += step) { add(x); add((height - 1) * width + x); }
    for (let y = 0; y < height; y += step) { add(y * width); add(y * width + width - 1); }
    if (samples.length < 16) return null;
    const luminance = color => color[0] * .299 + color[1] * .587 + color[2] * .114;
    let centers = [
      [...samples.reduce((best, color) => luminance(color) < luminance(best) ? color : best)],
      [...samples.reduce((best, color) => luminance(color) > luminance(best) ? color : best)]
    ];
    for (let iteration = 0; iteration < 7; iteration++) {
      const sums = [[0, 0, 0, 0], [0, 0, 0, 0]];
      for (const color of samples) {
        const group = distance(...color, centers[0]) <= distance(...color, centers[1]) ? 0 : 1;
        sums[group][0] += color[0]; sums[group][1] += color[1]; sums[group][2] += color[2]; sums[group][3]++;
      }
      centers = centers.map((center, index) => sums[index][3] ? sums[index].slice(0, 3).map(value => value / sums[index][3]) : center);
    }
    const deviation = Math.sqrt(samples.reduce((sum, color) => sum + Math.min(distance(...color, centers[0]), distance(...color, centers[1])) ** 2, 0) / samples.length);
    return {centers, threshold: Math.max(18, Math.min(36, 12 + deviation * 2.4))};
  }

  async function createProcessedUrl(source) {
    const image = new Image();
    image.decoding = 'async';
    image.src = source;
    if (!await waitForImage(image, () => true)) throw new Error('Source image is not available for processing');
    const scale = Math.min(1, MAX_SIZE / Math.max(image.naturalWidth, image.naturalHeight));
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width; canvas.height = height;
    const context = canvas.getContext('2d', {willReadFrequently: true});
    if (!context) return null;
    context.drawImage(image, 0, 0, width, height);
    const frame = context.getImageData(0, 0, width, height), data = frame.data;
    const background = estimateBackground(data, width, height);
    if (!background) return null;
    const visited = new Uint8Array(width * height), queue = new Int32Array(width * height);
    let head = 0, tail = 0, removed = 0;
    const isBackground = index => {
      const offset = index * 4, alpha = data[offset + 3];
      if (alpha < 24) return true;
      return Math.min(
        distance(data[offset], data[offset + 1], data[offset + 2], background.centers[0]),
        distance(data[offset], data[offset + 1], data[offset + 2], background.centers[1])
      ) <= background.threshold;
    };
    const push = index => {
      if (index >= 0 && index < visited.length && !visited[index] && isBackground(index)) {
        visited[index] = 1; queue[tail++] = index;
      }
    };
    for (let x = 0; x < width; x++) { push(x); push((height - 1) * width + x); }
    for (let y = 0; y < height; y++) { push(y * width); push(y * width + width - 1); }
    while (head < tail) {
      const index = queue[head++], x = index % width;
      data[index * 4 + 3] = 0; removed++;
      if (x > 0) push(index - 1);
      if (x < width - 1) push(index + 1);
      if (index >= width) push(index - width);
      if (index < width * (height - 1)) push(index + width);
    }
    if (removed < width * height * .02) return null;
    diagnostics[source] = Object.freeze({
      width, height,
      removedRatio: Number((removed / (width * height)).toFixed(4)),
      threshold: Number(background.threshold.toFixed(2))
    });
    context.putImageData(frame, 0, 0);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    if (!blob) return null;
    const url = URL.createObjectURL(blob);
    objectUrls.add(url);
    return url;
  }

  function enqueue(task) {
    return new Promise((resolve, reject) => {
      jobs.push({task, resolve, reject});
      const run = () => {
        while (activeJobs < 2 && jobs.length) {
          const job = jobs.shift();
          activeJobs++;
          Promise.resolve().then(job.task).then(job.resolve, job.reject).finally(() => { activeJobs--; run(); });
        }
      };
      run();
    });
  }

  function processedUrl(source) {
    const key = absolute(source);
    if (!cache.has(key)) {
      const pending = enqueue(() => createProcessedUrl(key)).then(result => {
        if (!result) cache.delete(key);
        return result;
      }, () => { cache.delete(key); return null; });
      cache.set(key, pending);
    }
    return cache.get(key);
  }

  const fallbackFor = image => {
    const sibling = image.previousElementSibling;
    return sibling && sibling.matches('[class*="fallback"],.cat-image-placeholder') ? sibling : null;
  };
  function setImageState(image, state) {
    const fallback = fallbackFor(image), ready = state === 'processed' || state === 'source';
    image.dataset.catImageState = state;
    image.classList.toggle('cat-image-loading', state === 'pending');
    image.classList.toggle('cat-image-ready', ready);
    image.hidden = state === 'fallback';
    if (fallback) fallback.hidden = ready;
  }

  function waitForImage(image, isCurrent) {
    if (renderable(image)) return Promise.resolve(true);
    if (image.complete) return Promise.resolve(false);
    return new Promise(resolve => {
      let settled = false;
      const cleanup = () => {
        image.removeEventListener('load', onLoad);
        image.removeEventListener('error', onError);
        clearTimeout(timer);
      };
      const settle = result => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(Boolean(result && isCurrent()));
      };
      const onLoad = () => settle(renderable(image));
      const onError = () => settle(false);
      const timer = setTimeout(() => settle(renderable(image)), IMAGE_LOAD_TIMEOUT_MS);
      image.addEventListener('load', onLoad, {once: true});
      image.addEventListener('error', onError, {once: true});
      if (renderable(image) || image.complete) {
        settle(renderable(image));
      } else if (typeof image.decode === 'function') {
        Promise.resolve().then(() => image.decode()).then(
          () => { if (renderable(image) || image.complete) settle(renderable(image)); },
          () => { if (renderable(image) || image.complete) settle(renderable(image)); }
        );
      }
    });
  }

  async function imageIsAvailable(image, isCurrent) {
    if (renderable(image)) return true;
    if (!isCurrent()) return false;
    return waitForImage(image, isCurrent);
  }

  async function useSourceImage(image, source, isCurrent) {
    if (!isCurrent()) return false;
    image.classList.remove('cat-image-processed');
    if (image.getAttribute('src') !== source) image.src = source;
    const available = await imageIsAvailable(image, isCurrent);
    if (!isCurrent()) return false;
    if (available) {
      setImageState(image, 'source');
      return true;
    }
    reportSourceFailureOnce(source);
    setImageState(image, 'fallback');
    return false;
  }

  async function processElement(image, sourceOverride = null) {
    const currentSource = image.getAttribute('src');
    const source = sourceOverride || (processablePath(currentSource) ? currentSource : image.dataset.catOriginal || currentSource);
    if (!processablePath(source)) return false;
    const key = absolute(source);
    if (['processed', 'source'].includes(image.dataset.catImageState) && image.dataset.catOriginal === key) return true;
    if (image.dataset.catImageState === 'pending' && image.dataset.catOriginal === key) return false;
    const token = (processingTokens.get(image) || 0) + 1;
    const beganConnected = image.isConnected;
    processingTokens.set(image, token);
    const isCurrent = () => processingTokens.get(image) === token && (!beganConnected || image.isConnected);
    image.dataset.catOriginal = key;
    const currentIsSource = processablePath(currentSource) && absolute(currentSource) === key;
    if (currentIsSource && renderable(image)) {
      setImageState(image, 'source');
    } else {
      setImageState(image, 'pending');
      if (currentIsSource) {
        imageIsAvailable(image, isCurrent).then(available => {
          if (!available || !isCurrent() || image.dataset.catImageState !== 'pending') return;
          const displayedSource = image.getAttribute('src');
          if (processablePath(displayedSource) && absolute(displayedSource) === key) setImageState(image, 'source');
        });
      }
    }
    const url = await processedUrl(key);
    if (!isCurrent()) return false;
    if (!url) {
      warnProcessedOnce(key);
      return useSourceImage(image, key, isCurrent);
    }
    image.src = url;
    const available = await imageIsAvailable(image, isCurrent);
    if (!isCurrent()) return false;
    if (!available) {
      warnProcessedOnce(key);
      return useSourceImage(image, key, isCurrent);
    }
    if (diagnostics[key]) image.dataset.catRemovedRatio = String(diagnostics[key].removedRatio);
    image.classList.add('cat-image-processed');
    setImageState(image, 'processed');
    return true;
  }

  function scan(root) {
    if (root instanceof HTMLImageElement) processElement(root);
    root.querySelectorAll?.('img').forEach(image => processElement(image));
  }
  const observer = new MutationObserver(records => {
    for (const record of records) {
      if (record.type === 'attributes') processElement(record.target);
      else record.addedNodes.forEach(node => node.nodeType === Node.ELEMENT_NODE && scan(node));
    }
  });
  observer.observe(document.documentElement, {subtree: true, childList: true, attributes: true, attributeFilter: ['src']});
  scan(document);
  addEventListener('pagehide', () => objectUrls.forEach(url => URL.revokeObjectURL(url)), {once: true});
  window.ChokinCatImages = {processElement, isCatSource: catPath, isProcessableSource: processablePath, diagnostics};
})();
