/* ============================================
   Smart Shopper - Fullscreen Page Module
   With loading state support
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
  let loading = false;
  let currentProductPrice = 0;
  let renderedCount = 0;
  let imageObserver = null;
  let callbacks = {};

  const RENDER_BATCH = 30;

  const SVG = {
    back: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>',
    close: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/></svg>',
    all: '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>',
    cheapest: '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 5 6.3 6.3a1 1 0 0 1 0 1.4L15 19"/><path d="M9 5 2.7 11.3a1 1 0 0 0 0 1.4L9 19"/></svg>',
    rated: '<svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor"><path d="M12 2l2.9 6.9 7.1.6-5.4 4.6 1.6 7-6.2-3.7-6.2 3.7 1.6-7L2 9.5l7.1-.6z"/></svg>',
    discount: '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.59 13.41 13.42 20.58a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><circle cx="7" cy="7" r="1.5" fill="currentColor"/></svg>',
    selling: '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 17l6-6 4 4 8-8"/><path d="M14 7h7v7"/></svg>',
    plus: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>'
  };

  const T = (key, vars) => (window.SS_I18N ? window.SS_I18N.t(key, vars) : key);
  const U = () => window.SS_Utils || {};

  const esc = (s) => U().esc ? U().esc(s) : String(s || '');
  const num = (s) => U().num ? U().num(s) : 0;
  const stars = (r) => U().stars ? U().stars(r) : '';
  const formatPrice = (p) => U().formatPrice ? U().formatPrice(p) : (p || '');

  /* ============================================
     Build DOM
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

    document.getElementById('ss-fs-back').onclick = () => close();
    document.getElementById('ss-fs-close').onclick = () => close();
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

    document.getElementById('ss-fs-list').addEventListener('scroll', (e) => {
      const list = e.target;
      if (list.scrollTop + list.clientHeight >= list.scrollHeight - 500) {
        if (renderedCount < sortedItems.length) {
          renderList(false);
        }
      }
    }, { passive: true });

    document.querySelectorAll('#ss-fs-tabs .ss-fs-tab').forEach(x => {
      x.classList.toggle('active', +x.dataset.i === activeTab);
    });
  }

  /* ============================================
     Build Card
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
     Sort
     ============================================ */
  function applySort() {
    if (activeTab === 0) {
      sortedItems = [...items];
      return;
    }
    const U2 = window.SS_Utils || {};
    const soldNumFn = U2.soldNum || (() => 0);
    const discNumFn = U2.discNum || (() => 0);

    const sorters = [
      null,
      (a, b) => num(a.price) - num(b.price) || soldNumFn(b.sold) - soldNumFn(a.sold),
      (a, b) => num(b.rating) - num(a.rating) || num(a.price) - num(b.price),
      (a, b) => discNumFn(b.discount) - discNumFn(a.discount),
      (a, b) => soldNumFn(b.sold) - soldNumFn(a.sold)
    ];
    sortedItems = [...items].sort(sorters[activeTab] || sorters[1]);
  }

  /* ============================================
     Render List
     ============================================ */
  function renderList(reset) {
    const l = document.getElementById('ss-fs-list'); if (!l) return;

    if (loading && !items.length) {
      l.innerHTML = `
        <div class="ss-fs-loading-state">
          <div class="ss-fs-loading-spinner"></div>
          <div class="ss-fs-loading-text">${esc(T('loading'))}</div>
        </div>`;
      updateFooter();
      return;
    }

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
     Footer
     ============================================ */
  function updateFooter() {
    const f = document.getElementById('ss-fs-footer'); if (!f) return;

    let html = '';

    if (loading && !items.length) {
      f.innerHTML = '';
      return;
    }

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
    loading = !!opts.loading;
    currentProductPrice = opts.currentProductPrice || 0;
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
    console.log('[SS Fullscreen] Opened with', items.length, 'items | loading:', loading);
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
    if (state.loading !== undefined) loading = state.loading;

    if (state.activeTab !== undefined) {
      activeTab = state.activeTab;
      document.querySelectorAll('#ss-fs-tabs .ss-fs-tab').forEach(x =>
        x.classList.toggle('active', +x.dataset.i === activeTab)
      );
      if (isOpen) renderList(true);
    } else if (isOpen) {
      renderList(true);
    }
  }

  window.SS_Fullscreen = {
    open,
    close,
    updateItems,
    setState,
    isOpen: () => isOpen
  };

  console.log('[Smart Shopper] Fullscreen module loaded');
})();