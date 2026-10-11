/* ═══════════════════════════════════════════════════════
   Smart Shopper — Content Script (v40)
   + HTML extraction for ALL sources (Page + API)
   + 9 products in 3 batches
   + Silent update (no badge)
   + Save real data to Neon after fetch
   + Load full data from Neon cache
   ═══════════════════════════════════════════════════════ */

(function () {
  "use strict";

  if (window.__SMART_SHOPPER_LOADED__) return;
  window.__SMART_SHOPPER_LOADED__ = true;

  const T = typeof SS_T === "function" ? SS_T : (k) => k;
  const LANG = typeof SS_LANG !== "undefined" ? SS_LANG : "en";
  const IS_RTL = typeof SS_RTL !== "undefined" ? SS_RTL : false;

  console.log(`[Smart Shopper] v40 | Language: ${LANG}`);

  const PANEL_ID = "ss-floating-panel";
  const WORKER_URL = "https://smart-shopper-proxy.fislilouiza91.workers.dev";
  const DB_WORKER_URL = "https://smart-shopper-proxy.fislilouiza91.workers.dev/product";
  const DB_SIMILAR_URL = "https://smart-shopper-proxy.fislilouiza91.workers.dev/similar";
  const DB_UPDATE_URL = "https://smart-shopper-proxy.fislilouiza91.workers.dev/update-similar";
  const AFFILIATE_LINK_URL = "https://smart-shopper-proxy.fislilouiza91.workers.dev/api/link";
  const REAL_PRICES_URL = "https://smart-shopper-proxy.fislilouiza91.workers.dev/real-prices-batch";
  const CACHE_TTL = 1000 * 60 * 30;
  const DB_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
  const REAL_PRICE_CACHE_TTL = 7 * 24 * 60 * 60 * 1000;
  const MAX_PRODUCTS_TO_FETCH = 9;

  let currentProduct = null;
  let sellers = [];
  let activeFilter = "best";
  let minimized = false;
  let dataSource = "none";
  let isScanning = false;
  let lastSentUrl = "";
  let lastSentSimilar = "";

  // ═══════════════════════════════════════════════════════
  // REAL PRICE CACHE (localStorage)
  // ═══════════════════════════════════════════════════════

  const REAL_PRICE_CACHE_KEY = "ss-real-prices";

  function loadRealPriceCache() {
    try {
      const raw = localStorage.getItem(REAL_PRICE_CACHE_KEY);
      if (!raw) return {};
      const data = JSON.parse(raw);
      const now = Date.now();
      const filtered = {};
      for (const [url, entry] of Object.entries(data)) {
        if (entry.ts && (now - entry.ts) < REAL_PRICE_CACHE_TTL) filtered[url] = entry;
      }
      return filtered;
    } catch (_) { return {}; }
  }

  function saveRealPriceCache(cache) {
    try { localStorage.setItem(REAL_PRICE_CACHE_KEY, JSON.stringify(cache)); } catch (_) {}
  }

  function setCachedRealPrice(url, price, currency, shippingPrice, extra) {
    const cache = loadRealPriceCache();
    cache[url] = {
      price,
      currency,
      shippingPrice: shippingPrice !== undefined ? shippingPrice : null,
      rating: extra?.rating || null,
      sold: extra?.sold || null,
      seller: extra?.seller || null,
      ts: Date.now()
    };
    saveRealPriceCache(cache);
  }

  // ═══════════════════════════════════════════════════════
  // FETCH REAL PRICES FROM SERVER (HTML)
  // ═══════════════════════════════════════════════════════

  async function fetchRealPricesBatch(sellersList) {
    if (!sellersList || sellersList.length === 0) return;

    const cache = loadRealPriceCache();
    let cachedCount = 0;
    const needFetch = [];

    for (const s of sellersList) {
      const url = s.link;
      if (!url || !url.includes("/item/")) continue;

      if (cache[url] && cache[url].price > 0) {
        s.price = cache[url].price;
        if (cache[url].currency) s.currency = cache[url].currency;
        if (cache[url].shippingPrice !== undefined && cache[url].shippingPrice !== null) {
          s.shippingPrice = cache[url].shippingPrice;
          s.isFreeShipping = cache[url].shippingPrice === 0;
        }
        if (cache[url].rating && cache[url].rating > 0) s.rating = cache[url].rating;
        if (cache[url].sold && cache[url].sold > 0) s.sold = cache[url].sold;
        if (cache[url].seller && cache[url].seller.length > 2) s.store = cache[url].seller;
        s._realPrice = true;
        cachedCount++;
      } else {
        needFetch.push(s);
      }
    }

    if (cachedCount > 0) {
      console.log(`[Smart Shopper] ✅ ${cachedCount} من Cache.`);
      renderList();
    }
    if (needFetch.length === 0) return;

    const toFetch = needFetch.slice(0, MAX_PRODUCTS_TO_FETCH);
    const urls = toFetch.map(s => s.link);

    console.log(`[Smart Shopper] 🌐 طلب ${urls.length} (سعر + شحن) من السيرفر...`);

    try {
      const res = await fetch(REAL_PRICES_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ urls })
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "API error");

      let updated = 0;
      for (const s of toFetch) {
        const found = data.results[s.link];
        if (found && found.success && found.price > 0) {
          s.price = found.price;
          if (found.currency) s.currency = found.currency;
          s._realPrice = true;
          if (found.shippingPrice !== undefined && found.shippingPrice !== null) {
            s.shippingPrice = found.shippingPrice;
            s.isFreeShipping = found.shippingPrice === 0;
          }
          if (found.rating && found.rating > 0) s.rating = found.rating;
          if (found.sold && found.sold > 0) s.sold = found.sold;
          if (found.seller && found.seller.length > 2) s.store = found.seller;
          if (found.title && found.title.length > 5) s.title = found.title;
          if (found.image && found.image.startsWith("http")) s.img = found.image;

          setCachedRealPrice(s.link, found.price, found.currency, found.shippingPrice, {
            rating: found.rating,
            sold: found.sold,
            seller: found.seller
          });
          updated++;
        }
      }

      if (updated > 0) {
        console.log(`✅ [Smart Shopper] تم تحديث ${updated} منتج.`);
        renderList();

        // ⭐ احفظ البيانات الدقيقة في Neon
        updateDBWithRealData(toFetch, currentProduct.url).catch(() => {});
      }
    } catch (e) {
      console.warn("[Smart Shopper] فشل قراءة الأسعار:", e);
    }
  }

  // ═══════════════════════════════════════════════════════
  // ⭐ UPDATE DB WITH REAL DATA
  // ═══════════════════════════════════════════════════════

  async function updateDBWithRealData(sellersList, parentUrl) {
    if (!sellersList || sellersList.length === 0 || !parentUrl) return;

    const payload = sellersList
      .filter(s => s.link && s.price > 0)
      .map(s => ({
        parent_url: parentUrl,
        product_url: normalizeToRawUrl(s.link),
        price: s.price || 0,
        old_price: s.oldPrice || 0,
        discount: s.discount || 0,
        rating: s.rating || 0,
        sold_count: s.sold || 0,
        image_url: s.img || "",
        currency: s.currency || "USD",
        shipping_price: s.shippingPrice !== undefined ? s.shippingPrice : null,
        is_free_shipping: s.isFreeShipping !== undefined ? s.isFreeShipping : null
      }));

    if (payload.length === 0) return;

    try {
      const res = await fetch(DB_UPDATE_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: payload })
      });
      const data = await res.json();
      if (data.ok) {
        console.log(`✅ [Smart Shopper] تم حفظ ${data.updated} منتج في Neon.`);
      }
    } catch (e) {
      console.warn("[Smart Shopper] فشل حفظ البيانات في Neon:", e);
    }
  }

  // ═══════════════════════════════════════════════════════
  // SHIPPING FROM CARD
  // ═══════════════════════════════════════════════════════

  function extractShippingFromCard(card) {
    try {
      const txt = card.innerText || "";
      const lower = txt.toLowerCase();

      const freePatterns = [
        /free\s+shipping/i, /free\s+delivery/i,
        /livraison\s+gratuite/i, /env[íi]o\s+gratis/i,
        /kostenloser\s+versand/i, /الشحن\s+مجاني/, /شحن\s+مجاني/,
        /免費送貨/, /送料無料/, /무료\s*배송/,
      ];
      for (const re of freePatterns) {
        if (re.test(lower)) return { shippingPrice: 0, isFreeShipping: true };
      }

      const currencyPatterns = [
        /(?:shipping|delivery|freight)\s*:?\s*(?:US\s*)?\$\s*([\d.,]+)/i,
        /\$\s*([\d.,]+)\s*(?:shipping|delivery|freight)/i,
        /\+?\s*\$\s*([\d.,]+)\s*(?:shipping|ship)/i,
        /(?:livraison|expédition)\s*:?\s*([\d.,]+)/i,
        /(?:الشحن|شحن)\s*:?\s*([\d.,]+)/i,
      ];

      for (const re of currencyPatterns) {
        const m = txt.match(re);
        if (m) {
          const amt = parseFloat(m[1].replace(",", "."));
          if (!isNaN(amt) && amt >= 0 && amt < 500) {
            return { shippingPrice: amt, isFreeShipping: amt === 0 };
          }
        }
      }

      return { shippingPrice: null, isFreeShipping: null };
    } catch (_) {
      return { shippingPrice: null, isFreeShipping: null };
    }
  }

  // ═══════════════════════════════════════════════════════
  // SEND MAIN PRODUCT TO NEON
  // ═══════════════════════════════════════════════════════

  function sendProductToDB(product) {
    if (!product || !product.url) return;
    if (!product.price || product.price <= 0) return;
    if (product.url === lastSentUrl) return;
    lastSentUrl = product.url;

    try {
      chrome.runtime.sendMessage({ type: "PRODUCT_DETECTED", product }, () => {
        if (chrome.runtime.lastError) { /* ignore */ }
      });
    } catch (_) {}

    try {
      fetch(DB_WORKER_URL, {
        method: "POST",
        mode: "no-cors",
        headers: { "Content-Type": "text/plain" },
        body: JSON.stringify({
          url: product.url,
          title: product.title || "",
          price: product.price,
          currency: product.currency || "USD",
          image: product.image || null,
          rating: product.rating || null,
          sold: product.sold || null,
          discount: null
        })
      }).catch(err => console.warn("فشل إرسال المنتج:", err));
    } catch (e) { /* ignore */ }
  }

  // ═══════════════════════════════════════════════════════
  // SEND SIMILAR PRODUCTS TO NEON
  // ═══════════════════════════════════════════════════════

  function sendSimilarToDB(parentUrl, similarList) {
    if (!parentUrl || !Array.isArray(similarList) || similarList.length === 0) return;
    if (parentUrl === lastSentSimilar) return;
    lastSentSimilar = parentUrl;

    try {
      const payload = similarList.map(s => ({
        parent_url: parentUrl,
        seller_title: s.store || "",
        product_url: normalizeToRawUrl(s.link || ""),
        price: s.price || 0,
        old_price: s.oldPrice || 0,
        discount: s.discount || 0,
        rating: s.rating || 0,
        sold_count: s.sold || 0,
        image_url: s.img || "",
        match_count: s.matchCount || 0,
        currency: s.currency || "USD",
        shipping_price: s.shippingPrice !== undefined ? s.shippingPrice : null,
        is_free_shipping: s.isFreeShipping !== undefined ? s.isFreeShipping : null
      })).filter(item => item.product_url);

      if (payload.length === 0) return;

      fetch(DB_SIMILAR_URL, {
        method: "POST",
        mode: "no-cors",
        headers: { "Content-Type": "text/plain" },
        body: JSON.stringify({ parent_url: parentUrl, items: payload })
      }).catch(err => console.warn("فشل إرسال المنتجات المشابهة:", err));
    } catch (e) { /* ignore */ }
  }

  function normalizeToRawUrl(url) {
    if (!url) return "";
    try {
      if (url.includes("s.click.aliexpress.com") || url.includes("aliexpress.com/e/_")) return url;
      const u = new URL(url);
      u.search = "";
      return u.toString();
    } catch (_) { return url; }
  }

  // ═══════════════════════════════════════════════════════
  // AFFILIATE LINKS
  // ═══════════════════════════════════════════════════════

  async function generateAffiliateLinks(sellersInput) {
    if (!sellersInput || sellersInput.length === 0) return sellersInput;
    const rawUrls = sellersInput.map(s => s.link).filter(url => url && url.includes("aliexpress") && !url.includes("s.click"));
    if (rawUrls.length === 0) return sellersInput.map(s => ({ ...s, displayLink: s.link }));

    try {
      const res = await fetch(AFFILIATE_LINK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ urls: rawUrls })
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "API error");

      const linkMap = extractAffiliateLinkMap(data.data);
      return sellersInput.map(s => {
        const affiliate = linkMap[s.link];
        return { ...s, affiliateLink: affiliate || null, displayLink: affiliate || s.link };
      });
    } catch (e) {
      return sellersInput.map(s => ({ ...s, displayLink: s.link }));
    }
  }

  function extractAffiliateLinkMap(apiData) {
    const map = {};
    try {
      const links = apiData?.aliexpress_affiliate_link_generate_response
        ?.resp_result?.result?.promotion_links?.promotion_link || [];
      for (const item of links) {
        const sourceUrl = item.source_value || item.source_url;
        const promoUrl = item.promotion_link;
        if (sourceUrl && promoUrl) {
          map[sourceUrl] = promoUrl;
          map[normalizeToRawUrl(sourceUrl)] = promoUrl;
        }
      }
    } catch (e) { /* ignore */ }
    return map;
  }

  // ═══════════════════════════════════════════════════════
  // CACHE
  // ═══════════════════════════════════════════════════════

  function cacheKey(product) { return `ss-cache:${product.url}`; }
  function saveCache(product, sellers, source) {
    try { localStorage.setItem(cacheKey(product), JSON.stringify({ sellers, source, ts: Date.now() })); } catch (_) {}
  }
  function loadCache(product) {
    try {
      const raw = localStorage.getItem(cacheKey(product));
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (Date.now() - data.ts > CACHE_TTL) return null;
      return data;
    } catch (_) { return null; }
  }
  function clearCache(product) {
    try { localStorage.removeItem(cacheKey(product)); } catch (_) {}
  }

  async function loadFromDB(parentUrl) {
    try {
      const res = await fetch(`${WORKER_URL}/similar?parent_url=${encodeURIComponent(parentUrl)}`);
      const data = await res.json();
      return (data.rows || []).map(row => ({
        store: row.seller_title,
        img: row.image_url,
        price: parseFloat(row.price),
        oldPrice: parseFloat(row.old_price),
        discount: row.discount || 0,
        rating: parseFloat(row.rating),
        sold: row.sold_count,
        link: row.product_url,
        matchCount: row.match_count,
        currency: row.currency || "USD",
        shippingPrice: (row.shipping_price !== null && row.shipping_price !== undefined) ? parseFloat(row.shipping_price) : null,
        isFreeShipping: (row.is_free_shipping !== null && row.is_free_shipping !== undefined) ? row.is_free_shipping : null,
        _cachedAt: row.updated_at || row.scraped_at
      }));
    } catch (e) { return null; }
  }

  function isFresh(items) {
    if (!items.length) return false;
    const cachedAt = items[0]._cachedAt;
    if (!cachedAt) return false;
    return (Date.now() - new Date(cachedAt).getTime()) < DB_CACHE_TTL_MS;
  }

  // ═══════════════════════════════════════════════════════
  // CURRENCY
  // ═══════════════════════════════════════════════════════

  function detectCurrency() {
    const txt = document.body.innerText || "";
    if (/\bDA\s*[\d,]/i.test(txt)) return "DA";
    if (/\bUS\s*\$/i.test(txt) || /\$[\d,]+\.\d{2}/.test(txt)) return "USD";
    if (/\bEUR\b|€/.test(txt)) return "EUR";
    if (/\bGBP\b|£/.test(txt)) return "GBP";
    if (/﷼|SAR/.test(txt)) return "SAR";
    if (/₺|TRY/.test(txt)) return "TRY";
    if (/₽|RUB/.test(txt)) return "RUB";
    if (/¥|CNY/.test(txt)) return "CNY";
    return "USD";
  }

  function extractNumbers(text) {
    if (!text) return [];
    const normalized = text
      .replace(/[٠-٩]/g, d => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
      .replace(/[۰-۹]/g, d => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
      .replace(/[,\u066C\u00A0]/g, "");
    const results = [];
    const patterns = [
      /US\s*\$\s*([\d]+\.?\d{0,2})/g,
      /\$\s*([\d]+\.?\d{0,2})/g,
      /DA\s*([\d]+\.?\d{0,2})/g,
      /€\s*([\d]+\.?\d{0,2})/g,
      /£\s*([\d]+\.?\d{0,2})/g,
      /¥\s*([\d]+\.?\d{0,2})/g,
      /₽\s*([\d]+\.?\d{0,2})/g,
      /₺\s*([\d]+\.?\d{0,2})/g,
    ];
    for (const re of patterns) {
      let m;
      while ((m = re.exec(normalized)) !== null) {
        const v = parseFloat(m[1]);
        if (v > 0) results.push({ value: v, raw: m[0], index: m.index });
      }
    }
    return results;
  }

  function formatPrice(v, currency) {
    if (v == null) return "—";
    const symbolMap = { USD: "$", EUR: "€", GBP: "£", SAR: "﷼", DA: "DA ", TRY: "₺", RUB: "₽", CNY: "¥", DZD: "DA " };
    const sym = symbolMap[currency] || "$";
    const num = v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return IS_RTL ? `${num} ${sym.trim()}` : `${sym}${num}`;
  }

  function isExcludedContext(ctx) {
    return /(pieces|pcs|piece|bulk|wholesale|minimum|per piece|\d+\s*\+|installment|x\s*\$|×\s*\$|off\s+on|off\s+us|save|saving|coupon|discount\s+\$|reduction|with\s+coins|extra\s+%|tax)/i.test(ctx);
  }

  // ═══════════════════════════════════════════════════════
  // PRODUCT ID / MODEL / BRAND / SPECS
  // ═══════════════════════════════════════════════════════

  function extractProductId(url) {
    if (!url) return null;
    const m = url.match(/\/item\/(\d+)\.html/);
    return m ? m[1] : null;
  }

  function extractModelNumbers(text) {
    if (!text) return [];
    const models = new Set();
    const patterns = [
      /\b([A-Z]{1,4}[\s-]?\d{2,5}[A-Z]?)\b/g,
      /\b([A-Z]\d{3,5}[A-Z]?)\b/g,
      /\b(iPhone\s*\d{1,2}\s*(Pro|Max|Plus|Mini)?)\b/gi,
      /\b(Galaxy\s*[A-Z]\d{1,2}\s*(Ultra|Plus)?)\b/gi,
      /\b(Redmi\s*Note\s*\d{1,2}\s*(Pro)?)\b/gi,
      /\b(Pro|Plus|Max|Ultra|Lite|Mini|SE)\b/gi,
      /\b(\d{1,3}\s*(?:GB|TB|ml|mAh))\b/gi,
    ];
    for (const re of patterns) {
      let m;
      while ((m = re.exec(text)) !== null) {
        const v = m[1].toUpperCase().replace(/\s+/g, " ").trim();
        if (v.length >= 2 && v.length <= 25) models.add(v);
      }
    }
    return [...models];
  }

  function extractBrands(text) {
    if (!text) return [];
    const brands = ["Sony","JBL","Bose","Samsung","Apple","Xiaomi","Huawei","Anker","Beats","Sennheiser","Logitech","Razer","Corsair","HyperX","SteelSeries","Philips","Panasonic","LG","Nike","Adidas","Puma","Reebok","Dyson","Redmi","POCO","Realme","OnePlus","Oppo","Vivo","Google","Dell","HP","Lenovo","Asus","Acer","MSI","Toshiba","Canon","Nikon","GoPro","DJI","Fitbit","Garmin"];
    const upper = text.toUpperCase();
    return brands.filter(b => upper.includes(b.toUpperCase()));
  }

  function extractSpecs(text) {
    if (!text) return [];
    const specs = new Set();
    const patterns = [
      /\b(\d{1,4})\s*(GB|TB)\b/gi,
      /\b(\d{1,5})\s*(mAh)\b/gi,
      /\b(\d{1,3})\s*(W|V|Hz|kHz)\b/gi,
      /\b(\d{1,3})\s*(mm|cm|inch|in)\b/gi,
      /\b(4K|8K|1080P|2K|HD|UHD)\b/gi,
      /\b(5G|4G|LTE|WiFi|Wi-Fi|BT|Bluetooth)\s*(\d(?:\.\d)?)?\b/gi,
      /\b(IP[X]?\d{1,2})\b/gi,
      /\b(USB|Type-?C|Micro-?USB)\s*(\d(?:\.\d)?)?\b/gi,
      /\b(ANC|ENC|TWS|HDR|NFC|GPS)\b/gi,
    ];
    for (const re of patterns) {
      let m;
      while ((m = re.exec(text)) !== null) {
        const v = m[0].toUpperCase().replace(/\s+/g, "");
        specs.add(v);
      }
    }
    return [...specs];
  }

  function countSpecMatches(text, specs) {
    if (!text || !specs.length) return { matched: 0, total: specs.length, ratio: 0 };
    const upper = text.toUpperCase().replace(/\s+/g, "");
    let matched = 0;
    for (const s of specs) if (upper.includes(s.replace(/\s+/g, ""))) matched++;
    return { matched, total: specs.length, ratio: matched / specs.length };
  }

  // ═══════════════════════════════════════════════════════
  // PRICE EXTRACTION
  // ═══════════════════════════════════════════════════════

  function getPriceInfo() {
    try {
      const scripts = document.querySelectorAll('script[type="application/ld+json"]');
      for (const s of scripts) {
        const data = JSON.parse(s.textContent || "{}");
        const offer = data.offers ? (Array.isArray(data.offers) ? data.offers[0] : data.offers) : null;
        if (offer?.price) {
          const v = parseFloat(offer.price);
          if (v > 0.5) return { price: v, currency: offer.priceCurrency || "USD" };
        }
      }
    } catch (_) {}

    const metaSels = ["meta[property='product:price:amount']", "meta[property='og:price:amount']", "meta[itemprop='price']"];
    for (const sel of metaSels) {
      const m = document.querySelector(sel);
      if (m) {
        const v = parseFloat(m.getAttribute("content"));
        if (v > 0.5) return { price: v, currency: detectCurrency() };
      }
    }

    const allPriceEls = document.querySelectorAll("[class*='price'], [class*='Price']");
    const candidates = [];
    for (const el of allPriceEls) {
      const cls = (el.className || "").toString().toLowerCase();
      const style = (el.getAttribute("style") || "").toLowerCase();
      if (/(old|origin|del|cross|through|before|strike)/i.test(cls)) continue;
      if (/line-through/.test(style)) continue;
      if (/(coupon|off|save|discount|reduce|promo|voucher)/i.test(cls)) continue;
      if (/(bulk|wholesale|minimum|quantity|tier)/i.test(cls)) continue;
      const txt = (el.innerText || "").trim();
      if (!txt || isExcludedContext(txt)) continue;
      const nums = extractNumbers(txt);
      if (!nums.length) continue;
      const value = nums[0].value;
      if (value < 3) continue;
      const isCurrent = /(current|sale|now|main|primary|actual)/i.test(cls);
      const fontSize = parseFloat(window.getComputedStyle(el).fontSize) || 12;
      candidates.push({ value, isCurrent, fontSize });
    }
    if (candidates.length) {
      candidates.sort((a, b) => {
        if (a.isCurrent !== b.isCurrent) return a.isCurrent ? -1 : 1;
        return b.fontSize - a.fontSize;
      });
      return { price: candidates[0].value, currency: detectCurrency() };
    }
    return { price: null, currency: "USD" };
  }

  function getTitle() {
    const sels = ["h1[data-pl='product-title']", ".product-title-text", ".pdp-comp-title", "[class*='title--wrap'] h1", "[class*='product-title']", "h1.product-title"];
    for (const sel of sels) {
      const el = document.querySelector(sel);
      if (el) {
        const t = el.innerText?.trim();
        if (t && t.length > 8) return t;
      }
    }
    const meta = document.querySelector("meta[property='og:title']");
    return meta?.getAttribute("content")?.trim() || document.title;
  }

  function getImage() {
    const meta = document.querySelector("meta[property='og:image']");
    if (meta) {
      const c = meta.getAttribute("content");
      if (c && c.startsWith("http")) return c;
    }
    return "";
  }

  function getSold() {
    const sels = ["[class*='sold--']", ".product-reviewer-sold", "[class*='soldCount']"];
    for (const sel of sels) {
      const el = document.querySelector(sel);
      if (!el) continue;
      const m = (el.innerText || "").match(/([\d.,]+)\s*(k|K)?/);
      if (m) {
        let n = parseFloat(m[1].replace(/,/g, ""));
        if (m[2]) n *= 1000;
        if (n > 0) return Math.round(n);
      }
    }
    return null;
  }

  function getRating() {
    const ariaEls = document.querySelectorAll("[aria-label*='star'], [aria-label*='rating']");
    for (const el of ariaEls) {
      const label = el.getAttribute("aria-label") || "";
      const m = label.match(/([\d.]+)\s*(out of|stars?|rating)/i);
      if (m) {
        const r = parseFloat(m[1]);
        if (r > 0 && r <= 5) return r;
      }
    }
    return null;
  }

  function extractProduct() {
    const priceInfo = getPriceInfo();
    return {
      title: getTitle(),
      image: getImage(),
      price: priceInfo.price,
      currency: priceInfo.currency,
      sold: getSold(),
      rating: getRating(),
      url: location.href.split("?")[0],
    };
  }

  const BAD_PATTERNS = ["star", "placeholder", "loading", "default", "empty", "blank", "no-image", "noimage", "grey", "gray", "spacer", "pixel", "transparent", "1x1"];

  function isBadImage(src) {
    if (!src || !src.startsWith("http")) return true;
    const low = src.toLowerCase();
    for (const p of BAD_PATTERNS) if (low.includes(p)) return true;
    return false;
  }

  function getImgSrc(img) {
    if (!img) return "";
    if (img.currentSrc && !isBadImage(img.currentSrc)) return img.currentSrc;
    const srcset = img.getAttribute("srcset");
    if (srcset) {
      const entries = srcset.split(",").map(s => s.trim().split(" ")[0]);
      for (let i = entries.length - 1; i >= 0; i--) if (!isBadImage(entries[i])) return entries[i];
    }
    const dataSrc = img.getAttribute("data-src");
    if (dataSrc && !isBadImage(dataSrc)) return dataSrc.startsWith("//") ? "https:" + dataSrc : dataSrc;
    if (img.src && !isBadImage(img.src)) return img.src;
    return "";
  }

  function extractRealImage(card) {
    for (const img of card.querySelectorAll("img")) {
      const src = getImgSrc(img);
      if (src) return src;
    }
    return "";
  }

  async function autoScroll() {
    const originalY = window.scrollY;
    let lastHeight = document.body.scrollHeight;
    for (let i = 0; i < 10; i++) {
      window.scrollBy(0, 700);
      await sleep(200);
      const newHeight = document.body.scrollHeight;
      if (newHeight === lastHeight && i > 4) break;
      lastHeight = newHeight;
    }
    window.scrollTo(0, originalY);
    await sleep(300);
    await waitForImages();
  }

  function waitForImages() {
    return new Promise((resolve) => {
      const imgs = Array.from(document.querySelectorAll("img"));
      const pending = imgs.filter(img => !img.complete);
      if (pending.length === 0) return resolve();
      let loaded = 0;
      const total = pending.length;
      const timer = setTimeout(resolve, 2500);
      pending.forEach(img => {
        const done = () => { loaded++; if (loaded >= total) { clearTimeout(timer); resolve(); } };
        img.addEventListener("load", done, { once: true });
        img.addEventListener("error", done, { once: true });
      });
    });
  }

  async function waitForStablePage(maxWait = 6000) {
    const start = Date.now();
    let lastCount = 0, stable = 0;
    while (Date.now() - start < maxWait) {
      const links = document.querySelectorAll("a[href*='/item/']").length;
      if (links === lastCount && links > 5) { stable++; if (stable >= 3) return true; }
      else stable = 0;
      lastCount = links;
      await sleep(250);
    }
    return false;
  }

  const STOP_WORDS = new Set([
    "for","with","and","the","a","an","of","to","in","on","at","by","is","original","new","hot","sale","free","shipping","best","top","quality","high","wholesale","dropshipping","factory","brand","genuine","fast","delivery","1pc","2pcs","3pcs","pcs","set","pack","style","type","you","your","this","that","from","into","only","more","all","any","good","great","item","product","pieces","piece",
    "من","في","على","إلى","مع","عن","هذا","هذه","ذلك","التي","الذي","أو","و","ثم","لكن","حتى","بعد","قبل","كل","بعض","أي","لا","ما","هو","هي","كان","يكون","جدا","أكثر","أقل","جديد","جديدة","الأصلي","الأصلية","الآن","اليوم","سعر","أسعار","شحن","مجاني","مجانا","بيع","شراء","منتج","منتجات","عالية","جودة","أفضل","أحسن","رخيص","حديث","حديثة","متطور","متطورة","قابل","قابلة",
    "pour","avec","et","le","la","les","un","une","des","de","du","au","ce","cette","ces","son","sa","ses","dans","sur","par","vers","est","sont","être","avoir","très","plus","moins","tout","tous","nouveau","nouvelle","original","meilleur","haute","qualité","livraison","gratuit","vente","produit","produits","prix",
    "para","con","y","el","la","los","las","un","una","de","del","al","este","esta","en","por","es","son","ser","estar","muy","más","menos","todo","todos","nuevo","nueva","mejor","alta","calidad","envío","gratis","venta","producto","productos",
    "für","mit","und","der","die","das","den","dem","des","ein","eine","einem","eines","dieser","diese","dieses","auf","zu","nach","ist","sind","sein","haben","sehr","mehr","weniger","alle","neu","neue","original","beste","bester","hohe","qualität","versand","kostenlos","verkauf","produkt","produkte",
  ]);

  function keywords(text) {
    if (!text) return [];
    return text.replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/)
      .map(w => w.trim().toLowerCase())
      .filter(w => w.length > 2 && !STOP_WORDS.has(w) && !/^\d+$/.test(w));
  }

  function countMatches(text, kw) {
    if (!text || !kw.length) return 0;
    const words = keywords(text);
    const set = new Set(words);
    let m = 0;
    for (const k of kw) if (set.has(k)) m++;
    return m;
  }

  function extractPriceInfoFromCard(card) {
    const txt = card.innerText || "";
    let discount = 0;
    const dMatch = txt.match(/[-−]\s*(\d{1,2})\s*%/);
    if (dMatch) discount = parseInt(dMatch[1], 10);

    const priceEls = card.querySelectorAll("[class*='price'], [class*='Price']");
    let current = 0, old = 0;
    for (const el of priceEls) {
      const cls = (el.className || "").toString().toLowerCase();
      const style = (el.getAttribute("style") || "").toLowerCase();
      const elTxt = (el.innerText || "").trim();
      if (!elTxt) continue;
      const isOld = /(old|origin|del|through|cross|before|strike)/i.test(cls) || /line-through/.test(style);
      const nums = extractNumbers(elTxt);
      if (!nums.length) continue;
      if (isExcludedContext(elTxt)) continue;
      const v = nums[0].value;
      if (v < 0.5) continue;
      if (isOld) { if (v > old) old = v; }
      else { if (v > current) current = v; }
    }

    if (old > 0 && discount > 0 && discount < 90) {
      const expected = old * (1 - discount / 100);
      if (!current || Math.abs(current - expected) / expected > 0.4) current = Math.round(expected * 100) / 100;
    }
    if (!current) {
      const numbers = extractNumbers(txt);
      const valid = [];
      for (const n of numbers) {
        if (n.value < 0.5) continue;
        const s = Math.max(0, n.index - 60);
        const e = Math.min(txt.length, n.index + 70);
        if (isExcludedContext(txt.slice(s, e))) continue;
        valid.push(n.value);
      }
      if (valid.length) {
        valid.sort((a, b) => a - b);
        current = valid[valid.length - 1];
        if (valid.length > 1 && current / valid[0] > 1.15) old = current;
      }
    }
    if (old > 0 && old <= current) old = 0;
    if (discount < 0 || discount > 90) discount = 0;
    if (!discount && old > current && current > 0) discount = Math.round((1 - current / old) * 100);
    return { price: current, oldPrice: old, discount };
  }

  function extractTitleFromCard(card) {
    const lines = (card.innerText || "").split("\n").map(l => l.trim()).filter(l => {
      if (l.length < 10 || l.length > 200) return false;
      if (/^\$|^US|^★|^[\d.,%]+$/.test(l)) return false;
      if (/^(free shipping|choice|save|new|hot|sale)$/i.test(l)) return false;
      if (/^[-−]\s*\d+\s*%/.test(l)) return false;
      return true;
    });
    return lines[0] || "";
  }

  function shortenTitle(t) { return t ? t.slice(0, 65).trim() : ""; }

  function extractSoldFromCard(card) {
    const m = (card.innerText || "").match(/([\d,]+)\s*(sold|orders|مباع|طلبات|vendus|vendidos|verkauft)/i);
    if (m) {
      let n = parseFloat(m[1].replace(/,/g, ""));
      if (/ألف|k|千|천/i.test(m[0])) n *= 1000;
      return Math.round(n);
    }
    return 0;
  }

  function extractRatingFromCard(card) {
    const txt = card.innerText || "";
    const m = txt.match(/★\s*([\d.]+)|([\d.]+)\s*★/);
    if (m) {
      const r = parseFloat(m[1] || m[2]);
      if (r > 0 && r <= 5) return r;
    }
    return 0;
  }

  function findCardContainer(link) {
    let cur = link;
    for (let i = 0; i < 6 && cur; i++) {
      cur = cur.parentElement;
      if (!cur) return null;
      if (cur.querySelector("img") && (cur.innerText || "").length > 15 && cur.offsetWidth > 100 && cur.offsetHeight > 80) return cur;
    }
    return null;
  }

  function collectCandidates(currentKeywords, currentModels, currentBrands, currentSpecs, cp) {
    const results = [];
    const seen = new Set();
    const currentUrl = location.href.split("?")[0];
    const currentProductId = extractProductId(currentUrl);
    const links = document.querySelectorAll("a[href*='/item/']");

    for (const link of links) {
      try {
        const href = link.href.split("?")[0];
        if (!href || href === currentUrl || seen.has(href)) continue;
        const candidateId = extractProductId(href);
        if (currentProductId && candidateId && currentProductId === candidateId) continue;
        const card = findCardContainer(link);
        if (!card) continue;
        const img = extractRealImage(card);
        if (!img) continue;
        const priceInfo = extractPriceInfoFromCard(card);
        if (!priceInfo.price) continue;
        const title = extractTitleFromCard(card);
        if (!title || title.length < 8) continue;

        const upperTitle = title.toUpperCase();
        if (currentModels.length > 0) {
          const matched = currentModels.filter(m => upperTitle.includes(m));
          if (matched.length === 0) continue;
        }
        if (currentBrands.length > 0) {
          const matched = currentBrands.filter(b => upperTitle.includes(b.toUpperCase()));
          if (matched.length === 0) continue;
        }
        const specResult = countSpecMatches(title, currentSpecs);
        if (currentSpecs.length >= 2 && specResult.ratio < 0.7) continue;

        const matchCount = countMatches(title, currentKeywords);
        const totalKeywords = currentKeywords.length;
        const matchRatio = totalKeywords > 0 ? matchCount / totalKeywords : 0;
        const isStrictKeywordMatch = matchCount >= 4 || (totalKeywords <= 5 && matchCount >= 3) || matchRatio >= 0.6;
        if (!isStrictKeywordMatch) continue;

        const priceRatio = cp ? priceInfo.price / cp : 1;
        if (cp && (priceRatio < 0.6 || priceRatio > 1.6)) continue;

        const sold = extractSoldFromCard(card);
        const rating = extractRatingFromCard(card);
        const shippingInfo = extractShippingFromCard(card);
        seen.add(href);
        const modelMatches = currentModels.length > 0 ? currentModels.filter(m => upperTitle.includes(m)).length : 0;
        const brandMatches = currentBrands.length > 0 ? currentBrands.filter(b => upperTitle.includes(b.toUpperCase())).length : 0;

        results.push({
          store: shortenTitle(title),
          img, price: priceInfo.price, oldPrice: priceInfo.oldPrice, discount: priceInfo.discount,
          rating, sold: sold || 0, link: href, matchCount, modelMatches, brandMatches,
          specMatches: specResult.matched, specTotal: specResult.total, specRatio: specResult.ratio, priceRatio,
          shippingPrice: shippingInfo.shippingPrice,
          isFreeShipping: shippingInfo.isFreeShipping
        });
      } catch (_) {}
    }
    console.log(`[Smart Shopper] ✅ Accepted: ${results.length}`);
    return results;
  }

  function pickBest(candidates, cp) {
    if (!candidates.length) return [];
    const scored = candidates.map(c => {
      let score = 0;
      score += c.modelMatches * 50;
      score += c.brandMatches * 30;
      score += c.specRatio * 100;
      score += c.matchCount * 12;
      if (cp && cp > 0) {
        const ratio = c.priceRatio;
        if (ratio >= 0.85 && ratio <= 1.15) score += 30;
        else if (ratio >= 0.7 && ratio <= 1.4) score += 15;
      }
      if (c.rating >= 4.5) score += 5;
      if (c.sold > 100) score += 3;
      if (c.discount > 20) score += 2;
      if (c.isFreeShipping === true) score += 4;
      return { ...c, _score: score };
    });
    scored.sort((a, b) => (b._score !== a._score ? b._score - a._score : a.price - b.price));
    return scored.slice(0, 50);
  }

  async function apiSearch(keyword) {
    const res = await fetch(`${WORKER_URL}/api/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ keyword, pageSize: 40, currency: "USD", country: "US" }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const payload = await res.json();
    if (!payload.ok) throw new Error(payload.error || "API error");
    const products = payload.data?.aliexpress_affiliate_product_query_response?.resp_result?.result?.products?.product || [];
    return products.map(p => {
      const price = parseFloat(p.target_sale_price || p.sale_price || 0);
      const oldP = parseFloat(p.target_original_price || p.original_price || 0);
      const discount = oldP > price && price > 0 ? Math.round((1 - price / oldP) * 100) : 0;
      const rating = parseFloat(String(p.evaluate_rate || "0").replace("%", "")) / 20;
      return {
        store: p.shop_name || "AliExpress Seller",
        img: p.product_main_image_url || "",
        price, oldPrice: oldP, discount,
        rating: rating > 0 && rating <= 5 ? +rating.toFixed(1) : 0,
        sold: parseInt(p.lastest_volume || 0, 10),
        link: p.product_detail_url || p.promotion_link || "",
        title: p.product_title || "",
        matchCount: 0, modelMatches: 0, brandMatches: 0, specRatio: 0, priceRatio: 1,
        shippingPrice: null,
        isFreeShipping: null
      };
    }).filter(s => s.price > 0 && s.img);
  }

  async function buildSellerList(product, forceRescan = false) {
    if (!forceRescan) {
      const cached = loadCache(product);
      if (cached && cached.sellers.length) return { source: cached.source, sellers: cached.sellers, fromCache: true };
    }
    const currentKeywords = keywords(product.title);
    const currentModels = extractModelNumbers(product.title);
    const currentBrands = extractBrands(product.title);
    const currentSpecs = extractSpecs(product.title);
    const cp = product?.price;

    await waitForStablePage(6000);
    await autoScroll();

    const candidates = collectCandidates(currentKeywords, currentModels, currentBrands, currentSpecs, cp);
    const best = pickBest(candidates, cp);

    if (best.length >= 1) {
      saveCache(product, best, "page");
      return { source: "page", sellers: best };
    }

    const englishWords = (product.title || "").replace(/[^\x00-\x7F\s]/g, "").split(/\s+/)
      .map(w => w.trim().toLowerCase())
      .filter(w => w.length > 3 && !STOP_WORDS.has(w));
    englishWords.sort((a, b) => b.length - a.length);

    const queries = [];
    if (englishWords.length >= 3) queries.push(englishWords.slice(0, 4).join(" "));
    if (englishWords.length >= 2) queries.push(englishWords.slice(0, 3).join(" "));
    if (englishWords.length >= 2) queries.push(englishWords.slice(1, 4).join(" "));

    for (const q of queries) {
      try {
        const items = await apiSearch(q);
        if (items.length === 0) continue;
        const strict = items.filter(it => {
          const upperTitle = (it.title || it.store || "").toUpperCase();
          if (currentModels.length > 0 && !currentModels.some(m => upperTitle.includes(m))) return false;
          if (currentBrands.length > 0 && !currentBrands.some(b => upperTitle.includes(b.toUpperCase()))) return false;
          const matchCount = countMatches(it.title || it.store, currentKeywords);
          if (matchCount < 4 && (currentKeywords.length > 5 || matchCount < 3)) return false;
          if (cp && (it.price < cp * 0.5 || it.price > cp * 1.8)) return false;
          return true;
        });
        if (strict.length >= 1) {
          const enriched = strict.map(it => ({ ...it, matchCount: countMatches(it.title || it.store, currentKeywords) }));
          saveCache(product, enriched, "api");
          return { source: "api", sellers: enriched };
        }
      } catch (e) { console.warn(e); }
    }

    return { source: "none", sellers: [] };
  }

  function buildPanel() {
    try {
      const old = document.getElementById(PANEL_ID);
      if (old) old.remove();

      const panel = document.createElement("div");
      panel.id = PANEL_ID;
      if (IS_RTL) panel.setAttribute("dir", "rtl");

      panel.innerHTML = `
        <div class="ss-header">
          <div class="ss-header-left">
            <div class="ss-logo">S</div>
            <div>
              <div class="ss-title">${T("title")}</div>
              <div class="ss-subtitle" id="ss-source">${T("scanning")}</div>
            </div>
          </div>
          <div class="ss-header-actions">
            <button class="ss-btn-icon" data-action="refresh" title="Refresh">↻</button>
            <button class="ss-btn-icon" data-action="minimize">−</button>
            <button class="ss-btn-icon" data-action="close">×</button>
          </div>
        </div>
        <div class="ss-current">
          <div class="ss-current-thumb"><img id="ss-cur-img" src="" alt=""></div>
          <div class="ss-current-info">
            <div class="ss-current-title" id="ss-cur-title">${T("scanning")}</div>
            <div class="ss-current-meta" id="ss-cur-meta"></div>
          </div>
        </div>
        <div class="ss-filters" id="ss-filters">
          <button class="ss-chip ss-active" data-f="best">${T("bestValue")}</button>
          <button class="ss-chip" data-f="cheap">${T("cheapest")}</button>
          <button class="ss-chip" data-f="discount">${T("bestDiscount")}</button>
          <button class="ss-chip" data-f="sold">${T("mostSold")}</button>
        </div>
        <div class="ss-list" id="ss-list"></div>
        <div class="ss-footer">${T("footer")}</div>
      `;
      document.body.appendChild(panel);

      panel.querySelector("[data-action='close']").addEventListener("click", () => panel.classList.add("ss-hidden"));
      panel.querySelector("[data-action='minimize']").addEventListener("click", () => {
        minimized = !minimized;
        panel.classList.toggle("ss-minimized", minimized);
        panel.querySelector("[data-action='minimize']").textContent = minimized ? "+" : "−";
      });
      panel.querySelector("[data-action='refresh']").addEventListener("click", async () => {
        if (isScanning) return;
        clearCache(currentProduct);
        lastSentSimilar = "";
        await doScan(true);
      });
      panel.querySelector("#ss-filters").addEventListener("click", (e) => {
        const chip = e.target.closest(".ss-chip");
        if (!chip) return;
        activeFilter = chip.dataset.f;
        panel.querySelectorAll(".ss-chip").forEach(c => c.classList.toggle("ss-active", c === chip));
        renderList();
      });

      makeDraggable(panel);
      restorePanelPosition(panel);
      renderCurrentProduct();
      renderLoading();
    } catch (e) {
      console.error("[Smart Shopper] فشل بناء اللوحة:", e);
    }
  }

  async function doScan(forceRescan = false) {
    if (isScanning) return;
    isScanning = true;
    renderLoading();

    try {
      if (!forceRescan) {
        const dbCached = await loadFromDB(currentProduct.url);
        if (dbCached && dbCached.length > 0 && isFresh(dbCached)) {
          sellers = await generateAffiliateLinks(dbCached);
          dataSource = "cache";
          updateSourceLabel();
          renderList();
          isScanning = false;
          // ⭐ حدّث الأسعار والشحن في الخلفية حتى من Cache
          fetchRealPricesBatch(sellers).catch(() => {});
          return;
        }
      }

      const result = await buildSellerList(currentProduct, forceRescan);
      sellers = result.sellers;
      dataSource = result.source;
      updateSourceLabel();
      renderList();

      if (sellers.length > 0) sendSimilarToDB(currentProduct.url, sellers);

      // ⭐ اطلب الأسعار + الشحن من HTML لكل المصادر
      if (sellers.length > 0) {
        console.log(`[Smart Shopper] 🔄 تحديث الأسعار + الشحن لـ ${sellers.length} منتج...`);
        fetchRealPricesBatch(sellers).then(() => {
          try { saveCache(currentProduct, sellers, dataSource); } catch (_) {}
        }).catch(() => {});
      }
    } catch (e) {
      console.error("[Smart Shopper] Scan failed:", e);
      sellers = [];
      renderEmpty();
    } finally {
      isScanning = false;
    }
  }

  function updateSourceLabel() {
    const el = document.getElementById("ss-source");
    if (!el) return;
    const map = { page: T("sameProduct"), api: T("similarApi"), cache: "⚡ Cache", none: T("noAlt") };
    el.textContent = map[dataSource] || T("scanning");
  }

  function renderCurrentProduct() {
    if (!currentProduct) return;
    const img = document.getElementById("ss-cur-img");
    const title = document.getElementById("ss-cur-title");
    const meta = document.getElementById("ss-cur-meta");
    if (img) {
      if (currentProduct.image) { img.src = currentProduct.image; img.onerror = () => { img.style.display = "none"; }; }
      else img.style.display = "none";
    }
    if (title) title.textContent = currentProduct.title || "—";
    if (meta) {
      const parts = [];
      if (currentProduct.price != null) parts.push(`<strong>${formatPrice(currentProduct.price, currentProduct.currency)}</strong>`);
      if (currentProduct.rating != null) parts.push(`★ ${currentProduct.rating}`);
      if (currentProduct.sold != null) parts.push(`${fmt(currentProduct.sold)} ${T("sold")}`);
      meta.innerHTML = parts.join(' <span style="color:#a1a1aa">·</span> ');
    }
  }

  function renderLoading() {
    const list = document.getElementById("ss-list");
    if (!list) return;
    list.innerHTML = Array.from({ length: 3 }).map(() => `
      <div class="ss-skeleton-row">
        <div class="ss-sk ss-sk-rank"></div>
        <div class="ss-sk ss-sk-thumb"></div>
        <div class="ss-sk-lines">
          <div class="ss-sk ss-sk-line" style="width:75%"></div>
          <div class="ss-sk ss-sk-line" style="width:45%"></div>
        </div>
      </div>
    `).join("");
  }

  function renderEmpty() {
    const list = document.getElementById("ss-list");
    if (!list) return;
    list.innerHTML = `
      <div style="padding: 24px 16px; text-align:center;">
        <div style="font-size:12.5px;font-weight:600;color:#09090b;margin-bottom:6px;">${T("noProducts")}</div>
        <div style="font-size:11px;color:#a1a1aa;line-height:1.55;margin-bottom:12px;">${T("noProductsSub")}</div>
        <button id="ss-retry" style="background:#09090b;color:#fff;border:none;padding:7px 14px;border-radius:6px;font-size:11px;font-weight:600;cursor:pointer;font-family:inherit;">${T("scanAgain")}</button>
      </div>
    `;
    document.getElementById("ss-retry")?.addEventListener("click", () => { clearCache(currentProduct); lastSentSimilar = ""; doScan(true); });
  }

  function renderList() {
    const list = document.getElementById("ss-list");
    if (!list) return;
    if (!sellers.length) return renderEmpty();

    const items = sortSellers(sellers, activeFilter);
    const cp = currentProduct?.price || 0;
    const minPrice = Math.min(...items.map(s => s.price));

    list.innerHTML = items.slice(0, 10).map((s, i) => {
      const rank = i + 1;
      const isCheap = s.price === minPrice;
      const pricePercent = cp ? Math.round((1 - s.price / cp) * 100) : 0;
      const rowClass = rank === 1 ? "ss-best" : (isCheap ? "ss-cheap" : "");
      const rankClass = rank <= 3 ? `ss-r${rank}` : "";

      let tag = "";
      if (activeFilter === "cheap" && rank === 1) tag = `<span class="ss-tag ss-cheap">${T("cheapestTag")}</span>`;
      else if (activeFilter === "discount" && rank === 1) tag = `<span class="ss-tag ss-hot">${T("bestDeal")}</span>`;
      else if (activeFilter === "sold" && rank === 1) tag = `<span class="ss-tag ss-top">${T("mostSoldTag")}</span>`;
      else if (activeFilter === "best" && rank === 1) tag = `<span class="ss-tag ss-best">${T("bestValueTag")}</span>`;
      else if (isCheap && cp) tag = `<span class="ss-tag ss-cheap">${T("bestPrice")}</span>`;

      const discountBadge = s.discount > 0 ? `<span class="ss-discount">-${s.discount}%</span>` : "";
      const oldPriceHtml = s.oldPrice > 0 ? `<span class="ss-old-price">${formatPrice(s.oldPrice, currentProduct?.currency)}</span>` : "";
      const ratingHtml = s.rating > 0 ? `<span class="ss-rating">★ ${s.rating.toFixed(1)}</span>` : "";
      const soldHtml = s.sold > 0 ? `<span class="ss-sold">${fmt(s.sold)} ${T("sold")}</span>` : "";
      const metaItems = [ratingHtml, soldHtml].filter(Boolean).join('<span class="ss-sep">·</span>');
      const saveStr = pricePercent > 0 ? `−${pricePercent}%` : (pricePercent < 0 ? `+${Math.abs(pricePercent)}%` : "");

      let shippingLineHtml = "";
      if (s.shippingPrice === 0) {
        shippingLineHtml = `<div class="ss-ship-free">🚚 Free shipping</div>`;
      } else if (s.shippingPrice && s.shippingPrice > 0) {
        shippingLineHtml = `<div class="ss-ship-paid">+ ${formatPrice(s.shippingPrice, currentProduct?.currency)} shipping</div>`;
      }

      return `
        <div class="ss-row ${rowClass}" data-idx="${i}">
          ${tag}
          <div class="ss-rank ${rankClass}">${rank}</div>
          <div class="ss-thumb"><img src="${s.img}" loading="lazy" onerror="this.parentElement.style.display='none'"></div>
          <div class="ss-info">
            <div class="ss-store">${esc(s.store)}</div>
            <div class="ss-meta">${metaItems}</div>
          </div>
          <div class="ss-price-col">
            <div class="ss-price-line">
              <span class="ss-price-now">${formatPrice(s.price, currentProduct?.currency)}</span>
              ${discountBadge}
            </div>
            ${shippingLineHtml}
            ${oldPriceHtml ? `<div class="ss-old-line">${oldPriceHtml}</div>` : ""}
            ${cp && saveStr ? `<div class="ss-vs">${T("vs")} ${formatPrice(cp, currentProduct?.currency)} <b>${saveStr}</b></div>` : ""}
          </div>
        </div>
      `;
    }).join("");

    list.querySelectorAll(".ss-row").forEach(row => {
      row.addEventListener("click", () => {
        const item = items[+row.dataset.idx];
        const url = item?.displayLink || item?.affiliateLink || item?.link;
        if (url) window.open(url, "_blank", "noopener");
      });
    });
  }

  function makeDraggable(panel) {
    const header = panel.querySelector(".ss-header");
    if (!header) return;
    let isDragging = false, startX, startY, startLeft, startTop;
    header.addEventListener("mousedown", (e) => {
      if (e.target.closest(".ss-btn-icon")) return;
      e.preventDefault();
      isDragging = true;
      panel.classList.add("ss-dragging");
      const rect = panel.getBoundingClientRect();
      startX = e.clientX; startY = e.clientY;
      startLeft = rect.left; startTop = rect.top;
      panel.style.right = "auto"; panel.style.left = startLeft + "px"; panel.style.top = startTop + "px";
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    });
    function onMove(e) {
      if (!isDragging) return;
      const dx = e.clientX - startX, dy = e.clientY - startY;
      panel.style.left = Math.max(4, Math.min(startLeft + dx, window.innerWidth - panel.offsetWidth - 4)) + "px";
      panel.style.top = Math.max(4, Math.min(startTop + dy, window.innerHeight - panel.offsetHeight - 4)) + "px";
    }
    function onUp() {
      isDragging = false; panel.classList.remove("ss-dragging");
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      try { localStorage.setItem("ss-panel-pos", JSON.stringify({ left: panel.style.left, top: panel.style.top })); } catch (_) {}
    }
  }

  function restorePanelPosition(panel) {
    try {
      const saved = localStorage.getItem("ss-panel-pos");
      if (!saved) return;
      const { left, top } = JSON.parse(saved);
      if (left && top) { panel.style.right = "auto"; panel.style.left = left; panel.style.top = top; }
    } catch (_) {}
  }

  function valueScore(s) {
    const cp = currentProduct?.price || 0;
    const priceScore = cp ? (cp - s.price) / cp : 0;
    const soldScore = Math.min((s.sold || 0) / 5000, 1);
    const discountScore = Math.min((s.discount || 0) / 60, 1);
    const matchScore = Math.min((s.matchCount || 0) / 5, 1);
    const modelScore = Math.min((s.modelMatches || 0) / 3, 1);
    const shippingBonus = s.isFreeShipping === true ? 0.05 : 0;
    return priceScore * 0.2 + soldScore * 0.1 + discountScore * 0.15 + matchScore * 0.25 + modelScore * 0.3 + shippingBonus;
  }

  function sortSellers(arr, f) {
    const copy = [...arr];
    if (f === "cheap") return copy.sort((a, b) => a.price - b.price);
    if (f === "discount") return copy.sort((a, b) => (b.discount || 0) - (a.discount || 0));
    if (f === "sold") return copy.sort((a, b) => (b.sold || 0) - (a.sold || 0));
    return copy.sort((a, b) => valueScore(b) - valueScore(a));
  }

  const esc = (s) => { const d = document.createElement("div"); d.textContent = s; return d.innerHTML; };
  const fmt = (n) => n >= 1000 ? (n / 1000).toFixed(1).replace(".0", "") + "k" : n;
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  async function run() {
    await sleep(1500);

    if (!location.href.includes("/item/") && !location.href.includes("/i/")) return;

    let attempts = 0;
    while (attempts < 15) {
      attempts++;
      try {
        currentProduct = extractProduct();
        if (currentProduct && currentProduct.title && currentProduct.title.length >= 5 && currentProduct.price > 0) break;
      } catch (_) {}
      await sleep(1500);
    }

    if (!currentProduct || !currentProduct.title || !currentProduct.price || currentProduct.price <= 0) return;

    buildPanel();
    sendProductToDB(currentProduct);

    try { await doScan(false); } catch (e) { console.error(e); }
  }

  chrome.runtime.onMessage.addListener((msg, _s, res) => {
    if (msg.type === "GET_PRODUCT") {
      try { res({ ok: true, product: extractProduct() }); }
      catch (e) { res({ ok: false, error: String(e) }); }
      return true;
    }
  });

  let lastUrl = location.href;
  new MutationObserver(() => {
    const url = location.href;
    if (url !== lastUrl) {
      lastUrl = url;
      if (!url.includes("/item/") && !url.includes("/i/")) return;
      setTimeout(() => {
        try {
          const product = extractProduct();
          if (product.title && product.title.length > 5 && product.price > 0) {
            currentProduct = product;
            lastSentSimilar = "";
            sendProductToDB(product);
            buildPanel();
            doScan(false);
          }
        } catch (_) {}
      }, 3000);
    }
  }).observe(document, { subtree: true, childList: true });

  run();
  console.log(`[Smart Shopper] v40 ready.`);
})();