/* ============================================
   Smart Shopper - Background Service Worker
   Fetching via Cloudflare Worker
   ============================================ */

// 🔴 مهم: غيّر هذا الرابط إلى رابط Worker الخاص بك
const WORKER_URL = 'https://smart-shopper.smailsuit11.workers.dev';

/* ============================================
   Listener
   ============================================ */
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
   البحث الأولي - صفحة واحدة
   ============================================ */
async function handleSearch(msg, sender, sendResponse) {
  const tabId = sender.tab && sender.tab.id;
  const q = encodeURIComponent((msg.title || '').slice(0, 90));
  const baseUrl = 'https://www.aliexpress.com/wholesale?SearchText=' + q + '&catId=0';

  console.log('[Smart Shopper BG] === INITIAL SEARCH (page 1) ===');

  try {
    const items = await fetchPage(baseUrl, 1);

    const seenIds = new Set();
    const newItems = [];
    for (const it of items) {
      if (!it || !it.id || seenIds.has(it.id)) continue;
      seenIds.add(it.id);
      newItems.push(it);
    }

    const hasMore = newItems.length > 0;

    console.log('[Smart Shopper BG] Page 1 →', newItems.length, 'items');

    sendResponse({
      ok: true,
      items: newItems,
      lastPage: 1,
      hasMore: hasMore,
      totalItems: newItems.length,
      searchUrl: baseUrl
    });

    if (tabId) {
      try {
        chrome.tabs.sendMessage(tabId, {
          type: 'SMART_SEARCH_DONE',
          totalItems: newItems.length,
          lastPage: 1,
          hasMore: hasMore
        });
      } catch (e) {}
    }
  } catch (e) {
    console.error('[Smart Shopper BG] Search error:', e);
    sendResponse({ ok: false, error: String(e) });
  }
}

/* ============================================
   المزيد - الصفحة التالية
   ============================================ */
async function handleLoadMore(msg, sender, sendResponse) {
  const q = encodeURIComponent((msg.title || '').slice(0, 90));
  const baseUrl = 'https://www.aliexpress.com/wholesale?SearchText=' + q + '&catId=0';
  const nextPage = Math.max(2, parseInt(msg.startPage) || 2);
  const existingIds = msg.existingIds || [];

  console.log('[Smart Shopper BG] === LOAD MORE (page', nextPage, ') ===');

  try {
    const items = await fetchPage(baseUrl, nextPage);

    const seenIds = new Set(existingIds);
    const newItems = [];
    for (const it of items) {
      if (!it || !it.id || seenIds.has(it.id)) continue;
      seenIds.add(it.id);
      newItems.push(it);
    }

    const hasMore = newItems.length > 0;

    console.log('[Smart Shopper BG] Page', nextPage, '→', newItems.length, 'new items');

    sendResponse({
      ok: true,
      items: newItems,
      lastPage: nextPage,
      hasMore: hasMore
    });
  } catch (e) {
    console.error('[Smart Shopper BG] Load more error:', e);
    sendResponse({
      ok: false,
      error: String(e),
      hasMore: false,
      lastPage: nextPage - 1
    });
  }
}

/* ============================================
   🔥 Fetch via Cloudflare Worker
   ============================================ */
async function fetchPage(baseUrl, page) {
  try {
    const aliexpressUrl = baseUrl + '&page=' + page;
    const workerEndpoint = `${WORKER_URL}/fetch?url=${encodeURIComponent(aliexpressUrl)}`;

    console.log('[Smart Shopper BG] → Worker (page', page, ')');

    const res = await fetch(workerEndpoint);

    if (!res.ok) {
      console.warn('[Smart Shopper BG] Worker HTTP error:', res.status);
      return [];
    }

    const cacheStatus = res.headers.get('X-Cache') || '?';
    const provider = res.headers.get('X-Provider') || '?';
    console.log(`[Smart Shopper BG] ✅ Cache: ${cacheStatus} | Provider: ${provider}`);

    const html = await res.text();
    console.log('[Smart Shopper BG] HTML size:', html.length);

    if (html.length < 5000) {
      console.warn('[Smart Shopper BG] ⚠️ Small response (likely blocked)');
      return [];
    }

    let items = parseItems(html);
    if (!items.length) items = fallbackIds(html);

    console.log('[Smart Shopper BG] Parsed', items.length, 'items from page', page);
    return items;
  } catch (e) {
    console.warn('[Smart Shopper BG] Fetch error:', e.message);
    return [];
  }
}

/* ============================================
   Parse items from HTML
   ============================================ */
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