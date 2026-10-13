/* ============================================
   Smart Shopper - Background Service Worker
   Initial search + Load More with pagination
   ============================================ */

const PAGES_PER_BATCH = 3;
const MAX_TOTAL_PAGES = 30;
const DELAY_BETWEEN_PAGES = 2500;

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg) return;

  if (msg.type === 'SMART_SEARCH') {
    handleSearch(msg, sender, sendResponse);
    return true;
  }

  if (msg.type === 'SMART_LOAD_MORE') {
    handleLoadMore(msg, sender, sendResponse);
    return true;
  }

  return true;
});

/* ============================================
   البحث الأولي (3 صفحات)
   ============================================ */
async function handleSearch(msg, sender, sendResponse) {
  const tabId = sender.tab && sender.tab.id;

  try {
    const q = encodeURIComponent((msg.title || '').slice(0, 90));
    const baseUrl = 'https://www.aliexpress.com/wholesale?SearchText=' + q + '&catId=0';

    console.log('[Smart Shopper BG] === INITIAL SEARCH ===');

    const seenIds = new Set();
    let totalFetched = 0;
    let firstSent = false;
    let lastPage = 0;
    let hasMore = true;

    for (let page = 1; page <= PAGES_PER_BATCH; page++) {
      const url = page === 1 ? baseUrl : baseUrl + '&page=' + page;
      const items = await fetchPage(url);

      if (items.length === 0) {
        hasMore = false;
        break;
      }

      const newItems = [];
      for (const it of items) {
        if (!it || !it.id || seenIds.has(it.id)) continue;
        seenIds.add(it.id);
        newItems.push(it);
      }

      lastPage = page;
      totalFetched += newItems.length;

      console.log('[Smart Shopper BG] Page', page, '→ +' + newItems.length, 'items');

      if (newItems.length > 0 && tabId) {
        if (!firstSent) {
          sendResponse({
            ok: true,
            items: newItems,
            page: page,
            totalPages: PAGES_PER_BATCH,
            totalItems: totalFetched,
            searchUrl: baseUrl,
            lastPage: page,
            hasMore: hasMore,
            done: false
          });
          firstSent = true;
        } else {
          try {
            chrome.tabs.sendMessage(tabId, {
              type: 'SMART_SEARCH_UPDATE',
              items: newItems,
              page: page,
              totalPages: PAGES_PER_BATCH,
              totalItems: totalFetched,
              searchUrl: baseUrl,
              lastPage: page,
              hasMore: hasMore
            });
          } catch (e) {}
        }
      }

      if (page < PAGES_PER_BATCH && hasMore) {
        await new Promise(r => setTimeout(r, DELAY_BETWEEN_PAGES));
      }
    }

    if (tabId) {
      try {
        chrome.tabs.sendMessage(tabId, {
          type: 'SMART_SEARCH_DONE',
          totalItems: totalFetched,
          lastPage: lastPage,
          hasMore: hasMore
        });
      } catch (e) {}
    }

    if (!firstSent) {
      sendResponse({
        ok: true, items: [], searchUrl: baseUrl, done: true,
        hasMore: false, lastPage: 0
      });
    }
  } catch (e) {
    console.error('[Smart Shopper BG] Search error:', e);
    sendResponse({ ok: false, error: String(e) });
  }
}

/* ============================================
   المزيد (3 صفحات إضافية)
   ============================================ */
async function handleLoadMore(msg, sender, sendResponse) {
  const tabId = sender.tab && sender.tab.id;

  try {
    const q = encodeURIComponent((msg.title || '').slice(0, 90));
    const baseUrl = 'https://www.aliexpress.com/wholesale?SearchText=' + q + '&catId=0';
    const startPage = Math.max(1, parseInt(msg.startPage) || 1);

    console.log('[Smart Shopper BG] === LOAD MORE from page', startPage, '===');

    let totalFetched = 0;
    let lastPage = startPage - 1;
    let hasMore = true;

    const endPage = Math.min(startPage + PAGES_PER_BATCH - 1, MAX_TOTAL_PAGES);

    for (let page = startPage; page <= endPage; page++) {
      const url = baseUrl + '&page=' + page;
      const items = await fetchPage(url);

      if (items.length === 0) {
        hasMore = false;
        break;
      }

      lastPage = page;
      totalFetched += items.length;

      console.log('[Smart Shopper BG] Page', page, '→', items.length, 'items');

      if (tabId) {
        try {
          chrome.tabs.sendMessage(tabId, {
            type: 'SMART_SEARCH_UPDATE',
            items: items,
            page: page,
            totalPages: endPage,
            totalItems: totalFetched,
            searchUrl: baseUrl,
            lastPage: page,
            hasMore: hasMore,
            isLoadMore: true
          });
        } catch (e) {}
      }

      if (page < endPage && hasMore) {
        await new Promise(r => setTimeout(r, DELAY_BETWEEN_PAGES));
      }
    }

    if (tabId) {
      try {
        chrome.tabs.sendMessage(tabId, {
          type: 'SMART_LOAD_MORE_DONE',
          lastPage: lastPage,
          hasMore: hasMore
        });
      } catch (e) {}
    }

    sendResponse({
      ok: true,
      itemsFetched: totalFetched,
      lastPage: lastPage,
      hasMore: hasMore
    });
  } catch (e) {
    console.error('[Smart Shopper BG] Load more error:', e);
    sendResponse({ ok: false, error: String(e) });
  }
}

/* ============================================
   جلب صفحة
   ============================================ */
async function fetchPage(url) {
  try {
    const res = await fetch(url, {
      credentials: 'include',
      headers: {
        'Accept-Language': 'en-US,en;q=0.9',
        'User-Agent': navigator.userAgent,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      }
    });
    if (!res.ok) return [];
    const html = await res.text();
    if (html.length < 5000) return [];
    let items = parseItems(html);
    if (!items.length) items = fallbackIds(html);
    return items;
  } catch (e) {
    return [];
  }
}

/* ---------- استخراج النص ---------- */
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

function parseItems(html) {
  const arrText = extractJsonArray(html, '"itemList"') || extractJsonArray(html, '"gridItems"');
  if (!arrText) return [];
  let arr;
  try { arr = JSON.parse(arrText); } catch (e) { return []; }
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

function extractJsonArray(html, marker) {
  const i = html.indexOf(marker);
  if (i < 0) return null;
  const j = html.indexOf('[', i);
  if (j < 0) return null;
  let depth = 0, inStr = false, esc = false;
  for (let k = j; k < html.length; k++) {
    const c = html[k];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') { inStr = true; continue; }
    if (c === '[') depth++;
    else if (c === ']') { depth--; if (depth === 0) return html.slice(j, k + 1); }
  }
  return null;
}

function clean(s) {
  return String(s).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}