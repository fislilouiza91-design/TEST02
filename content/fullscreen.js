/* ============================================
   Smart Shopper - Fullscreen Page Module
   Standalone fullscreen view
   ============================================ */
(function () {
  'use strict';

  const FS_ID = 'ss-fullscreen';

  let isOpen = false;
  let items = [];
  let sortedItems = [];
  let activeTab = 0;
  let hasMore = true;
  let fetching = false;
  let currentProductPrice = 0;
  let renderedCount = 0;
  let imageObserver = null;
  let callbacks = {};
  let currencySymbol = '$';

  const RENDER_BATCH = 30;

  /* ---------- SVG Icons ---------- */
  const SVG = {
    back: '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/></svg>',
    close: '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>',
    refresh: '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/></svg>',
    all: '<svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor"><path d="M7 18c-1.1 0-1.99.9-1.99 2S5.9 22 7 22s2-.9 2-2-.9-2-2-2zM1 2v2h2l3.6 7.59-1.35 2.45c-.16.28-.25.61-.25.96 0 1.1.9 2 2 2h12v-2H7.42c-.14 0-.25-.11-.25-.25l.03-.12.9-1.63h7.45c.75 0 1.41-.41 1.75-1.03l3.58-6.49c.08-.14.12-.31.12-.48 0-.55-.45-1-1-1H5.21l-.94-2H1zm16 16c-1.1 0-1.99.9-1.99 2s.89 2 1.99 2 2-.9 2-2-.9-2-2-2z"/></svg>',
    cheapest: '<svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor"><path d="M21.41 11.58l-9-9C12.05 2.22 11.55 2 11 2H4c-1.1 0-2 .9-2 2v7c0 .55.22 1.05.59 1.42l9 9c.36.36.86.58 1.41.58s1.05-.22 1.41-.59l7-7c.37-.36.59-.86.59-1.41s-.23-1.06-.59-1.42zM5.5 7C4.67 7 4 6.33 4 5.5S4.67 4 5.5 4 7 4.67 7 5.5 6.33 7 5.5 7z"/></svg>',
    rated: '<svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>',
    discount: '<svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor"><path d="M13.5.67s.74 2.65.74 4.8c0 2.06-1.35 3.73-3.41 3.73-2.07 0-3.63-1.67-3.63-3.73l.03-.36C5.21 7.51 4 10.62 4 14c0 4.42 3.58 8 8 8s8-3.58 8-8C20 8.61 17.41 3.8 13.5.67z"/></svg>',
    selling: '<svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor"><path d="M16 6l2.29 2.29-4.88 4.88-4-4L2 16.59 3.41 18l6-6 4 4 6.3-6.29L22 12V6z"/></svg>',
    plus: '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>'
  };

  /* ---------- Helpers ---------- */
  const T = (key, vars) => (window.SS_I18N ? window.SS_I18N.t(key, vars) : key);
  const U = () => window.SS_Utils || {};

  const esc = (s) => U().esc ? U().esc(s) : String(s || '');
  const num = (s) => U().num ? U().num(s) : 0;
  const stars = (r) => U().stars ? U().stars(r) : '';
  const formatPrice = (p) => U().formatPrice ? U().formatPrice(p) : (p || '');

  /* ============================================
     بناء DOM الصفحة الكاملة
     ============================================ */
  function buildDOM() {
    let el = document.getElementById(FS_ID);
    if (el) el.remove();

    el = document.createElement('div');
    el.id = FS_ID;
    el.innerHTML = `
      <div class="ss-fs-header">
        <div class="ss-fs-header-left">
          <div class="ss-fs-logo">S</div>
          <div class="ss-fs-titles">
            <div class="ss-fs-title">${esc(T('panelTitle'))}</div>
            <div class="ss-fs-sub">${esc(T('panelSubtitle'))}</div>
          </div>
        </div>
        <div class="ss-fs-header-btns">
          <button class="ss-fs-btn" id="ss-fs-refresh" title="${esc(T('refresh'))}">${SVG.refresh}</button>
          <button class="ss-fs-btn ss-fs-back" id="ss-fs-back" title="${esc(T('back') || 'Back')}">
            ${SVG.back} <span>${esc(T('back') || 'Retour')}</span>
          </button>
          <button class="ss-fs-btn ss-fs-close" id="ss-fs-close" title="${esc(T('close'))}">${SVG.close}</button>
        </div>
      </div>
      <div class="ss-fs-tabs" id="ss-fs-tabs">
        <span class="ss-fs-tab" data-i="0">${SVG.all}<span>${esc(T('tabAll'))}</span></span>
        <span class="ss-fs-tab" data-i="1">${SVG.cheapest}<span>${esc(T('tabCheapest'))}</span></span>
        <span class="ss-fs-tab" data-i="2">${SVG.rated}<span>${esc(T('tabBestRated'))}</span></span>
        <span class="ss-fs-tab" data-i="3">${SVG.discount}<span>${esc(T('tabBestDiscount'))}</span></span>
        <span class="ss-fs-tab" data-i="4">${SVG.selling}<span>${esc(T('tabBestSelling'))}</span></span>
      </div>
      <div class="ss-fs-list" id="ss-fs-list"></div>
      <div class="ss-fs-footer" id="ss-fs-footer"></div>
    `;
    document.documentElement.appendChild(el);

    // Events
    document.getElementById('ss-fs-back').onclick = () => close();
    document.getElementById('ss-fs-close').onclick = () => close();
    document.getElementById('ss-fs-refresh').onclick = () => {
      if (callbacks.onRefresh) callbacks.onRefresh();
    };
    document.getElementById('ss-fs-tabs').addEventListener('click', (e) => {
      const tab = e.target.closest('.ss-fs-tab');
      if (!tab) return;
      const newTab = +tab.dataset.i;
      if (newTab === activeTab) return;
      activeTab = newTab;
      document.querySelectorAll('#ss-fs-tabs .ss-fs-tab').forEach(x =>
        x.classList.toggle('active', x === tab)
      );
      renderList(true);
      if (callbacks.onTabChange) callbacks.onTabChange(newTab);
    });

    // List scroll
    document.getElementById('ss-fs-list').addEventListener('scroll', (e) => {
      const list = e.target;
      if (list.scrollTop + list.clientHeight >= list.scrollHeight - 500) {
        if (renderedCount < sortedItems.length) {
          renderList(false);
        }
      }
    }, { passive: true });

    // Set active tab
    document.querySelectorAll('#ss-fs-tabs .ss-fs-tab').forEach(x => {
      x.classList.toggle('active', +x.dataset.i === activeTab);
    });
  }

  /* ============================================
     بناء بطاقة منتج (نفس منطق content.js)
     ============================================ */
  function buildCard(it) {
    const discountValue = it.discount ? String(it.discount).replace('-', '').replace('%', '') : '';

    const itemPrice = num(it.price);
    const hasComparison = currentProductPrice > 0 && itemPrice > 0;
    const isHigher = hasComparison && itemPrice > currentProductPrice;
    const boxClass = isHigher ? 'ss-fs-price-box ss-fs-higher' : 'ss-fs-price-box';

    const priceBox = `
      <div class="${boxClass}">
        <div class="ss-fs-price">${it.price ? esc(formatPrice(it.price)) : '—'}</div>
        ${discountValue ? `<div class="ss-fs-discount">-${esc(discountValue)}%</div>` : ''}
      </div>`;

    let metaHtml = '';
    if (it.rating) {
      metaHtml += `<span class="ss-fs-stars">${stars(it.rating)}</span><span class="ss-fs-rating">${esc(it.rating)}</span>`;
    }
    if (it.sold) {
      metaHtml += `<span class="ss-fs-sold">· ${esc(it.sold)} ${esc(T('soldSuffix'))}</span>`;
    }
    if (!metaHtml) {
      metaHtml = `<span class="ss-fs-no-info">${esc(T('noReviews'))}</span>`;
    }

    return `
      <a class="ss-fs-card" href="${esc(it.link)}" target="_blank" rel="noopener">
        <div class="ss-fs-thumb-wrapper">
          ${it.img
            ? `<img class="ss-fs-thumb" data-src="${esc(it.img)}" alt="">`
            : `<div class="ss-fs-thumb ss-fs-thumb-empty">🛍</div>`}
        </div>
        <div class="ss-fs-card-content">
          <div class="ss-fs-card-title">${esc(it.title || 'Produit similaire')}</div>
          <div class="ss-fs-card-meta">${metaHtml}</div>
        </div>
        ${priceBox}
      </a>`;
  }

  /* ============================================
     الترتيب
     ============================================ */
  function applySort() {
    if (activeTab === 0) {
      sortedItems = [...items];
      return;
    }
    const U2 = window.SS_Utils || {};
    const soldNum = U2.soldNum || (() => 0);
    const discNum = U2.discNum || (() => 0);

    const sorters = [
      null,
      (a, b) => num(a.price) - num(b.price) || soldNum(b.sold) - soldNum(a.sold),
      (a, b) => num(b.rating) - num(a.rating) || num(a.price) - num(b.price),
      (a, b) => discNum(b.discount) - discNum(a.discount),
      (a, b) => soldNum(b.sold) - soldNum(a.sold)
    ];
    sortedItems = [...items].sort(sorters[activeTab] || sorters[1]);
  }

  /* ============================================
     عرض القائمة
     ============================================ */
  function renderList(reset) {
    const l = document.getElementById('ss-fs-list'); if (!l) return;

    if (reset) {
      applySort();
      l.innerHTML = '';
      renderedCount = 0;
      setupImageObserver();
    }

    if (!sortedItems.length) {
      l.innerHTML = `<div class="ss-fs-msg">${esc(T('noResults'))}</div>`;
      updateFooter();
      return;
    }

    const start = renderedCount;
    const end = Math.min(start + RENDER_BATCH, sortedItems.length);
    if (start >= end) return;

    const batch = sortedItems.slice(start, end);
    const fragment = document.createDocumentFragment();
    const temp = document.createElement('div');
    temp.innerHTML = batch.map(it => buildCard(it)).join('');
    while (temp.firstChild) fragment.appendChild(temp.firstChild);
    l.appendChild(fragment);
    renderedCount = end;

    if (imageObserver) l.querySelectorAll('img[data-src]').forEach(img => imageObserver.observe(img));
    updateFooter();
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
    }, { root: document.getElementById('ss-fs-list'), rootMargin: '500px' });
  }

  /* ============================================
     الفوتر
     ============================================ */
  function updateFooter() {
    const f = document.getElementById('ss-fs-footer'); if (!f) return;

    let html = '';

    if (fetching) {
      html += `<button class="ss-fs-load-more ss-fs-loading" disabled>
        <span class="ss-fs-spinner"></span>
        <span>${esc(T('loading'))}</span>
      </button>`;
    } else if (hasMore) {
      html += `<button class="ss-fs-load-more" id="ss-fs-load-more">
        ${SVG.plus}
        <span>${esc(T('loadMore'))}</span>
      </button>`;
    } else if (items.length > 0) {
      html += `<div class="ss-fs-no-more">${esc(T('noMoreResults'))}</div>`;
    }

    const remaining = sortedItems.length - renderedCount;
    if (remaining > 0) {
      html += `<div class="ss-fs-counter">${renderedCount} / ${sortedItems.length} · ${esc(T('scrollForMore'))}</div>`;
    } else if (items.length > 0) {
      html += `<div class="ss-fs-counter">${items.length} ${esc(T('soldSuffix')) === 'vendus' ? 'produits' : 'items'}</div>`;
    }

    f.innerHTML = html;

    const btn = document.getElementById('ss-fs-load-more');
    if (btn) btn.onclick = () => {
      if (callbacks.onLoadMore) callbacks.onLoadMore();
    };
  }

  /* ============================================
     API
     ============================================ */
  function open(opts) {
    opts = opts || {};
    items = opts.items || [];
    activeTab = opts.activeTab || 0;
    hasMore = opts.hasMore !== false;
    fetching = !!opts.fetching;
    currentProductPrice = opts.currentProductPrice || 0;
    currencySymbol = opts.currencySymbol || '$';
    callbacks = {
      onLoadMore: opts.onLoadMore || null,
      onTabChange: opts.onTabChange || null,
      onRefresh: opts.onRefresh || null,
      onClose: opts.onClose || null
    };

    buildDOM();
    renderList(true);
    isOpen = true;

    document.documentElement.style.overflow = 'hidden';
    console.log('[SS Fullscreen] Opened with', items.length, 'items');
  }

  function close() {
    const el = document.getElementById(FS_ID);
    if (el) el.remove();
    isOpen = false;
    document.documentElement.style.overflow = '';

    if (callbacks.onClose) callbacks.onClose();
    console.log('[SS Fullscreen] Closed');
  }

  function updateItems(newItems) {
    items = newItems || [];
    if (isOpen) renderList(true);
  }

  function setState(state) {
    if (state.hasMore !== undefined) hasMore = state.hasMore;
    if (state.fetching !== undefined) fetching = state.fetching;
    if (state.activeTab !== undefined) {
      activeTab = state.activeTab;
      document.querySelectorAll('#ss-fs-tabs .ss-fs-tab').forEach(x =>
        x.classList.toggle('active', +x.dataset.i === activeTab)
      );
      if (isOpen) renderList(true);
    }
    if (isOpen) updateFooter();
  }

  /* ============================================
     Export
     ============================================ */
  window.SS_Fullscreen = {
    open,
    close,
    updateItems,
    setState,
    isOpen: () => isOpen
  };

  console.log('[Smart Shopper] Fullscreen module loaded');
})();
