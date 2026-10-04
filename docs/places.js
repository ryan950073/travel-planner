/* Google Maps links and freely licensed, exact-page Wikimedia place photos. */
window.TravelPlaces = (() => {
  const modes = new Set(['transit', 'walking', 'driving', 'bicycling']);
  const cache = new Map();
  let active = 0;
  const queue = [];
  function queued(task) {
    return new Promise((resolve, reject) => { queue.push({ task, resolve, reject }); drain(); });
  }
  function drain() {
    while (active < 3 && queue.length) {
      const job = queue.shift(); active++;
      Promise.resolve().then(job.task).then(job.resolve, job.reject).finally(() => { active--; drain(); });
    }
  }
  function node(tag, className, text = '') {
    const el = document.createElement(tag); el.className = className; el.textContent = text; return el;
  }
  function placeQuery(item, destination) {
    return item.address?.trim() || [destination?.trim(), item.placeName?.trim() || item.title?.trim()].filter(Boolean).join(' ');
  }
  function mapURL(action, query, mode, origin) {
    const url = new URL(`https://www.google.com/maps/${action === 'search' ? 'search' : 'dir'}/`);
    url.searchParams.set('api', '1');
    if (action === 'search') url.searchParams.set('query', query);
    else {
      url.searchParams.set('destination', query);
      url.searchParams.set('travelmode', modes.has(mode) ? mode : 'transit');
      if (origin) url.searchParams.set('origin', origin);
    }
    return url.href;
  }
  function link(text, href, className) {
    const el = node('a', className, text); el.href = href; el.target = '_blank'; el.rel = 'noopener noreferrer'; el.referrerPolicy = 'no-referrer'; return el;
  }
  function safeURL(value, hosts) {
    try { const u = new URL(value); return u.protocol === 'https:' && !u.username && !u.password && hosts.includes(u.hostname) ? u.href : null; }
    catch { return null; }
  }
  async function wiki(language, parameters) {
    const url = new URL(`https://${language}.wikipedia.org/w/api.php`);
    url.search = new URLSearchParams({ action: 'query', format: 'json', formatversion: '2', origin: '*', ...parameters });
    const response = await fetch(url, { headers: { 'Api-User-Agent': 'TravelPlanner/1.0 (https://github.com/ryan950073/travel-planner)' }, credentials: 'omit', referrerPolicy: 'no-referrer', signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw new Error('圖片服務暫時無法使用');
    const data = await response.json(); if (data.error) throw new Error('圖片服務暫時無法使用'); return data;
  }
  function plain(value) {
    return new DOMParser().parseFromString(value || '', 'text/html').body.textContent.trim();
  }
  async function hasCoordinates(page) {
    if (page.coordinates?.length) return true;
    const entity = page.pageprops?.wikibase_item;
    if (!/^Q\d+$/.test(entity || '')) return false;
    const url = new URL('https://www.wikidata.org/w/api.php');
    url.search = new URLSearchParams({ action: 'wbgetclaims', entity, property: 'P625', format: 'json', origin: '*' });
    const response = await fetch(url, { headers: { 'Api-User-Agent': 'TravelPlanner/1.0 (https://github.com/ryan950073/travel-planner)' }, credentials: 'omit', referrerPolicy: 'no-referrer', signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw new Error('無法確認地點資訊');
    const data = await response.json();
    return data.claims?.P625?.some(claim => {
      const value = claim.mainsnak?.datavalue?.value;
      return claim.rank !== 'deprecated' && Number.isFinite(value?.latitude) && Number.isFinite(value?.longitude);
    }) || false;
  }
  async function lookup(name) {
    let failed = false;
    // Titles and redirects only: never choose a loosely matching search result.
    for (const language of ['zh', 'en', 'ja']) {
      try {
        const data = await wiki(language, { titles: name, redirects: '1', converttitles: '1', prop: 'pageimages|coordinates|pageprops', piprop: 'thumbnail|name', pithumbsize: '640', pilicense: 'free' });
        const page = data.query?.pages?.[0];
        if (!page || page.missing || Object.hasOwn(page.pageprops || {}, 'disambiguation') || !page.thumbnail || !page.pageimage) continue;
        if (!await hasCoordinates(page)) continue;
        const imageURL = safeURL(page.thumbnail.source, ['upload.wikimedia.org', 'thumb.wikimedia.org']); if (!imageURL) continue;
        const details = await wiki(language, { titles: `File:${page.pageimage}`, prop: 'imageinfo', iiprop: 'url|extmetadata' });
        const info = details.query?.pages?.[0]?.imageinfo?.[0], meta = info?.extmetadata || {};
        const source = safeURL(info?.descriptionurl, ['commons.wikimedia.org', `${language}.wikipedia.org`]);
        const license = plain(meta.LicenseShortName?.value), author = plain(meta.Artist?.value);
        // Show only images with a known reusable license and complete attribution.
        if (!source || !author || !/^(CC BY(?:-SA)? [1-4]\.\d|CC0(?:.*)?|Public domain)$/i.test(license)) continue;
        return { url: imageURL, source, title: page.title, author, license };
      } catch { failed = true; }
    }
    if (failed) throw new Error('圖片服務暫時無法連線');
    return null;
  }
  function getPhoto(name) {
    if (!name || name.length > 120 || /[|\n]/.test(name)) return Promise.resolve(null);
    if (!cache.has(name)) cache.set(name, queued(() => lookup(name)).catch(error => { cache.delete(name); throw error; }));
    return cache.get(name);
  }
  async function loadPhoto(container, name) {
    container.replaceChildren(node('p', 'place-photo-status', '正在尋找景點圖片…'));
    try {
      const photo = await getPhoto(name); if (!container.isConnected) return;
      container.replaceChildren();
      if (!photo) { container.append(node('p', 'place-photo-status', '尚無相符圖片；可編輯「地點名稱」使用正式景點名稱。')); return; }
      const figure = node('figure', 'place-photo'), img = document.createElement('img');
      img.alt = `${photo.title}的參考圖片`; img.loading = 'lazy'; img.decoding = 'async'; img.referrerPolicy = 'no-referrer';
      img.addEventListener('error', () => { figure.replaceChildren(node('p', 'place-photo-status', '圖片暫時無法顯示；地圖連結仍可使用。')); }, { once: true });
      img.src = photo.url;
      const caption = node('figcaption', '');
      caption.append(link(`${photo.title} · ${photo.author} · ${photo.license}`, photo.source, 'photo-credit'), node('span', '', '來源：Wikipedia / Wikimedia · 縮圖／裁切'));
      figure.append(img, caption); container.append(figure);
    } catch {
      if (!container.isConnected) return;
      container.replaceChildren(node('p', 'place-photo-status', '暫時無法取得圖片，地圖連結仍可使用。'));
      const retry = node('button', 'photo-retry', '重試圖片'); retry.type = 'button'; retry.addEventListener('click', () => loadPhoto(container, name)); container.append(retry);
    }
  }
  function render(item, destination, mode, previousItem) {
    const box = node('div', 'place-details'), query = placeQuery(item, destination);
    if (!query) return box;
    if (item.placeName || item.address) box.append(node('p', 'place-address', [item.placeName, item.address].filter(Boolean).join(' · ')));
    const links = node('div', 'map-links');
    links.append(link('Google 地圖 ↗', mapURL('search', query), 'map-link'), link('從目前位置出發 ↗', mapURL('directions', query, mode), 'map-link'));
    if (previousItem) {
      const route = mapURL('directions', query, mode, placeQuery(previousItem, destination));
      if (route.length <= 2048) links.append(link('從上一站出發 ↗', route, 'map-link'));
      else links.append(node('span', 'place-photo-status', '地點文字過長；請縮短地址或使用座標後查詢上一站路線。'));
    }
    box.append(links);
    if (item.showPhoto !== false) {
      const photo = node('div', 'place-photo-container'); box.append(photo);
      // Wait until renderItems has attached this card to the page.
      queueMicrotask(() => { if (photo.isConnected) loadPhoto(photo, item.placeName?.trim() || item.title?.trim()); });
    }
    return box;
  }
  return { render, mapURL, placeQuery };
})();
