/* ============================================
   Smart Shopper - Content Script
   Small panel (expand as header icon)
   ============================================ */
(function () {
  'use strict';
  if (window.__smartShopper) return;
  window.__smartShopper = true;

  const PANEL_ID = 'ss-panel';
  const RENDER_BATCH = 20;

  const T = (key, vars) => (window.SS_I18N ? window.SS_I18N.t(key, vars) : key);

  let currentKey = '';
  let currentSearchTitle = '';
  let cachedItems = [];
  let cachedSortedItems = [];
  let cachedSearchUrl = '';
  let activeTab = 0;
  let closed = false;
  let renderedCount = 0;
  let imageObserver = null;
  let isLoadingMore = false;

  let currentProductPrice = 0;
  let lastPageFetched = 0;
  let hasMoreResults = true;
  let fetchingMore = false;

  let searchState = {
    running: false,
    complete: false,
    startTime: 0,
    totalItems: 0
  };

  let pendingTabEl = null;
  let pendingInterval = null;

  /* ============================================
     SVG Icons (Fluent style)
     ============================================ */
  const SVG_ICONS = {
    all: '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>',
    cheapest: '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 5 6.3 6.3a1 1 0 0 1 0 1.4L15 19"/><path d="M9 5 2.7 11.3a1 1 0 0 0 0 1.4L9 19"/></svg>',
    rated: '<svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor"><path d="M12 2l2.9 6.9 7.1.6-5.4 4.6 1.6 7-6.2-3.7-6.2 3.7 1.6-7L2 9.5l7.1-.6z"/></svg>',
    discount: '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.59 13.41 13.42 20.58a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><circle cx="7" cy="7" r="1.5" fill="currentColor"/></svg>',
    selling: '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 17l6-6 4 4 8-8"/><path d="M14 7h7v7"/></svg>',
    minimize: '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="5" y1="12" x2="19" y2="12"/></svg>',
    close: '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/></svg>',
    expand: '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>',
    plus: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>'
  };

  /* ============================================
     Currency
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
  })();

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
     Expose shared utils to fullscreen module
     ============================================ */
  window.SS_Utils = {
    esc, num, soldNum, discNum, stars, formatPrice,
    getCurrencySymbol: () => currentCurrencySymbol
  };

  /* ============================================
     Product detection
     ============================================ */
  function isProductPage() {
    return /aliexpress\.(com|us)\/(item|i)\/\d+/i.test(location.href);
  }

  function extractCurrentPrice() {
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
              if (v > 0) return v;
            }
          }
        }
      }
    } catch (e) {}

    const og = document.querySelector('meta[property="og:price:amount"]');
    if (og && og.content) {
      const v = parseFloat(String(og.content).replace(/[^\d.]/g, ''));
      if (v > 0) return v;
    }

    const ip = document.querySelector('[itemprop="price"]');
    if (ip) {
      const raw = ip.content || ip.textContent || '';
      const v = parseFloat(String(raw).replace(/[^\d.]/g, ''));
      if (v > 0) return v;
    }

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
     Panel DOM
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
          <button class="ss-wbtn" id="ss-expand" title="${esc(T('expand') || 'Vue pleine page')}">${SVG_ICONS.expand}</button>
          <button class="ss-wbtn" id="ss-minimize" title="${esc(T('minimize'))}">${SVG_ICONS.minimize}</button>
          <button class="ss-wbtn ss-wbtn-close" id="ss-close" title="${esc(T('close'))}">${SVG_ICONS.close}</button>
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
    document.getElementById('ss-expand').onclick = openFullscreen;
    document.getElementById('ss-tabs').addEventListener('click', onTabClick);
    document.getElementById('ss-list').addEventListener('scroll', onScroll, { passive: true });
    makeDraggable(panel, document.getElementById('ss-header'));
  }

  /* ============================================
     Open Fullscreen module
     ============================================ */
  function openFullscreen() {
    if (!window.SS_Fullscreen) {
      console.error('[Smart Shopper] Fullscreen module not loaded');
      return;
    }

    const panel = document.getElementById(PANEL_ID);
    if (panel) panel.style.display = 'none';

    window.SS_Fullscreen.open({
      items: cachedItems,
      activeTab: activeTab,
      hasMore: hasMoreResults,
      fetching: fetchingMore,
      currentProductPrice: currentProductPrice,
      currencySymbol: currentCurrencySymbol,
      onLoadMore: () => onLoadMoreClick(),
      onTabChange: (newTab) => {
        activeTab = newTab;
        cachedSortedItems = [];
        renderedCount = 0;
        document.querySelectorAll('.ss-tab').forEach(x =>
          x.classList.toggle('active', +x.dataset.i === newTab)
        );
      },
      onRefresh: () => {
        currentKey = '';
        if (window.SS_Fullscreen) window.SS_Fullscreen.close();
        const p = document.getElementById(PANEL_ID);
        if (p) p.style.display = '';
        scan();
      },
      onClose: () => {
        const p = document.getElementById(PANEL_ID);
        if (p) p.style.display = '';
      }
    });
  }

  /* ============================================
     Progress
     ============================================ */
  function updateProgress() {
    const p = document.getElementById('ss-progress'); if (!p) return;
    if (!searchState.running && !searchState.complete) { p.innerHTML = ''; return; }
    if (searchState.complete) {
      p.innerHTML = `<span class="ss-progress-done">${esc(T('resultsText', { n: searchState.totalItems }))}</span>`;
      setTimeout(() => { if (p) p.innerHTML = ''; }, 2000);
      return;
    }
    p.innerHTML = `<span class="ss-progress-text">${esc(T('loading'))}</span>`;
  }

  /* ============================================
     Tabs
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

    const list = document.getElementById('ss-list');
    if (list) list.scrollTop = 0;
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
      const svgMatch = tabEl.dataset.originalText.match(/<svg[^>]*>.*?<\/svg>/);
      const svg = svgMatch ? svgMatch[0] : '';
      tabEl.innerHTML = svg + `<span>${esc(T('countingText', { s: 3 }))}</span>`;
    };

    updateCountdown();
    if (pendingInterval) clearInterval(pendingInterval);
    pendingInterval = setInterval(updateCountdown, 500);
  }

  function onScroll(e) {
    if (isLoadingMore) return;
    const list = e.target;
    if (list.scrollTop + list.clientHeight >= list.scrollHeight - 400) loadMoreInView();
  }

  function loadMoreInView() {
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

  function buildCard(it, i) {
    const discountValue = it.discount ? String(it.discount).replace('-', '').replace('%', '') : '';
    const itemPrice = num(it.price);
    const hasComparison = currentProductPrice > 0 && itemPrice > 0;
    const isHigher = hasComparison && itemPrice > currentProductPrice;
    const boxClass = isHigher ? 'ss-discount-box ss-higher-price' : 'ss-discount-box';

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

  function renderList(reset, renderUpTo) {
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
    const end = renderUpTo !== undefined
      ? Math.min(renderUpTo, cachedSortedItems.length)
      : Math.min(start + RENDER_BATCH, cachedSortedItems.length);

    if (start >= end) return;

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
    let html = '';

    if (!searchState.running) {
      if (hasMoreResults) {
        if (fetchingMore) {
          html += `<button class="ss-load-more-btn ss-load-more-loading" disabled>
            <span class="ss-spinner"></span>
            <span>${esc(T('loading'))}</span>
          </button>`;
        } else {
          html += `<button class="ss-load-more-btn" id="ss-load-more">
            ${SVG_ICONS.plus}
            <span>${esc(T('loadMore'))}</span>
          </button>`;
        }
      } else {
        if (cachedItems.length > 0) {
          html += `<div class="ss-no-more">${esc(T('noMoreResults'))}</div>`;
        }
      }
    }

    const remaining = cachedSortedItems.length - renderedCount;
    if (remaining > 0) {
      html += `<div class="ss-loading-more">${renderedCount} / ${cachedSortedItems.length} · ${esc(T('scrollForMore'))}</div>`;
    }

    f.innerHTML = html;
    const btn = document.getElementById('ss-load-more');
    if (btn) btn.onclick = onLoadMoreClick;
  }

  /* ============================================
     Load More
     ============================================ */
  function onLoadMoreClick() {
    if (fetchingMore || !hasMoreResults || searchState.running) return;

    fetchingMore = true;
    updateFooter();
    if (window.SS_Fullscreen && window.SS_Fullscreen.isOpen()) {
      window.SS_Fullscreen.setState({ fetching: true });
    }

    const nextPage = lastPageFetched + 1;
    const existingIds = cachedItems.map(x => x.id);

    console.log('[Smart Shopper] Load more: page', nextPage, '| existing:', existingIds.length);

    chrome.runtime.sendMessage({
      type: 'SMART_LOAD_MORE',
      title: currentSearchTitle,
      startPage: nextPage,
      existingIds: existingIds
    }, (resp) => {
      fetchingMore = false;

      if (!resp || !resp.ok) {
        console.warn('[Smart Shopper] Load more failed:', resp && resp.error);
        hasMoreResults = resp && resp.hasMore !== false;
        updateFooter();
        if (window.SS_Fullscreen && window.SS_Fullscreen.isOpen()) {
          window.SS_Fullscreen.setState({ hasMore: hasMoreResults, fetching: false });
        }
        return;
      }

      if (resp.items && resp.items.length) {
        cachedItems = cachedItems.concat(resp.items);
        lastPageFetched = resp.lastPage || nextPage;
        console.log('[Smart Shopper] Added', resp.items.length, 'items (total:', cachedItems.length, ')');

        applySort();

        const list = document.getElementById('ss-list');
        const scrollTop = list ? list.scrollTop : 0;
        if (list) {
          list.innerHTML = '';
          renderedCount = 0;
          setupImageObserver();
          renderList(false, cachedSortedItems.length);
          list.scrollTop = scrollTop;
        }

        if (window.SS_Fullscreen && window.SS_Fullscreen.isOpen()) {
          window.SS_Fullscreen.updateItems(cachedItems);
        }
      }

      hasMoreResults = resp.hasMore !== false;
      updateFooter();

      if (window.SS_Fullscreen && window.SS_Fullscreen.isOpen()) {
        window.SS_Fullscreen.setState({ hasMore: hasMoreResults, fetching: false });
      }
    });
  }

  /* ============================================
     Initial search
     ============================================ */
  function runSearch(title, productPrice) {
    buildPanel();
    const panel = document.getElementById(PANEL_ID);
    panel.style.display = '';

    currentSearchTitle = title;
    currentProductPrice = productPrice || 0;
    lastPageFetched = 0;
    hasMoreResults = true;
    fetchingMore = false;

    console.log('[Smart Shopper] === INITIAL SEARCH ===');

    cachedItems = [];
    cachedSortedItems = [];
    cachedSearchUrl = '';
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
      totalItems: 0
    };

    skeleton();
    updateProgress();

    chrome.runtime.sendMessage({ type: 'SMART_SEARCH', title }, resp => {
      searchState.running = false;
      searchState.complete = true;

      if (!resp || !document.getElementById(PANEL_ID)) {
        updateFooter();
        return;
      }

      if (!resp.ok) {
        message(T('errorContact'));
        updateFooter();
        return;
      }

      cachedItems = resp.items || [];
      cachedSearchUrl = resp.searchUrl || '';
      lastPageFetched = resp.lastPage || 1;
      hasMoreResults = resp.hasMore !== false;
      searchState.totalItems = cachedItems.length;

      console.log('[Smart Shopper] Initial →', cachedItems.length, 'items');

      renderList(true);
      updateProgress();
      updateFooter();

      if (cachedItems.length === 0) message(T('noResults'));
    });
  }

  function scan() {
    if (closed) return;

    if (!isProductPage()) {
      const existing = document.getElementById(PANEL_ID);
      if (existing) existing.remove();
      if (window.SS_Fullscreen && window.SS_Fullscreen.isOpen()) window.SS_Fullscreen.close();
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