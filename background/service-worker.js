/* ============================================
   Smart Shopper - Background Service Worker
   Sequential streaming - max 50 items
   ============================================ */

const MAX_PAGES = 3;              // 3 صفحات كحد أقصى
const MAX_ITEMS = 50;             // 50 منتج كحد أقصى
const DELAY_BETWEEN_PAGES = 4000; // 4 ثواني بين كل صفحة

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || msg.type !== 'SMART_SEARCH') return;
  const tabId = sender.tab && sender.tab.id;

  (async () => {
    try {
      const q = encodeURIComponent((msg.title || '').slice(0, 90));
      const baseUrl = 'https://www.aliexpress.com/wholesale?SearchText=' + q + '&catId=0';

      console.log('[Smart Shopper BG] === SEARCH START ===');
      console.log('[Smart Shopper BG] Max pages:', MAX_PAGES, '| Max items:', MAX_ITEMS);

      const seenIds = new Set();
      let totalFetched = 0;
      let firstSent = false;

      for (let page = 1; page <= MAX_PAGES; page++) {
        // إذا وصلنا للحد الأقصى، توقف
        if (totalFetched >= MAX_ITEMS) {
          console.log('[Smart Shopper BG] Reached MAX_ITEMS limit. Stopping.');
          break;
        }

        console.log('[Smart Shopper BG] Fetching page', page);

        const url = page === 1 ? baseUrl : baseUrl + '&page=' + page;
        const items = await fetchPage(url);

        console.log('[Smart Shopper BG] Page', page, '→', items.length, 'items');

        const newItems = [];
        for (const it of items) {
          if (!it || !it.id || seenIds.has(it.id)) continue;
          // توقف إذا وصلنا 50
          if (totalFetched + newItems.length >= MAX_ITEMS) break;
          seenIds.add(it.id);
          newItems.push(it);
        }

        if (newItems.length === 0 && page > 1) {
          console.log('[Smart Shopper BG] Empty page', page, '- stopping');
          break;
        }

        totalFetched += newItems.length;

        if (newItems.length > 0 && tabId) {
          if (!firstSent) {
            sendResponse({
              ok: true,
              items: newItems,
              page: page,
              totalPages: MAX_PAGES,
              totalItems: totalFetched,
              searchUrl: baseUrl,
              done: false
            });
            firstSent = true;
          } else {
            try {
              chrome.tabs.sendMessage(tabId, {
                type: 'SMART_SEARCH_UPDATE',
                items: newItems,
                page: page,
                totalPages: MAX_PAGES,
                totalItems: totalFetched,
                searchUrl: baseUrl
              });
            } catch (e) {}
          }
        }

        // إذا وصلنا الحد، توقف
        if (totalFetched >= MAX_ITEMS) {
          console.log('[Smart Shopper BG] Reached MAX_ITEMS after page', page);
          break;
        }

        // انتظار بين الصفحات
        if (page < MAX_PAGES) {
          await new Promise(r => setTimeout(r, DELAY_BETWEEN_PAGES));
        }
      }

      console.log('[Smart Shopper BG] === DONE === Total:', totalFetched);

      if (tabId) {
        try {
          chrome.tabs.sendMessage(tabId, {
            type: 'SMART_SEARCH_DONE',
            totalItems: totalFetched
          });
        } catch (e) {}
      }

      if (!firstSent) {
        sendResponse({ ok: true, items: [], searchUrl: baseUrl, done: true });
      }
    } catch (e) {
      console.error('[Smart Shopper BG] Error:', e);
      sendResponse({ ok: false, error: String(e) });
    }
  })();

  return true;
});

/* ---------- جلب صفحة واحدة ---------- */
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

    if (!res.ok) {
      console.warn('[Smart Shopper BG] HTTP error:', res.status);
      return [];
    }

    const html = await res.text();
    console.log('[Smart Shopper BG] HTML size:', html.length);

    if (html.length < 5000) {
      console.warn('[Smart Shopper BG] ⚠️ HTML too small, likely blocked');
      return [];
    }

    let items = parseItems(html);
    if (!items.length) items = fallbackIds(html);
    return items;
  } catch (e) {
    console.warn('[Smart Shopper BG] Fetch error:', e.message);
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