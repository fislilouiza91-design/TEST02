/* ============================================
   Smart Shopper - Content Script
   Price comparison: green/red, keep discount %
   ============================================ */
(function () {
  'use strict';
  if (window.__smartShopper) return;
  window.__smartShopper = true;

  const PANEL_ID = 'ss-panel';
  const BATCH_SIZE = 15;

  const T = (key, vars) => (window.SS_I18N ? window.SS_I18N.t(key, vars) : key);

  let currentKey = '';
  let cachedItems = [];
  let cachedSortedItems = [];
  let cachedSearchUrl = '';
  let activeTab = 0;
  let closed = false;
  let renderedCount = 0;
  let imageObserver = null;
  let isLoadingMore = false;

  let currentProductPrice = 0;

  let searchState = {
    running: false,
    complete: false,
    startTime: 0,
    pagesTotal: 3,
    pagesDone: 0,
    totalItems: 0
  };

  let pendingTabEl = null;
  let pendingInterval = null;

  /* ============================================
     أيقونات SVG
     ============================================ */
  const SVG_ICONS = {
    all: '<svg viewBox="0 0 24 24" width="11" height="11" fill="currentColor"><path d="M7 18c-1.1 0-1.99.9-1.99 2S5.9 22 7 22s2-.9 2-2-.9-2-2-2zM1 2v2h2l3.6 7.59-1.35 2.45c-.16.28-.25.61-.25.96 0 1.1.9 2 2 2h12v-2H7.42c-.14 0-.25-.11-.25-.25l.03-.12.9-1.63h7.45c.75 0 1.41-.41 1.75-1.03l3.58-6.49c.08-.14.12-.31.12-.48 0-.55-.45-1-1-1H5.21l-.94-2H1zm16 16c-1.1 0-1.99.9-1.99 2s.89 2 1.99 2 2-.9 2-2-.9-2-2-2z"/></svg>',
    cheapest: '<svg viewBox="0 0 24 24" width="11" height="11" fill="currentColor"><path d="M21.41 11.58l-9-9C12.05 2.22 11.55 2 11 2H4c-1.1 0-2 .9-2 2v7c0 .55.22 1.05.59 1.42l9 9c.36.36.86.58 1.41.58s1.05-.22 1.41-.59l7-7c.37-.36.59-.86.59-1.41s-.23-1.06-.59-1.42zM5.5 7C4.67 7 4 6.33 4 5.5S4.67 4 5.5 4 7 4.67 7 5.5 6.33 7 5.5 7z"/></svg>',
    rated: '<svg viewBox="0 0 24 24" width="11" height="11" fill="currentColor"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>',
    discount: '<svg viewBox="0 0 24 24" width="11" height="11" fill="currentColor"><path d="M13.5.67s.74 2.65.74 4.8c0 2.06-1.35 3.73-3.41 3.73-2.07 0-3.63-1.67-3.63-3.73l.03-.36C5.21 7.51 4 10.62 4 14c0 4.42 3.58 8 8 8s8-3.58 8-8C20 8.61 17.41 3.8 13.5.67z"/></svg>',
    selling: '<svg viewBox="0 0 24 24" width="11" height="11" fill="currentColor"><path d="M16 6l2.29 2.29-4.88 4.88-4-4L2 16.59 3.41 18l6-6 4 4 6.3-6.29L22 12V6z"/></svg>'
  };

  /* ============================================
     كشف العملة
     ============================================ */
  let currentCurrencySymbol = '$';
  let currentCurrencyCode = 'USD';

  (function detectCurrency() {
    try {
      const ck = document.cookie.match(/(?:^|;\s*)aep_usuc_f=([^;]+)/);
      if (ck) {
        const params = new URLSearchParams(decodeURIComponent(ck[1]));
        const cur = params.get('c_tp');
        if (cur) currentCurrencyCode = cur.toUpperCase();
      }
    } catch (e) {}

    const symbols = {
      USD: '$', EUR: '€', GBP: '£', JPY: '¥', CNY: '¥', RUB: '₽',
      SAR: 'ر.س', AED: 'د.إ', KWD: 'د.ك', QAR: 'ر.ق', EGP: 'ج.م',
      BRL: 'R$', CAD: 'C$', AUD: 'A$', INR: '₹', KRW: '₩',
      THB: '฿', VND: '₫', TRY: '₺', PLN: 'zł', ILS: '₪',
      IDR: 'Rp', MYR: 'RM', MXN: 'MX$', ZAR: 'R', NGN: '₦',
      MAD: 'DH', DZD: 'DA', TND: 'DT', CHF: 'CHF', NOK: 'kr',
      SEK: 'kr', DKK: 'kr', CZK: 'Kč', HUF: 'Ft', RON: 'lei',
      UAH: '₴', KZT: '₸', PKR: '₨', BDT: '৳', LKR: 'Rs'
    };

    currentCurrencySymbol = symbols[currentCurrencyCode] || currentCurrencyCode;
    console.log('[Smart Shopper] Currency:', currentCurrencyCode, '→', currentCurrencySymbol);
  })();

  /* ============================================
     تنسيق السعر
     ============================================ */
  function formatPrice(rawPrice) {
    if (!rawPrice) return '';
    const cleaned = String(rawPrice).replace(/[^\d.,]/g, '').trim();
    if (!cleaned) return String(rawPrice);
    return cleaned + ' ' + currentCurrencySymbol;
  }

  /* ============================================
     Utils
     ============================================ */
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

  /* ============================================
     فحص صفحة المنتج
     ============================================ */
  function isProductPage() {
    return /aliexpress\.(com|us)\/(item|i)\/\d+/i.test(location.href);
  }

  /* ============================================
     استخراج سعر المنتج الحالي
     ============================================ */
  function extractCurrentPrice() {
    // 1. JSON-LD offers.price
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
          if (p && p.offers) {
            const off = Array.isArray(p.offers) ? p.offers[0] : p.offers;
            if (off && off.price) {
              const v = parseFloat(String(off.price).replace(/[^\d.]/g, ''));
              if (v > 0) { console.log('[Smart Shopper] Price from JSON-LD:', v); return v; }
            }
          }
        }
      }
    } catch (e) {}

    // 2. og:price:amount
    const og = document.querySelector('meta[property="og:price:amount"]');
    if (og && og.content) {
      const v = parseFloat(String(og.content).replace(/[^\d.]/g, ''));
      if (v > 0) { console.log('[Smart Shopper] Price from og:price:', v); return v; }
    }

    // 3. [itemprop="price"]
    const ip = document.querySelector('[itemprop="price"]');
    if (ip) {
      const raw = ip.content || ip.textContent || '';
      const v = parseFloat(String(raw).replace(/[^\d.]/g, ''));
      if (v > 0) { console.log('[Smart Shopper] Price from itemprop:', v); return v; }
    }

    // 4. CSS selectors
    const selectors = [
      '[class*="price--current" i]',
      '[class*="currentPrice" i]',
      '[class*="ProductPrice"] [class*="value"]',
      '.product-price-value',
      '[class*="sale-price" i]'
    ];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el) {
        const v = parseFloat(String(el.textContent).replace(/[^\d.]/g, ''));
        if (v > 0) { console.log('[Smart Shopper] Price from', sel, ':', v); return v; }
      }
    }

    console.log('[Smart Shopper] Could not extract current price');
    return 0;
  }

  function detectProduct() {
    if (!isProductPage()) return null;

    const price = extractCurrentPrice();

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
          if (p && p.name) return { title: String(p.name).slice(0, 160), price: price };
        }
      }
    } catch (e) {}

    const ogTitle = document.querySelector('meta[property="og:title"]');
    if (ogTitle && ogTitle.content && ogTitle.content.trim().length > 8) {
      return { title: ogTitle.content.trim().slice(0, 160), price: price };
    }

    const title = (document.title || '').replace(/[|\-–—].*$/, '').trim();
    if (title.length > 8) return { title: title.slice(0, 160), price: price };

    return null;
  }

  /* ============================================
     حساب الوقت المتبقي
     ============================================ */
  function calcRemainingSec() {
    if (searchState.complete) return 0;
    if (!searchState.running) return 0;
    if (searchState.pagesDone === 0) return 10;

    const elapsedSec = (Date.now() - searchState.startTime) / 1000;
    const avgPerPage = elapsedSec / searchState.pagesDone;
    const remainingPages = Math.max(0, searchState.pagesTotal - searchState.pagesDone);
    const remaining = remainingPages * avgPerPage;

    return Math.max(1, Math.ceil(remaining));
  }

  /* ============================================
     بناء النافذة
     ============================================ */
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
          <span class="ss-tab active" data-i="0">${SVG_ICONS.all}<span>${esc(T('tabAll'))}</span></span>
          <span class="ss-tab" data-i="1">${SVG_ICONS.cheapest}<span>${esc(T('tabCheapest'))}</span></span>
          <span class="ss-tab" data-i="2">${SVG_ICONS.rated}<span>${esc(T('tabBestRated'))}</span></span>
          <span class="ss-tab" data-i="3">${SVG_ICONS.discount}<span>${esc(T('tabBestDiscount'))}</span></span>
          <span class="ss-tab" data-i="4">${SVG_ICONS.selling}<span>${esc(T('tabBestSelling'))}</span></span>
        </div>
        <div class="ss-progress" id="ss-progress"></div>
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

  /* ============================================
     Progress bar
     ============================================ */
  function updateProgress() {
    const p = document.getElementById('ss-progress'); if (!p) return;
    if (!searchState.running && !searchState.complete) { p.innerHTML = ''; return; }
    if (searchState.complete) {
      p.innerHTML = `<span class="ss-progress-done">${esc(T('resultsText', { n: searchState.totalItems }))}</span>`;
      setTimeout(() => { if (p) p.innerHTML = ''; }, 2000);
      return;
    }
    const done = searchState.pagesDone;
    const total = searchState.pagesTotal;
    const pct = Math.round((done / total) * 100);
    p.innerHTML = `
      <div class="ss-progress-bar">
        <div class="ss-progress-fill" style="width:${pct}%"></div>
      </div>
      <span class="ss-progress-text">${esc(T('pageText', { p: done, t: total, n: searchState.totalItems }))}</span>
    `;
  }

  /* ============================================
     التبويبات
     ============================================ */
  function onTabClick(e) {
    const t = e.target.closest('.ss-tab');
    if (!t) return;
    const newTab = +t.dataset.i;
    if (newTab === activeTab && !t.classList.contains('ss-tab-counting')) return;

    if (searchState.complete) {
      activateTab(t, newTab);
    } else if (searchState.running) {
      if (pendingTabEl && pendingTabEl !== t) restoreTab(pendingTabEl);
      pendingTabEl = t;
      startPendingCountdown(t);
    } else {
      activateTab(t, newTab);
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
      t.innerHTML = t.dataset.originalText;
      delete t.dataset.originalText;
    }
    t.classList.remove('ss-tab-counting');
  }

  function startPendingCountdown(tabEl) {
    if (!tabEl.dataset.originalText) tabEl.dataset.originalText = tabEl.innerHTML;
    tabEl.classList.add('ss-tab-counting');

    const updateCountdown = () => {
      if (searchState.complete) {
        activateTab(tabEl, +tabEl.dataset.i);
        return;
      }
      const remaining = calcRemainingSec();
      const svgMatch = tabEl.dataset.originalText.match(/<svg[^>]*>.*?<\/svg>/);
      const svg = svgMatch ? svgMatch[0] : '';
      tabEl.innerHTML = svg + `<span>${esc(T('countingText', { s: remaining }))}</span>`;
    };

    updateCountdown();
    if (pendingInterval) clearInterval(pendingInterval);
    pendingInterval = setInterval(updateCountdown, 500);
  }

  /* ============================================
     التمرير
     ============================================ */
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
    l.innerHTML = Array.from({ length: 4 }, () =>
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

  /* ============================================
     بناء البطاقة - ✅ أخضر أو أحمر دائماً
     ============================================ */
  function buildCard(it, i) {
    const discountValue = it.discount ? String(it.discount).replace('-', '').replace('%', '') : '';

    // 💰 تحديد اللون بناءً على المقارنة
    const itemPrice = num(it.price);
    const hasComparison = currentProductPrice > 0 && itemPrice > 0;
    const isHigher = hasComparison && itemPrice > currentProductPrice;

    // ✅ لا رمادي: إما أخضر (default) أو أحمر
    const boxClass = isHigher ? 'ss-discount-box ss-higher-price' : 'ss-discount-box';

    // ✅ نسبة الخصم تبقى دائماً إذا وُجدت
    const discountBoxHtml = `
      <div class="${boxClass}">
        <div class="ss-price-main">${it.price ? esc(formatPrice(it.price)) : '—'}</div>
        ${discountValue ? `<div class="ss-discount-label">-${esc(discountValue)}%</div>` : ''}
      </div>`;

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
     بدء البحث
     ============================================ */
  function runSearch(title, productPrice) {
    buildPanel();
    const panel = document.getElementById(PANEL_ID);
    panel.style.display = '';

    currentProductPrice = productPrice || 0;
    console.log('[Smart Shopper] === SEARCH ===');
    console.log('[Smart Shopper] Current product price:', currentProductPrice);

    cachedItems = [];
    cachedSortedItems = [];
    renderedCount = 0;
    activeTab = 0;

    if (pendingInterval) { clearInterval(pendingInterval); pendingInterval = null; }
    if (pendingTabEl) { restoreTab(pendingTabEl); pendingTabEl = null; }

    document.querySelectorAll('.ss-tab').forEach(x => {
      x.classList.toggle('active', x.dataset.i === '0');
    });

    searchState = {
      running: true,
      complete: false,
      startTime: Date.now(),
      pagesTotal: 3,
      pagesDone: 0,
      totalItems: 0
    };

    skeleton();
    updateProgress();

    chrome.runtime.sendMessage({ type: 'SMART_SEARCH', title }, resp => {
      if (!resp || !document.getElementById(PANEL_ID)) return;
      if (!resp.ok) {
        searchState.running = false;
        message(T('errorContact'));
        return;
      }

      cachedItems = resp.items || [];
      cachedSearchUrl = resp.searchUrl || '';
      searchState.pagesTotal = resp.totalPages || 3;
      searchState.pagesDone = resp.page || 1;
      searchState.totalItems = cachedItems.length;

      console.log('[Smart Shopper] Page 1 →', cachedItems.length, 'items');

      renderList(true);
      updateProgress();
    });
  }

  /* ============================================
     استقبال التحديثات
     ============================================ */
  chrome.runtime.onMessage.addListener((msg) => {
    if (!msg) return;

    if (msg.type === 'SMART_SEARCH_UPDATE') {
      const newItems = msg.items || [];
      if (!newItems.length) return;

      const existingIds = new Set(cachedItems.map(x => x.id));
      const uniqueNew = newItems.filter(x => !existingIds.has(x.id));

      if (uniqueNew.length) {
        cachedItems = cachedItems.concat(uniqueNew);
        cachedSearchUrl = msg.searchUrl || cachedSearchUrl;
        searchState.pagesDone = msg.page || (searchState.pagesDone + 1);
        searchState.pagesTotal = msg.totalPages || searchState.pagesTotal;
        searchState.totalItems = cachedItems.length;

        console.log('[Smart Shopper] Page', msg.page, '→ +' + uniqueNew.length, 'items');

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
        updateProgress();
      }
    }

    if (msg.type === 'SMART_SEARCH_DONE') {
      console.log('[Smart Shopper] === SEARCH DONE ===');
      searchState.running = false;
      searchState.complete = true;
      searchState.totalItems = msg.totalItems || cachedItems.length;

      if (pendingTabEl) {
        activateTab(pendingTabEl, +pendingTabEl.dataset.i);
      }

      updateProgress();
      updateFooter();

      if (cachedItems.length === 0) {
        message(T('noResults'));
      }
    }
  });

  /* ============================================
     Scan
     ============================================ */
  function scan() {
    if (closed) return;

    if (!isProductPage()) {
      const existing = document.getElementById(PANEL_ID);
      if (existing) existing.remove();
      currentKey = '';
      currentProductPrice = 0;
      searchState.running = false;
      searchState.complete = false;
      return;
    }

    const p = detectProduct();
    if (!p || !p.title) return;

    const key = location.host + location.pathname + '|' + p.title + '|' + p.price;
    if (key === currentKey) return;

    currentKey = key;
    runSearch(p.title, p.price || 0);
  }

  // مراقبة SPA
  let lastUrl = location.href;
  new MutationObserver(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      scan();
    }
  }).observe(document.body, { childList: true, subtree: true });

  setTimeout(scan, 800);
  setInterval(scan, 2500);
})();