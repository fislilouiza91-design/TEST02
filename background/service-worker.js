/* ============================================
   Smart Shopper - Background Service Worker
   ============================================ */

const MAX_PAGES = 8;
const PARALLEL_BATCH = 3;
const DELAY_BETWEEN_BATCHES = 400;

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || msg.type !== 'SMART_SEARCH') return;
  const tabId = sender.tab && sender.tab.id;

  (async () => {
    try {
      const q = encodeURIComponent((msg.title || '').slice(0, 90));
      const baseUrl = 'https://www.aliexpress.com/wholesale?SearchText=' + q + '&catId=0';

      const seenIds = new Set();
      let firstBatchSent = false;
      let totalFetched = 0;

      for (let batch = 0; batch < MAX_PAGES; batch += PARALLEL_BATCH) {
        const pages = [];
        for (let i = 0; i < PARALLEL_BATCH && (batch + i) < MAX_PAGES; i++) {
          pages.push(batch + i + 1);
        }

        const results = await Promise.all(pages.map(p => fetchPage(baseUrl, p)));
        const newItems = [];
        let emptyPages = 0;

        for (const items of results) {
          if (!items || !items.length) { emptyPages++; continue; }
          for (const it of items) {
            if (!it || !it.id || seenIds.has(it.id)) continue;
            seenIds.add(it.id);
            newItems.push(it);
          }
        }

        totalFetched += newItems.length;

        if (newItems.length > 0 && tabId) {
          if (!firstBatchSent) {
            sendResponse({ ok: true, items: newItems, searchUrl: baseUrl, done: false, count: newItems.length });
            firstBatchSent = true;
          } else {
            try {
              chrome.tabs.sendMessage(tabId, { type: 'SMART_SEARCH_UPDATE', items: newItems, searchUrl: baseUrl });
            } catch (e) {}
          }
        }

        if (emptyPages === pages.length) break;
        if (batch + PARALLEL_BATCH < MAX_PAGES) await new Promise(r => setTimeout(r, DELAY_BETWEEN_BATCHES));
      }

      if (tabId) {
        try { chrome.tabs.sendMessage(tabId, { type: 'SMART_SEARCH_DONE', total: totalFetched }); } catch (e) {}
      }
      if (!firstBatchSent) sendResponse({ ok: true, items: [], searchUrl: baseUrl, done: true });
    } catch (e) {
      sendResponse({ ok: false, error: String(e) });
    }
  })();

  return true;
});

/* ---------- استخراج النص من أي قيمة ---------- */
function extractText(v) {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return String(v);
  if (typeof v === 'boolean') return v ? 'true' : '';
  if (typeof v === 'object') {
    const keys = ['displayTitle', 'text', 'title', 'value', 'name',
      'formatedActivityPrice', 'formatedPrice', 'minActivityPrice', 'minPrice',
      'price', 'storeName', 'desc', 'label'];
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

/* ---------- استخراج اسم المتجر ---------- */
function extractStore(o) {
  const candidates = [
    o.storeName, o.sellerName, o.shopName, o.companyName,
    o.store && o.store.storeName, o.store && o.store.name,
    o.seller && o.seller.name, o.seller && o.seller.storeName,
    o.shop && o.shop.name
  ];
  for (const c of candidates) {
    if (typeof c === 'string' && c.trim() && c !== 'undefined' && c !== 'null' && c !== 'AliExpress') {
      return c.trim();
    }
  }
  return 'AliExpress';
}

/* ---------- جلب صفحة ---------- */
async function fetchPage(baseUrl, page) {
  try {
    const url = baseUrl + '&page=' + page;
    const res = await fetch(url, {
      credentials: 'include',
      headers: {
        'Accept-Language': 'en-US,en;q=0.9',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      }
    });
    if (!res.ok) return [];
    const html = await res.text();
    let items = parseItems(html);
    if (!items.length) items = fallbackIds(html);
    return items;
  } catch (e) {
    return [];
  }
}

/* ---------- استخراج المنتجات ---------- */
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

      const store = extractStore(o);

      const rating = extractText(
        (o.evaluation && (o.evaluation.starRating || o.evaluation.averageStar)) ||
        o.averageStarRate || o.starRating || ''
      );
      const sold = extractText(o.tradeDesc || o.sold || o.soldCount || '');

      out.push({
        id: String(id),
        title: title || 'Produit similaire',
        img, price, oldPrice, discount, store, rating, sold,
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
      discount: '', store: 'AliExpress', rating: '', sold: '',
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