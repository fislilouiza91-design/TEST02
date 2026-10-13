/* ============================================
   Smart Shopper - Content Script
   Progressive page-by-page loading + accurate countdown
   ============================================ */
(function () {
  'use strict';
  if (window.__smartShopper) return;
  window.__smartShopper = true;

  const PANEL_ID = 'ss-panel';
  const BATCH_SIZE = 15;

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

  // حالة البحث
  let searchState = {
    running: false,
    complete: false,
    startTime: 0,
    pagesTotal: 5,
    pagesDone: 0,
    totalItems: 0
  };

  // حالة العد التنازلي على التبويبات
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

  /* ============================================
     فحص صفحة المنتج
     ============================================ */
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

  /* ============================================
     حساب الوقت المتبقي بدقة
     ============================================ */
  function calcRemainingSec() {
    if (searchState.complete) return 0;
    if (!searchState.running) return 0;
    if (searchState.pagesDone === 0) return 10; // تقدير افتراضي

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
          <span class="ss-tab active" data-i="0">${esc(T('tabAll'))}</span>
          <span class="ss-tab" data-i="1">${esc(T('tabCheapest'))}</span>
          <span class="ss-tab" data-i="2">${esc(T('tabBestRated'))}</span>
          <span class="ss-tab" data-i="3">${esc(T('tabBestDiscount'))}</span>
          <span class="ss-tab" data-i="4">${esc(T('tabBestSelling'))}</span>
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
     Progress bar - يظهر أثناء البحث
     ============================================ */
  function updateProgress() {
    const p = document.getElementById('ss-progress'); if (!p) return;
    if (!searchState.running && !searchState.complete) { p.innerHTML = ''; return; }
    if (searchState.complete) {
      p.innerHTML = `<span class="ss-progress-done">✓ ${searchState.totalItems} résultats</span>`;
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
      <span class="ss-progress-text">Page ${done}/${total} · ${searchState.totalItems} produits</span>
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
      // البحث انتهى - تفعيل فوري
      activateTab(t, newTab);
    } else if (searchState.running) {
      // البحث جارٍ - ابدأ العد التنازلي
      if (pendingTabEl && pendingTabEl !== t) restoreTab(pendingTabEl);
      pendingTabEl = t;
      startPendingCountdown(t);
    } else {
      // لا يوجد بحث - تفعيل مباشر
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
      t.textContent = t.dataset.originalText;
      delete t.dataset.originalText;
    }
    t.classList.remove('ss-tab-counting');
  }

  function startPendingCountdown(tabEl) {
    if (!tabEl.dataset.originalText) tabEl.dataset.originalText = tabEl.textContent;
    tabEl.classList.add('ss-tab-counting');

    const updateCountdown = () => {
      if (searchState.complete) {
        // انتهى البحث - فعّل التبويب
        activateTab(tabEl, +tabEl.dataset.i);
        return;
      }
      const remaining = calcRemainingSec();
      tabEl.textContent = `⏳ ${remaining}s`;
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
     بدء البحث
     ============================================ */
  function runSearch(title) {
    buildPanel();
    const panel = document.getElementById(PANEL_ID);
    panel.style.display = '';

    // إعادة تعيين
    cachedItems = [];
    cachedSortedItems = [];
    renderedCount = 0;
    activeTab = 0;

    if (pendingInterval) { clearInterval(pendingInterval); pendingInterval = null; }
    if (pendingTabEl) { restoreTab(pendingTabEl); pendingTabEl = null; }

    document.querySelectorAll('.ss-tab').forEach(x => {
      x.classList.toggle('active', x.dataset.i === '0');
    });

    // حالة البحث الجديدة
    searchState = {
      running: true,
      complete: false,
      startTime: Date.now(),
      pagesTotal: 5, // قيمة افتراضية
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

      // الدفعة الأولى
      cachedItems = resp.items || [];
      cachedSearchUrl = resp.searchUrl || '';
      searchState.pagesTotal = resp.totalPages || 5;
      searchState.pagesDone = resp.page || 1;
      searchState.totalItems = cachedItems.length;

      console.log('[Smart Shopper] Page 1 →', cachedItems.length, 'items');

      renderList(true);
      updateProgress();
    });
  }

  /* ============================================
     استقبال التحديثات من background
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

        console.log('[Smart Shopper] Page', msg.page, '→ +' + uniqueNew.length, 'items (total:', cachedItems.length, ')');

        // إعادة عرض مع الاحتفاظ بموضع التمرير
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

      // إذا كان هناك تبويب ينتظر، فعّله فوراً
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
      searchState.running = false;
      searchState.complete = false;
      return;
    }

    const p = detectProduct();
    if (!p || !p.title) return;

    const key = location.host + location.pathname + '|' + p.title;
    if (key === currentKey) return;

    currentKey = key;
    runSearch(p.title);
  }

  // مراقبة SPA
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