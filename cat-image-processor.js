(() => {
  'use strict';
  const MAX_SIZE = 640;
  const cache = new Map();
  const objectUrls = new Set();
  const diagnostics = {};
  const jobs = [];
  let activeJobs = 0;
  const catPath = source => /(?:^|\/)assets\/cats\/[^/?#]+\.(?:png|webp)(?:[?#].*)?$/i.test(String(source || ''));
  const treasurePath = source => /(?:^|\/)assets\/scenes\/treasure_chest_(?:closed|open)\.(?:png|webp)(?:[?#].*)?$/i.test(String(source || ''));
  const necessaryPath = source => /(?:^|\/)assets\/scenes\/necessary_expense_stamp_cat\.(?:png|webp)(?:[?#].*)?$/i.test(String(source || ''));
  const processablePath = source => catPath(source) || treasurePath(source) || necessaryPath(source);
  const absolute = source => new URL(source, document.baseURI).href;
  const distance = (r, g, b, color) => Math.hypot(r - color[0], g - color[1], b - color[2]);

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
    await image.decode();
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

  async function processElement(image, sourceOverride = null) {
    const currentSource = image.getAttribute('src');
    const source = sourceOverride || (processablePath(currentSource) ? currentSource : image.dataset.catOriginal || currentSource);
    if (!processablePath(source)) return false;
    const key = absolute(source);
    if (image.dataset.catImageState === 'processed' && image.dataset.catOriginal === key) return true;
    if (image.dataset.catImageState === 'pending' && image.dataset.catOriginal === key) return false;
    image.dataset.catOriginal = key;
    setImageState(image, 'pending');
    try {
      const url = await processedUrl(key);
      if (!url) {
        await image.decode();
        setImageState(image, 'source');
        return true;
      }
      image.src = url;
      await image.decode();
      if (diagnostics[key]) image.dataset.catRemovedRatio = String(diagnostics[key].removedRatio);
      image.classList.add('cat-image-processed');
      setImageState(image, 'processed');
      return true;
    } catch {
      setImageState(image, 'fallback');
      return false;
    }
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
