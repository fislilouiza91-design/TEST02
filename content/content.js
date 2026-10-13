/* ============================================
   Smart Shopper - Content Script
   Self-fetch from current domain (fix .us/.com)
   ============================================ */
(function () {
  'use strict';
  if (window.__smartShopper) return;
  window.__smartShopper = true;

  const PANEL_ID = 'ss-panel';
  const BATCH_SIZE = 15;
  const ESTIMATED_SEARCH_TIME = 10000;
  const MAX_PAGES = 6;
  const PARALLEL_BATCH = 2;
  const DELAY_BETWEEN_BATCHES = 800;
  const MAX_RETRIES = 3;

  const T = (key) => (window.SS_I18N ? window.SS_I18N.t(key) : key);

  let currentKey = '';
  let cachedItems = [];
  let cachedSortedItems = [];
  let cachedSearchUrl = '';
  let activeTab = 0;
  let closed = false;
  let renderedCount = 0;
  let imageObserver = null;
  let isLoadingMore = false;
  let searchComplete = false;
  let searchStartTime = 0;
  let pendingTabEl = null;
  let pendingInterval = null;

  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = s => { const m = String(s || '').replace(/,/g, '').match(/(\d+(?:\.\d+)?)/); return m ? parseFloat(m[1]) : 0; };
  const soldNum = s => { const t = String(s || '').toLowerCase().replace(/,/g, ''); const m = t.match(/(\d+(?:\.\d+)?)\s*(k)?/); if (!m) return 0; let v = parseFloat(m[1]); if (m[2]) v *= 1000; return v; };
  const discNum = s => num(String(s || '').replace('-', ''));

  function stars(rating) {
    const r = parseFloat(rating) || 0;
    const full = Math.floor(r);
    const half = (r - full) >= 0.5;
    let out = '';
    for (let i = 0; i < 5; i++) {
      if (i < full) out += '★';
      else if (i === full && half) out += '★';
      else out += '☆';
    }
    return out;
  }

  function isProductPage() {
    return /aliexpress\.(com|us)\/(item|i)\/\d+/i.test(location.href);
  }

  function detectProduct() {
    if (!isProductPage()) return null;

    try {
      const scripts = document.querySelectorAll('script[type="application/ld+json"]');
      for (const sc of scripts) {
        const data = JSON.parse(sc.textContent);
        const arr = Array.isArray(data) ? data : [data];
        for (const node of arr) {
          const g = n => {
            if (!n) return null;
            if (n['@type'] === 'Product') return n;
            if (Array.isArray(n)) { for (const x of n) { const r = g(x); if (r) return r; } }
            if (n['@graph']) { const r = g(n['@graph']); if (r) return r; }
            return null;
          };
          const p = g(node);
          if (p && p.name) return { title: String(p.name).slice(0, 160) };
        }
      }
    } catch (e) {}

    const ogTitle = document.querySelector('meta[property="og:title"]');
    if (ogTitle && ogTitle.content && ogTitle.content.trim().length > 8) {
      return { title: ogTitle.content.trim().slice(0, 160) };
    }

    const title = (document.title || '').replace(/[|\-–—].*$/, '').trim();
    if (title.length > 8) return { title: title.slice(0, 160) };

    return null;
  }

  function buildPanel() {
    if (document.getElementById(PANEL_ID)) return;
    const panel = document.createElement('div');
    panel.id = PANEL_ID;
    panel.innerHTML = `
      <div class="ss-header" id="ss-header">
        <div class="ss-logo">S</div>
        <div class="ss-titles">
          <div class="ss-title">${esc(T('panelTitle'))}</div>
          <div class="ss-sub">${esc(T('panelSubtitle'))}</div>
        </div>
        <div class="ss-header-btns">
          <button class="ss-hbtn" id="ss-refresh" title="${esc(T('refresh'))}">⟳</button>
          <button class="ss-hbtn" id="ss-minimize" title="${esc(T('minimize'))}">–</button>
          <button class="ss-hbtn" id="ss-close" title="${esc(T('close'))}">✕</button>
        </div>
      </div>
      <div class="ss-body" id="ss-body">
        <div class="ss-tabs" id="ss-tabs">
          <span class="ss-tab active" data-i="0">${esc(T('tabAll'))}</span>
          <span class="ss-tab" data-i="1">${esc(T('tabCheapest'))}</span>
          <span class="ss-tab" data-i="2">${esc(T('tabBestRated'))}</span>
          <span class="ss-tab" data-i="3">${esc(T('tabBestDiscount'))}</span>
          <span class="ss-tab" data-i="4">${esc(T('tabBestSelling'))}</span>
        </div>
        <div class="ss-list" id="ss-list"></div>
        <div class="ss-footer" id="ss-footer"></div>
      </div>`;
    document.documentElement.appendChild(panel);

    document.getElementById('ss-close').onclick = () => { closed = true; panel.remove(); };
    document.getElementById('ss-minimize').onclick = () => {
      const b = document.getElementById('ss-body');
      b.style.display = b.style.display === 'none' ? '' : 'none';
    };
    document.getElementById('ss-refresh').onclick = () => { closed = false; currentKey = ''; scan(); };
    document.getElementById('ss-tabs').addEventListener('click', onTabClick);
    document.getElementById('ss-list').addEventListener('scroll', onScroll, { passive: true });
    makeDraggable(panel, document.getElementById('ss-header'));
  }

  function onTabClick(e) {
    const t = e.target.closest('.ss-tab');
    if (!t) return;
    const newTab = +t.dataset.i;
    if (newTab === activeTab && !t.classList.contains('ss-tab-counting')) return;
    if (searchComplete) {
      activateTab(t, newTab);
    } else {
      if (pendingTabEl && pendingTabEl !== t) restoreTab(pendingTabEl);
      pendingTabEl = t;
      startPendingCountdown(t);
    }
  }

  function activateTab(t, newTab) {
    if (pendingInterval) { clearInterval(pendingInterval); pendingInterval = null; }
    if (pendingTabEl) { restoreTab(pendingTabEl); pendingTabEl = null; }
    activeTab = newTab;
    document.querySelectorAll('.ss-tab').forEach(x => x.classList.toggle('active', x === t));
    cachedSortedItems = [];
    renderedCount = 0;
    renderList(true);
  }

  function restoreTab(t) {
    if (t.dataset.originalText) {
      t.textContent = t.dataset.originalText;
      delete t.dataset.originalText;
    }
    t.classList.remove('ss-tab-counting');
  }

  function startPendingCountdown(tabEl) {
    if (!tabEl.dataset.originalText) tabEl.dataset.originalText = tabEl.textContent;
    tabEl.classList.add('ss-tab-counting');
    const updateCountdown = () => {
      if (searchComplete) { activateTab(tabEl, +tabEl.dataset.i); return; }
      const elapsed = Date.now() - searchStartTime;
      const remaining = Math.max(1, Math.ceil((ESTIMATED_SEARCH_TIME - elapsed) / 1000));
      tabEl.textContent = `⏳ ${remaining}s`;
    };
    updateCountdown();
    if (pendingInterval) clearInterval(pendingInterval);
    pendingInterval = setInterval(updateCountdown, 1000);
  }

  function onScroll(e) {
    if (isLoadingMore) return;
    const list = e.target;
    if (list.scrollTop + list.clientHeight >= list.scrollHeight - 400) loadMore();
  }

  function loadMore() {
    if (renderedCount >= cachedSortedItems.length) return;
    isLoadingMore = true;
    requestAnimationFrame(() => { renderList(false); isLoadingMore = false; });
  }

  function makeDraggable(el, handle) {
    let sx = 0, sy = 0, ox = 0, oy = 0, drag = false;
    handle.addEventListener('mousedown', e => {
      if (e.target.closest('button')) return;
      drag = true; sx = e.clientX; sy = e.clientY;
      const r = el.getBoundingClientRect(); ox = r.left; oy = r.top;
      el.style.right = 'auto'; el.style.left = ox + 'px'; el.style.top = oy + 'px'; el.style.bottom = 'auto';
      e.preventDefault();
    });
    window.addEventListener('mousemove', e => {
      if (!drag) return;
      el.style.left = Math.max(0, ox + e.clientX - sx) + 'px';
      el.style.top = Math.max(0, oy + e.clientY - sy) + 'px';
    });
    window.addEventListener('mouseup', () => drag = false);
  }

  function skeleton() {
    const l = document.getElementById('ss-list'); if (!l) return;
    l.innerHTML = Array.from({ length: 6 }, () =>
      `<div class="ss-card"><div class="ss-thumb-wrapper skel"></div><div class="ss-card-content"><div class="skel line"></div><div class="skel line short"></div></div><div class="ss-discount-box skel"></div></div>`).join('');
  }

  function message(msg) {
    const l = document.getElementById('ss-list'); if (!l) return;
    l.innerHTML = `<div class="ss-msg"><div class="ss-msg-icon">🔍</div>${esc(msg)}</div>`;
  }

  function applySort() {
    if (activeTab === 0) { cachedSortedItems = [...cachedItems]; return; }
    const sorters = [
      null,
      (a, b) => num(a.price) - num(b.price) || soldNum(b.sold) - soldNum(a.sold),
      (a, b) => num(b.rating) - num(a.rating) || num(a.price) - num(b.price),
      (a, b) => discNum(b.discount) - discNum(a.discount),
      (a, b) => soldNum(b.sold) - soldNum(a.sold)
    ];
    cachedSortedItems = [...cachedItems].sort(sorters[activeTab] || sorters[1]);
  }

  function buildCard(it, i) {
    const discountValue = it.discount ? String(it.discount).replace('-', '').replace('%', '') : '';
    let discountBoxHtml = '';
    if (discountValue) {
      discountBoxHtml = `
        <div class="ss-discount-box">
          <div class="ss-price-main">${it.price ? esc(it.price) : '—'}</div>
          <div class="ss-discount-label">-${esc(discountValue)}%</div>
        </div>`;
    } else {
      discountBoxHtml = `
        <div class="ss-discount-box ss-no-discount">
          <div class="ss-price-main">${it.price ? esc(it.price) : '—'}</div>
        </div>`;
    }

    let metaHtml = '';
    if (it.rating) {
      metaHtml += `<span class="ss-stars">${stars(it.rating)}</span><span class="ss-rating-num">${esc(it.rating)}</span>`;
    }
    if (it.sold) {
      metaHtml += `<span class="ss-sold">· ${esc(it.sold)} ${esc(T('soldSuffix'))}</span>`;
    }
    if (!metaHtml) {
      metaHtml = `<span class="ss-no-info">${esc(T('noReviews'))}</span>`;
    }

    return `
      <a class="ss-card" href="${esc(it.link)}" target="_blank" rel="noopener">
        <div class="ss-thumb-wrapper">
          ${it.img 
            ? `<img class="ss-thumb" data-src="${esc(it.img)}" alt="">` 
            : `<div class="ss-thumb ss-thumb-empty">🛍</div>`}
        </div>
        <div class="ss-card-content">
          <div class="ss-card-title">${esc(it.title || 'Produit similaire')}</div>
          <div class="ss-card-meta">${metaHtml}</div>
        </div>
        ${discountBoxHtml}
      </a>`;
  }

  function setupImageObserver() {
    if (imageObserver) imageObserver.disconnect();
    imageObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const img = entry.target;
          if (img.dataset.src) {
            img.src = img.dataset.src;
            img.removeAttribute('data-src');
          }
          imageObserver.unobserve(img);
        }
      });
    }, { root: document.getElementById('ss-list'), rootMargin: '300px' });
  }

  function renderList(reset) {
    const l = document.getElementById('ss-list'); if (!l) return;
    if (reset) {
      if (!cachedItems.length) { message(T('noResults')); return; }
      applySort();
      l.innerHTML = '';
      renderedCount = 0;
      setupImageObserver();
    }
    if (!cachedSortedItems.length) return;
    const start = renderedCount;
    const end = Math.min(start + BATCH_SIZE, cachedSortedItems.length);
    const batch = cachedSortedItems.slice(start, end);
    if (!batch.length) return;
    const fragment = document.createDocumentFragment();
    const temp = document.createElement('div');
    temp.innerHTML = batch.map((it, i) => buildCard(it, start + i)).join('');
    while (temp.firstChild) fragment.appendChild(temp.firstChild);
    l.appendChild(fragment);
    renderedCount = end;
    if (imageObserver) l.querySelectorAll('img[data-src]').forEach(img => imageObserver.observe(img));
    updateFooter();
  }

  function updateFooter() {
    const f = document.getElementById('ss-footer'); if (!f) return;
    const remaining = cachedSortedItems.length - renderedCount;
    if (cachedSearchUrl) {
      f.innerHTML = `
        <a href="${esc(cachedSearchUrl)}" target="_blank" rel="noopener" class="ss-footer-link">
          ${esc(T('viewAll'))}
        </a>
        ${remaining > 0 ? `<div class="ss-loading-more">${renderedCount} / ${cachedSortedItems.length} · ${esc(T('scrollForMore'))}</div>` : ''}`;
    }
  }

  /* ============================================
     FETCH from SAME DOMAIN (fix .us vs .com)
     ============================================ */
  async function fetchPageWithRetry(url) {
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        console.log('[Smart Shopper] Attempt', attempt, ':', url);
        const res = await fetch(url, {
          credentials: 'same-origin',
          headers: {
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': navigator.language || 'fr-FR,fr;q=0.9,en;q=0.8'
          }
        });

        console.log('[Smart Shopper] HTTP', res.status, '| size:', res.headers.get('content-length') || '?');

        if (res.status === 200) {
          const html = await res.text();
          console.log('[Smart Shopper] HTML size:', html.length);
          return html;
        }

        if (res.status === 429 || res.status === 403) {
          const wait = 1500 * attempt;
          console.warn('[Smart Shopper] Blocked (' + res.status + '), waiting', wait, 'ms');
          await new Promise(r => setTimeout(r, wait));
          continue;
        }

        if (res.status === 404) return null;
        await new Promise(r => setTimeout(r, 800 * attempt));
      } catch (e) {
        console.warn('[Smart Shopper] Fetch error attempt', attempt, ':', e.message);
        if (attempt < MAX_RETRIES) {
          await new Promise(r => setTimeout(r, 800 * attempt));
        }
      }
    }
    return null;
  }

  function extractJsonArray(html, marker) {
    const i = html.indexOf(marker);
    if (i < 0) return null;
    const j = html.indexOf('[', i);
    if (j < 0) return null;
    let depth = 0, inStr = false, esc2 = false;
    for (let k = j; k < html.length; k++) {
      const c = html[k];
      if (inStr) {
        if (esc2) esc2 = false;
        else if (c === '\\') esc2 = true;
        else if (c === '"') inStr = false;
        continue;
      }
      if (c === '"') { inStr = true; continue; }
      if (c === '[') depth++;
      else if (c === ']') { depth--; if (depth === 0) return html.slice(j, k + 1); }
    }
    return null;
  }

  function extractText(v) {
    if (v == null) return '';
    if (typeof v === 'string') return v;
    if (typeof v === 'number') return String(v);
    if (typeof v === 'boolean') return v ? 'true' : '';
    if (typeof v === 'object') {
      const keys = ['displayTitle', 'text', 'title', 'value', 'name',
        'formatedActivityPrice', 'formatedPrice', 'minActivityPrice', 'minPrice',
        'price', 'desc', 'label'];
      for (const k of keys) {
        if (v[k] != null && typeof v[k] !== 'object') return String(v[k]);
      }
      for (const k in v) {
        if (typeof v[k] === 'string' && v[k].length > 0) return v[k];
      }
      return '';
    }
    return String(v);
  }

  function clean(s) {
    return String(s).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function parseItems(html) {
    const arrText = extractJsonArray(html, '"itemList"') || extractJsonArray(html, '"gridItems"');
    if (!arrText) {
      console.warn('[Smart Shopper] No itemList marker found');
      return [];
    }
    let arr;
    try { arr = JSON.parse(arrText); } catch (e) {
      console.warn('[Smart Shopper] JSON parse failed:', e.message);
      return [];
    }
    if (!Array.isArray(arr)) return [];

    const out = [];
    for (const o of arr) {
      try {
        if (!o || typeof o !== 'object') continue;
        const id = o.productId || o.id || (o.item && o.item.productId);
        if (!id) continue;

        const rawTitle = o.title || (o.item && o.item.title) || o.displayTitle || '';
        const title = clean(extractText(rawTitle));

        let img = '';
        if (o.image) {
          if (typeof o.image === 'string') img = o.image;
          else img = o.image.imgUrl || o.image.imageUrl || o.image.url || '';
        }
        if (!img && o.picUrl) {
          if (typeof o.picUrl === 'string') img = o.picUrl;
          else img = o.picUrl.imgUrl || o.picUrl.url || '';
        }
        if (img && img.startsWith('//')) img = 'https:' + img;

        const p = o.prices || {};
        const sale = p.salePrice || {};
        const orig = p.originalPrice || {};
        const price = extractText(sale.formatedActivityPrice || sale.formatedPrice ||
                      sale.minActivityPrice || sale.minPrice || p.formatedPrice || p.minPrice || '');
        const oldPrice = extractText(orig.formatedPrice || orig.minPrice || '');
        const discount = extractText(o.discount || sale.discount || '');

        const rating = extractText(
          (o.evaluation && (o.evaluation.starRating || o.evaluation.averageStar)) ||
          o.averageStarRate || o.starRating || ''
        );
        const sold = extractText(o.tradeDesc || o.sold || o.soldCount || '');

        out.push({
          id: String(id),
          title: title || 'Produit similaire',
          img, price, oldPrice, discount, rating, sold,
          link: 'https://www.aliexpress.com/item/' + id + '.html'
        });
      } catch (e) {}
    }
    console.log('[Smart Shopper] Parsed', out.length, 'items');
    return out;
  }

  function fallbackIds(html) {
    const re = /"productId"\s*:\s*"(\d{6,})"/g;
    const seen = new Set(); const out = [];
    let m;
    while ((m = re.exec(html))) {
      if (seen.has(m[1])) continue;
      seen.add(m[1]);
      out.push({
        id: m[1], title: 'Produit similaire', img: '', price: '', oldPrice: '',
        discount: '', rating: '', sold: '',
        link: 'https://www.aliexpress.com/item/' + m[1] + '.html'
      });
    }
    return out;
  }

  /* ============================================
     PERFORM SEARCH - uses CURRENT DOMAIN
     ============================================ */
  async function performSearch(title) {
    const q = encodeURIComponent((title || '').slice(0, 90));

    // 🔑 استخدام نفس النطاق الحالي (aliexpress.us أو aliexpress.com)
    const currentHost = location.hostname;
    const baseUrl = `https://${currentHost}/wholesale?SearchText=${q}&catId=0`;
    cachedSearchUrl = baseUrl;

    console.log('[Smart Shopper] === SEARCH START ===');
    console.log('[Smart Shopper] Host:', currentHost);
    console.log('[Smart Shopper] Query:', q.slice(0, 60));
    console.log('[Smart Shopper] URL:', baseUrl);

    const seenIds = new Set();
    let totalFetched = 0;

    for (let batch = 0; batch < MAX_PAGES; batch += PARALLEL_BATCH) {
      if (closed) return;

      const pages = [];
      for (let i = 0; i < PARALLEL_BATCH && (batch + i) < MAX_PAGES; i++) {
        pages.push(batch + i + 1);
      }

      const htmls = await Promise.all(pages.map(p => fetchPageWithRetry(baseUrl + '&page=' + p)));

      const newItems = [];
      for (const html of htmls) {
        if (!html) continue;
        let items = parseItems(html);
        if (!items.length) items = fallbackIds(html);
        for (const it of items) {
          if (!it || !it.id || seenIds.has(it.id)) continue;
          seenIds.add(it.id);
          newItems.push(it);
        }
      }

      if (newItems.length > 0) {
        totalFetched += newItems.length;
        cachedItems = cachedItems.concat(newItems);
        console.log('[Smart Shopper] Batch +', newItems.length, '(total:', totalFetched, ')');

        const list = document.getElementById('ss-list');
        const scrollTop = list ? list.scrollTop : 0;
        applySort();
        if (list) {
          list.innerHTML = '';
          renderedCount = 0;
          setupImageObserver();
          renderList(false);
          list.scrollTop = scrollTop;
        }
        updateFooter();
      }

      if (batch + PARALLEL_BATCH < MAX_PAGES) {
        await new Promise(r => setTimeout(r, DELAY_BETWEEN_BATCHES));
      }
    }

    console.log('[Smart Shopper] === DONE === Total:', totalFetched);
    searchComplete = true;
    if (pendingTabEl) activateTab(pendingTabEl, +pendingTabEl.dataset.i);
    updateFooter();

    if (totalFetched === 0) {
      message(T('noResults'));
    }
  }

  function runSearch(title) {
    buildPanel();
    const panel = document.getElementById(PANEL_ID);
    panel.style.display = '';
    cachedItems = [];
    cachedSortedItems = [];
    renderedCount = 0;
    searchComplete = false;
    searchStartTime = Date.now();
    activeTab = 0;
    if (pendingInterval) { clearInterval(pendingInterval); pendingInterval = null; }
    if (pendingTabEl) { restoreTab(pendingTabEl); pendingTabEl = null; }
    document.querySelectorAll('.ss-tab').forEach(x => {
      x.classList.toggle('active', x.dataset.i === '0');
    });
    skeleton();

    performSearch(title);
  }

  function scan() {
    if (closed) return;

    if (!isProductPage()) {
      const existing = document.getElementById(PANEL_ID);
      if (existing) existing.remove();
      currentKey = '';
      return;
    }

    const p = detectProduct();
    if (!p || !p.title) return;

    const key = location.host + location.pathname + '|' + p.title;
    if (key === currentKey) return;

    currentKey = key;
    runSearch(p.title);
  }

  // SPA URL monitoring
  let lastUrl = location.href;
  new MutationObserver(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      scan();
    }
  }).observe(document.body, { childList: true, subtree: true });

  scan();
  setInterval(scan, 2500);
})();