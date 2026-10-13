/* ============================================
   Smart Shopper - Background Service Worker
   With retry + UA rotation + detailed logging
   ============================================ */

const MAX_PAGES = 6;
const PARALLEL_BATCH = 2;
const DELAY_BETWEEN_BATCHES = 800;
const MAX_RETRIES = 3;

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15'
];

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || msg.type !== 'SMART_SEARCH') return;
  const tabId = sender.tab && sender.tab.id;

  (async () => {
    try {
      const q = encodeURIComponent((msg.title || '').slice(0, 90));
      const baseUrl = 'https://www.aliexpress.com/wholesale?SearchText=' + q + '&catId=0';

      console.log('[Smart Shopper BG] === SEARCH START ===');
      console.log('[Smart Shopper BG] Query:', q.slice(0, 60));

      const seenIds = new Set();
      let firstBatchSent = false;
      let totalFetched = 0;

      for (let batch = 0; batch < MAX_PAGES; batch += PARALLEL_BATCH) {
        const pages = [];
        for (let i = 0; i < PARALLEL_BATCH && (batch + i) < MAX_PAGES; i++) {
          pages.push(batch + i + 1);
        }

        const results = await Promise.all(pages.map(p => fetchPageWithRetry(baseUrl, p)));

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
        console.log('[Smart Shopper BG] Batch', Math.floor(batch / PARALLEL_BATCH) + 1,
                    '- pages:', pages.join(','), '- new:', newItems.length, '- total:', totalFetched);

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

        if (emptyPages === pages.length) {
          console.log('[Smart Shopper BG] All pages empty. Stopping.');
          break;
        }
        if (batch + PARALLEL_BATCH < MAX_PAGES) {
          await new Promise(r => setTimeout(r, DELAY_BETWEEN_BATCHES));
        }
      }

      console.log('[Smart Shopper BG] === DONE === Total:', totalFetched);

      if (tabId) {
        try { chrome.tabs.sendMessage(tabId, { type: 'SMART_SEARCH_DONE', total: totalFetched }); } catch (e) {}
      }
      if (!firstBatchSent) {
        sendResponse({ ok: true, items: [], searchUrl: baseUrl, done: true, count: 0 });
      }
    } catch (e) {
      console.error('[Smart Shopper BG] Error:', e);
      sendResponse({ ok: false, error: String(e) });
    }
  })();

  return true;
});

/* ---------- جلب صفحة مع Retry ---------- */
async function fetchPageWithRetry(baseUrl, page) {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const url = baseUrl + '&page=' + page;
      const ua = USER_AGENTS[(attempt - 1) % USER_AGENTS.length];

      const res = await fetch(url, {
        credentials: 'include',
        headers: {
          'Accept-Language': 'en-US,en;q=0.9',
          'User-Agent': ua,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Cache-Control': 'no-cache'
        }
      });

      console.log('[Smart Shopper BG] Page', page, 'attempt', attempt, '→ HTTP', res.status);

      if (res.status === 200) {
        const html = await res.text();
        console.log('[Smart Shopper BG] Page', page, 'HTML size:', html.length);
        let items = parseItems(html);
        if (!items.length) items = fallbackIds(html);
        console.log('[Smart Shopper BG] Page', page, '→', items.length, 'items');
        return items;
      }

      if (res.status === 429 || res.status === 403) {
        const wait = 1500 * attempt;
        console.warn('[Smart Shopper BG] Blocked (' + res.status + '), waiting', wait, 'ms');
        await new Promise(r => setTimeout(r, wait));
        continue;
      }

      if (res.status === 404) return [];

      await new Promise(r => setTimeout(r, 800 * attempt));
    } catch (e) {
      console.warn('[Smart Shopper BG] Fetch error attempt', attempt, ':', e.message);
      if (attempt < MAX_RETRIES) {
        await new Promise(r => setTimeout(r, 800 * attempt));
      }
    }
  }
  console.warn('[Smart Shopper BG] Page', page, 'failed after all retries');
  return [];
}

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

/* ---------- استخراج المنتجات ---------- */
function parseItems(html) {
  const arrText = extractJsonArray(html, '"itemList"') || extractJsonArray(html, '"gridItems"');
  if (!arrText) {
    console.warn('[Smart Shopper BG] No itemList marker found');
    return [];
  }
  let arr;
  try { arr = JSON.parse(arrText); } catch (e) {
    console.warn('[Smart Shopper BG] JSON parse failed:', e.message);
    return [];
  }
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