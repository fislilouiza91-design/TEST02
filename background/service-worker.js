/* ============================================
   Smart Shopper - Background Service Worker
   Batch fetch: 1 page per click (~60 items)
   Max total: 200 items
   ============================================ */

const ITEMS_PER_BATCH = 60;      // صفحة واحدة ≈ 60 منتجاً
const MAX_TOTAL_ITEMS = 200;     // الحد الأقصى الكلي
const MIN_DELAY_MS = 2000;
const MAX_DELAY_MS = 4500;
const COOLDOWN_MS = 60000;

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:127.0) Gecko/20100101 Firefox/127.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15'
];

let blockedUntil = 0;

/* ============================================
   Listener
   ============================================ */
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg) return;

  if (msg.type === 'SMART_SEARCH') {
    handleInitialSearch(msg, sender, sendResponse);
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
async function handleInitialSearch(msg, sender, sendResponse) {
  const tabId = sender.tab && sender.tab.id;
  const q = encodeURIComponent((msg.title || '').slice(0, 90));
  const baseUrl = 'https://www.aliexpress.com/wholesale?SearchText=' + q + '&catId=0';

  console.log('[Smart Shopper BG] === INITIAL SEARCH ===');

  if (await checkBlockCooldown()) {
    sendResponse({ ok: false, error: 'cooldown' });
    return;
  }

  try {
    const url = baseUrl + '&page=1';
    const result = await fetchPageSecure(url, 1);

    if (result.blocked) {
      sendResponse({ ok: false, error: 'blocked' });
      return;
    }

    const items = result.items.slice(0, ITEMS_PER_BATCH);
    console.log('[Smart Shopper BG] Initial →', items.length, 'items');

    sendResponse({
      ok: true,
      items: items,
      lastPage: 1,
      hasMore: true,
      totalItems: items.length,
      searchUrl: baseUrl
    });
  } catch (e) {
    console.error('[Smart Shopper BG] Initial search error:', e);
    sendResponse({ ok: false, error: String(e) });
  }
}

/* ============================================
   المزيد - صفحة واحدة إضافية
   ============================================ */
async function handleLoadMore(msg, sender, sendResponse) {
  const q = encodeURIComponent((msg.title || '').slice(0, 90));
  const baseUrl = 'https://www.aliexpress.com/wholesale?SearchText=' + q + '&catId=0';
  const nextPage = Math.max(2, parseInt(msg.startPage) || 2);
  const existingIds = msg.existingIds || [];

  console.log('[Smart Shopper BG] === LOAD MORE from page', nextPage, '===');
  console.log('[Smart Shopper BG] Existing items:', existingIds.length);

  if (await checkBlockCooldown()) {
    sendResponse({ ok: false, error: 'cooldown', hasMore: true, lastPage: nextPage - 1 });
    return;
  }

  try {
    // 🔐 تأخير عشوائي قبل الجلب
    const delay = randomDelay();
    console.log('[Smart Shopper BG] Waiting', delay, 'ms...');
    await sleep(delay);

    const url = baseUrl + '&page=' + nextPage;
    const result = await fetchPageSecure(url, nextPage);

    if (result.blocked) {
      sendResponse({ ok: false, error: 'blocked', hasMore: true, lastPage: nextPage - 1 });
      return;
    }

    // فلتر المكررات
    const existingSet = new Set(existingIds);
    const newItems = result.items.filter(it => it && it.id && !existingSet.has(it.id));
    const hasMore = newItems.length > 0;

    console.log('[Smart Shopper BG] Page', nextPage, '→ +' + newItems.length, 'new items');

    sendResponse({
      ok: true,
      items: newItems,
      lastPage: nextPage,
      hasMore: hasMore,
      isLoadMore: true
    });
  } catch (e) {
    console.error('[Smart Shopper BG] Load more error:', e);
    sendResponse({ ok: false, error: String(e) });
  }
}

/* ============================================
   جلب آمن
   ============================================ */
async function fetchPageSecure(url, page) {
  const ua = USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];

  try {
    console.log('[Smart Shopper BG] Fetching page', page);

    const res = await fetch(url, {
      credentials: 'include',
      headers: {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
        'Referer': 'https://www.aliexpress.com/',
        'User-Agent': ua,
        'Sec-Ch-Ua': '"Chromium";v="126", "Not;A=Brand";v="24"',
        'Sec-Ch-Ua-Mobile': '?0',
        'Sec-Ch-Ua-Platform': '"Windows"',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'same-origin',
        'Sec-Fetch-User': '?1',
        'Upgrade-Insecure-Requests': '1'
      },
      redirect: 'follow'
    });

    console.log('[Smart Shopper BG] HTTP', res.status);

    if (res.status === 403 || res.status === 429) {
      console.warn('[Smart Shopper BG] ⚠️ HTTP', res.status, '- cooldown');
      blockedUntil = Date.now() + COOLDOWN_MS;
      return { blocked: true, items: [] };
    }

    if (!res.ok) {
      return { blocked: false, items: [] };
    }

    const html = await res.text();
    console.log('[Smart Shopper BG] HTML size:', html.length);

    if (html.length < 5000) {
      console.warn('[Smart Shopper BG] ⚠️ HTML too small');
      blockedUntil = Date.now() + COOLDOWN_MS;
      return { blocked: true, items: [] };
    }

    if (html.includes('captcha') || html.includes('punish') || html.includes('Verification')) {
      console.warn('[Smart Shopper BG] ⚠️ CAPTCHA detected');
      blockedUntil = Date.now() + COOLDOWN_MS;
      return { blocked: true, items: [] };
    }

    let items = parseItems(html);
    if (!items.length) items = fallbackIds(html);

    return { blocked: false, items };
  } catch (e) {
    console.warn('[Smart Shopper BG] Fetch error:', e.message);
    return { blocked: false, items: [] };
  }
}

/* ============================================
   أدوات
   ============================================ */
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function randomDelay() { return MIN_DELAY_MS + Math.floor(Math.random() * (MAX_DELAY_MS - MIN_DELAY_MS)); }

async function checkBlockCooldown() {
  if (Date.now() < blockedUntil) {
    const remaining = Math.ceil((blockedUntil - Date.now()) / 1000);
    console.warn('[Smart Shopper BG] Cooldown:', remaining, 's remaining');
    return true;
  }
  return false;
}

/* ============================================
   استخراج المنتجات
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