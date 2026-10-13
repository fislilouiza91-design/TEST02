/* ============================================
   PERFORM SEARCH - uses current domain
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