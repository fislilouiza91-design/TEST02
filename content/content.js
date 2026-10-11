/* ═══════════════════════════════════════════════════════
   Smart Shopper — Content Script (v44 ULTIMATE)
   Multi-image hash + Category + Fuzzy match + Cache.
   ═══════════════════════════════════════════════════════ */

(function () {
  "use strict";

  if (window.__SMART_SHOPPER_LOADED__) return;
  window.__SMART_SHOPPER_LOADED__ = true;

  const T = typeof SS_T === "function" ? SS_T : (k) => k;
  const LANG = typeof SS_LANG !== "undefined" ? SS_LANG : "en";
  const IS_RTL = typeof SS_RTL !== "undefined" ? SS_RTL : false;

  console.log(`[Smart Shopper] v44 ULTIMATE | Lang: ${LANG}`);

  const PANEL_ID = "ss-floating-panel";
  const WORKER_URL = "https://cold-art-c5df.fislilouiza91.workers.dev";
  const LOCAL_CACHE_TTL = 30 * 60 * 1000; // 30 دقيقة

  let currentProduct = null;
  let sellers = [];
  let activeFilter = "cheap";
  let minimized = false;
  let isScanning = false;

  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const esc = (s) => { const d = document.createElement("div"); d.textContent = s; return d.innerHTML; };
  const fmt = (n) => n >= 1000 ? (n / 1000).toFixed(1).replace(".0", "") + "k" : String(n);

  function formatPrice(v, currency) {
    if (v == null || isNaN(v) || v === 0) return "—";
    const sym = { USD: "$", EUR: "€", GBP: "£", SAR: "﷼", DA: "DA " }[currency] || "$";
    const num = v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return IS_RTL ? `${num} ${sym.trim()}` : `${sym}${num}`;
  }

  function detectCurrency() {
    const txt = document.body.innerText || "";
    if (/\bDA\s*[\d,]/i.test(txt)) return "DA";
    if (/\bEUR\b|€/.test(txt)) return "EUR";
    if (/\bGBP\b|£/.test(txt)) return "GBP";
    return "USD";
  }

  function extractNumbers(text) {
    if (!text) return [];
    const normalized = text
      .replace(/[٠-٩]/g, d => "٠١٢٣٤٥٦٧٨٩".indexOf(d))
      .replace(/[۰-۹]/g, d => "۰۱۲۳۴۵۶۷۸۹".indexOf(d))
      .replace(/[,\u066C\u00A0]/g, "");
    const results = [];
    const patterns = [
      /US\s*\$\s*([\d]+\.?\d{0,2})/g,
      /\$\s*([\d]+\.?\d{0,2})/g,
      /DA\s*([\d]+\.?\d{0,2})/g,
      /€\s*([\d]+\.?\d{0,2})/g,
      /£\s*([\d]+\.?\d{0,2})/g,
    ];
    for (const re of patterns) {
      let m;
      while ((m = re.exec(normalized)) !== null) {
        const v = parseFloat(m[1]);
        if (v > 0) results.push({ value: v, index: m.index });
      }
    }
    return results;
  }

  function isExcludedContext(text) {
    if (!text) return true;
    return /(\boff\s+on\b|\boff\s+us\b|coupon|voucher|reduction|with\s+coins|extra\s+\d+\s*%|installment|x\s*\$|×\s*\$|pieces|pcs|piece|bulk|wholesale|minimum|per\s+piece|\d+\s*\+|buy\s+now\s+pay|tax\s+excl)/i.test(text);
  }

  function applyWelcomeDeal(price, rootEl) {
    if (!price || !rootEl) return price;
    const txt = rootEl.innerText || "";
    let m = txt.match(/new\s+shoppers?\s+save\s+\$?\s*([\d.,]+)/i);
    if (m) {
      const save = parseFloat(m[1].replace(",", "."));
      if (save > 0 && save < price) return Math.round((price - save) * 100) / 100;
    }
    return price;
  }

  // ═══════════════════════════════════════════════════════
  // IMAGE HASH
  // ═══════════════════════════════════════════════════════

  function extractImageHash(url) {
    if (!url) return "";
    try {
      const m = url.match(/\/kf\/([SH][A-Za-z0-9]+)\./);
      if (m) return m[1].toUpperCase();
      const m2 = url.match(/\/([A-Za-z0-9]{20,})\./);
      if (m2) return m2[1].toUpperCase();
      return "";
    } catch (_) { return ""; }
  }

  /**
   * ⭐⭐ استخراج كل صور المنتج (10 صور)
   */
  function getAllImageHashes() {
    const hashes = new Set();

    // من meta
    const og = document.querySelector("meta[property='og:image']")?.getAttribute("content");
    if (og) {
      const h = extractImageHash(og);
      if (h) hashes.add(h);
    }

    // من الصور في الصفحة (thumbnails)
    const imgs = document.querySelectorAll(
      "[class*='image-view'] img, [class*='thumb'] img, [class*='magnifier'] img, [class*='gallery'] img"
    );
    for (const img of imgs) {
      const src = img.src || img.getAttribute("data-src") || img.getAttribute("data-large") || "";
      const h = extractImageHash(src);
      if (h) hashes.add(h);
      if (hashes.size >= 10) break;
    }

    // من صور بجانب العنوان
    const altImgs = document.querySelectorAll("img[src*='alicdn.com/kf/']");
    for (const img of altImgs) {
      if (hashes.size >= 10) break;
      const src = img.src || "";
      const h = extractImageHash(src);
      if (h) hashes.add(h);
    }

    return Array.from(hashes);
  }

  // ═══════════════════════════════════════════════════════
  // EXTRACTORS
  // ═══════════════════════════════════════════════════════

  function getTitle() {
    const sels = [
      "h1[data-pl='product-title']",
      ".product-title-text",
      ".pdp-comp-title",
      "[class*='title--wrap'] h1",
      "h1.product-title",
    ];
    for (const sel of sels) {
      const el = document.querySelector(sel);
      if (el) {
        const t = el.innerText?.trim();
        if (t && t.length > 8) return t;
      }
    }
    return document.querySelector("meta[property='og:title']")?.getAttribute("content")?.trim() || "";
  }

  function getImage() {
    const c = document.querySelector("meta[property='og:image']")?.getAttribute("content");
    return (c && c.startsWith("http")) ? c : "";
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
    for (const el of document.querySelectorAll("[aria-label*='star'], [aria-label*='rating']")) {
      const label = el.getAttribute("aria-label") || "";
      const m = label.match(/([\d.]+)\s*(out of|stars?|rating)/i);
      if (m) {
        const r = parseFloat(m[1]);
        if (r > 0 && r <= 5) return r;
      }
    }
    return null;
  }

  function getPrice() {
    const meta = document.querySelector("meta[property='product:price:amount']");
    if (meta) {
      const v = parseFloat(meta.getAttribute("content"));
      if (v > 0.5) return v;
    }
    const priceEls = document.querySelectorAll("[class*='price'], [class*='Price']");
    const candidates = [];
    for (const el of priceEls) {
      const cls = (el.className || "").toString().toLowerCase();
      const style = (el.getAttribute("style") || "").toLowerCase();
      if (/(old|origin|del|through|cross|before|strike|coupon|off|save|discount|reduce|promo|voucher|bulk|wholesale|minimum|tier)/i.test(cls)) continue;
      if (/line-through/.test(style)) continue;
      const txt = (el.innerText || "").trim();
      if (!txt || isExcludedContext(txt)) continue;
      const nums = extractNumbers(txt);
      if (!nums.length || nums[0].value < 3) continue;
      const isCurrent = /(current|sale|now|main|primary|big|large)/i.test(cls);
      const fontSize = parseFloat(window.getComputedStyle(el).fontSize) || 12;
      candidates.push({ value: nums[0].value, isCurrent, fontSize, el });
    }
    if (candidates.length) {
      candidates.sort((a, b) => {
        if (a.isCurrent !== b.isCurrent) return a.isCurrent ? -1 : 1;
        return b.fontSize - a.fontSize;
      });
      let basePrice = candidates[0].value;
      const container = candidates[0].el.closest("[class*='product'], [class*='pdp'], [class*='detail']") || document.body;
      basePrice = applyWelcomeDeal(basePrice, container);
      return basePrice;
    }
    return null;
  }

  function getProductId() {
    const m = location.pathname.match(/\/item\/(\d+)/) || location.pathname.match(/(\d{10,})/);
    return m ? m[1] : null;
  }

  function getOriginalStore() {
    const sels = [
      "[class*='store-info'] [class*='name']",
      "[class*='seller-name']",
      ".store-name",
      "[class*='storeName']",
    ];
    for (const sel of sels) {
      const el = document.querySelector(sel);
      if (el) {
        const t = el.innerText?.trim();
        if (t && t.length > 2 && t.length < 60) return t;
      }
    }
    return "";
  }

  /**
   * ⭐ استخراج تصنيف المنتج من breadcrumbs
   */
  function getCategory() {
    // AliExpress breadcrumb selectors
    const sels = [
      ".breadcrumb a",
      "[class*='breadcrumb'] a",
      "[class*='Breadcrumb'] a",
      "nav[aria-label='breadcrumb'] a",
    ];
    const parts = [];
    for (const sel of sels) {
      const els = document.querySelectorAll(sel);
      if (els.length > 1) {
        els.forEach(el => {
          const t = el.innerText?.trim();
          if (t && t.length > 2 && t.length < 40 && !t.includes("Home")) {
            parts.push(t.toLowerCase());
          }
        });
        if (parts.length > 0) break;
      }
    }
    return parts.join(" > ");
  }

  /**
   * ⭐ كشف نوع المنتج (للأسعار المخصصة)
   */
  function detectProductType(title) {
    const t = (title || "").toLowerCase();

    if (/\b(perfume|parfum|fragrance|عطر|parfum|тоалетн)\b/i.test(t)) return "perfume";
    if (/\b(headphone|earphone|earbud|headset|سماع|écouteur|earbuds)\b/i.test(t)) return "headphones";
    if (/\b(phone|smartphone|mobile|هاتف|téléphone)\b/i.test(t)) return "phone";
    if (/\b(laptop|notebook|كمبيوتر|ordinateur|computer)\b/i.test(t)) return "laptop";
    if (/\b(watch|smartwatch|ساعة|montre)\b/i.test(t)) return "watch";
    if (/\b(charger|cable|شاحن|câble)\b/i.test(t)) return "charger";
    if (/\b(usb|flash drive|pendrive|memory card)\b/i.test(t)) return "storage";
    if (/\b(camera|كاميرا|appareil photo)\b/i.test(t)) return "camera";
    if (/\b(shoe|sneaker|حذاء|chaussure)\b/i.test(t)) return "shoes";
    if (/\b(shirt|t-shirt|قميص|chemise)\b/i.test(t)) return "clothes";
    if (/\b(bag|backpack|حقيبة|sac)\b/i.test(t)) return "bag";
    if (/\b(toy|لعبة|jouet)\b/i.test(t)) return "toy";
    if (/\b(tool|أدوات|outil)\b/i.test(t)) return "tool";
    if (/\b(lamp|light|مصباح|lampe)\b/i.test(t)) return "lighting";
    if (/\b(fishing|صيد|pêche)\b/i.test(t)) return "fishing";

    return "general";
  }

  function extractProduct() {
    const img = getImage();
    const title = getTitle();
    return {
      id: getProductId(),
      title,
      image: img,
      imageHash: extractImageHash(img),
      imageHashes: getAllImageHashes(), // ⭐ كل الصور
      price: getPrice(),
      currency: detectCurrency(),
      sold: getSold(),
      rating: getRating(),
      store: getOriginalStore(),
      category: getCategory(),
      productType: detectProductType(title),
      url: location.href.split("?")[0],
    };
  }

  // ═══════════════════════════════════════════════════════
  // ⭐ FUZZY MATCHING
  // ═══════════════════════════════════════════════════════

  /**
   * تطبيع النص: إزالة الرموز، الألوان، الأحجام
   */
  function normalizeTitle(title) {
    if (!title) return "";
    return title
      .toLowerCase()
      // إزالة كل شيء غير حروف/أرقام
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      // إزالة الألوان
      .replace(/\b(black|white|red|blue|green|yellow|pink|purple|silver|gold|gray|grey|brown|أسود|أبيض|أحمر|أزرق|أخضر|أصفر|وردي|بني|noir|blanc|rouge|bleu|vert|jaune|rose|violet|argent|or|gris|marron)\b/gi, "")
      // إزالة الأحجام
      .replace(/\b(xs|s|m|l|xl|xxl|xxxl|small|medium|large)\b/gi, "")
      // مسافات زائدة
      .replace(/\s+/g, " ")
      .trim();
  }

  /**
   * تطبيع الماركة للمقارنة
   */
  function normalizeBrand(brand) {
    if (!brand) return "";
    return brand.toLowerCase().replace(/[^a-z0-9]/g, "");
  }

  /**
   * ⭐ Levenshtein Distance — تشابه العناوين
   */
  function levenshtein(a, b) {
    if (!a) return b ? b.length : 0;
    if (!b) return a.length;
    const tmp = [];
    for (let i = 0; i <= a.length; i++) tmp[i] = [i];
    for (let j = 0; j <= b.length; j++) tmp[0][j] = j;
    for (let i = 1; i <= a.length; i++) {
      for (let j = 1; j <= b.length; j++) {
        tmp[i][j] = Math.min(
          tmp[i - 1][j] + 1,
          tmp[i][j - 1] + 1,
          tmp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
        );
      }
    }
    return tmp[a.length][b.length];
  }

  function titleSimilarity(t1, t2) {
    const a = normalizeTitle(t1);
    const b = normalizeTitle(t2);
    if (!a || !b) return 0;
    const maxLen = Math.max(a.length, b.length);
    const dist = levenshtein(a, b);
    return Math.max(0, 1 - dist / maxLen);
  }

  // ═══════════════════════════════════════════════════════
  // KEYWORDS
  // ═══════════════════════════════════════════════════════

  const STOP_WORDS = new Set([
    "for","with","and","the","a","an","of","to","in","on","at","by","is","are",
    "original","new","hot","sale","free","shipping","best","top","quality","high",
    "wholesale","dropshipping","factory","brand","genuine","fast","delivery",
    "1pc","2pcs","3pcs","pcs","set","pack","style","type","you","your","this","that",
    "from","into","only","more","all","any","good","great","item","product","pieces",
    "piece","color","colors","size","sizes","model","series","version",
    "maximum","minimum","medium","direct","power","strong","small","large",
    "big","cheap","premium","professional","portable","rechargeable",
  ]);

  function getKeywords(title) {
    if (!title) return [];
    return title.replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/)
      .map(w => w.trim())
      .filter(w => w.length > 2 && !STOP_WORDS.has(w.toLowerCase()) && !/^\d+$/.test(w))
      .map(w => w.toLowerCase());
  }

  function extractBrand(title) {
    if (!title) return "";
    let m = title.match(/^\s*([A-Z][A-Z0-9]{2,15})\b/);
    if (m) return m[1].toUpperCase();
    m = title.match(/^\s*([A-Z][a-z]{2,15})\b/);
    if (m) return m[1].toUpperCase();
    m = title.slice(0, 60).match(/\b([A-Z][A-Z0-9]{2,15})\b/);
    if (m) return m[1].toUpperCase();
    return "";
  }

  /**
   * ⭐ استخراج الموديلات (مع استبعاد النسخ الوهمية)
   */
  const COMMON_VERSIONS = new Set([
    "5.3","5.2","5.1","5.0","4.2","4.1","4.0","3.0","2.0","1.0",
    "4g","5g","3g","2g",
    "usb","hdmi","rgb","led","lcd","ip67","ip68","ipx5","ipx7",
  ]);

  function extractModels(title) {
    if (!title) return [];
    const set = new Set();

    // نمط: EQ5, EQ38, F80, X21
    let m = title.match(/\b[A-Z]{2,5}\d{1,5}\b/g) || [];
    m.forEach(x => {
      const up = x.toUpperCase();
      if (!COMMON_VERSIONS.has(up.toLowerCase())) set.add(up);
    });

    // نمط: 5G, 4K (لكن استبعد الشائع)
    m = title.match(/\b\d{1,3}[A-Z]{2,5}\b/g) || [];
    m.forEach(x => {
      const up = x.toUpperCase();
      if (!COMMON_VERSIONS.has(up.toLowerCase())) set.add(up);
    });

    return Array.from(set);
  }

  function getPrimaryModel(title) {
    const models = extractModels(title);
    for (const m of models) {
      if (/^[A-Z]{2,5}\d{1,5}$/.test(m)) return m;
    }
    return models[0] || "";
  }

  function countKeywords(text, kw) {
    if (!text || !kw.length) return 0;
    const set = new Set(getKeywords(text));
    let c = 0;
    for (const k of kw) if (set.has(k)) c++;
    return c;
  }

  // ═══════════════════════════════════════════════════════
  // BUILD QUERIES
  // ═══════════════════════════════════════════════════════

  function buildMegaQueries(title) {
    const brand = extractBrand(title);
    const primaryModel = getPrimaryModel(title);
    const allModels = extractModels(title);
    const kws = getKeywords(title);
    const queries = [];
    const seenKw = new Set();

    function addQ(name, kw, page = 1) {
      kw = (kw || "").trim();
      if (!kw) return;
      const key = kw.toLowerCase() + "@" + page;
      if (seenKw.has(key)) return;
      seenKw.add(key);
      queries.push({ name: `${name}${page > 1 ? "-p" + page : ""}`, keywords: kw, page, pageSize: 50 });
    }

    // Tier 1
    if (brand && primaryModel) {
      addQ("brand+model", `${brand} ${primaryModel}`);
      addQ("brand+model", `${brand} ${primaryModel}`, 2);
    }

    // Tier 2
    if (primaryModel) {
      addQ("model-only", primaryModel);
      addQ("model-only", primaryModel, 2);
    }

    // Tier 3
    if (brand && kws.length >= 2) addQ("brand+2kw", `${brand} ${kws[0]} ${kws[1]}`);
    if (brand && kws.length >= 3) addQ("brand+3kw", `${brand} ${kws[0]} ${kws[1]} ${kws[2]}`);

    // Tier 4
    if (brand && kws.length >= 1) addQ("brand+kw1", `${brand} ${kws[0]}`);
    if (brand) addQ("brand-only", brand);

    // Tier 5
    if (primaryModel && kws.length >= 1) addQ("model+kw", `${primaryModel} ${kws[0]}`);
    if (primaryModel && brand) addQ("model+brand+kw", `${primaryModel} ${brand} ${kws[0]}`);
    if (allModels.length >= 2) addQ("all-models", allModels.slice(0, 3).join(" "));

    // Tier 6
    if (kws.length >= 2) addQ("kw2", `${kws[0]} ${kws[1]}`);
    if (kws.length >= 3) addQ("kw3", `${kws[0]} ${kws[1]} ${kws[2]}`);
    if (kws.length >= 4) addQ("kw4", kws.slice(0, 4).join(" "));
    if (kws.length >= 3) addQ("kw-spread", `${kws[0]} ${kws[2]}`);

    return queries.slice(0, 25);
  }

  async function fetchMegaSearch(queries, cacheKey) {
    const res = await fetch(`${WORKER_URL}/api/deep-search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ queries, cacheKey }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const payload = await res.json();
    if (!payload.ok) throw new Error(payload.error || "API error");
    return payload.data;
  }

  // ═══════════════════════════════════════════════════════
  // ⭐ CATEGORY-AWARE PRICE RANGES
  // ═══════════════════════════════════════════════════════

  function getPriceRange(productType, referencePrice) {
    if (!referencePrice || referencePrice <= 0) return { min: 0, max: Infinity };

    const ranges = {
      perfume:    { min: 0.15, max: 8 },   // نطاق واسع
      headphones: { min: 0.3, max: 5 },
      phone:      { min: 0.5, max: 3 },
      laptop:     { min: 0.6, max: 2 },
      watch:      { min: 0.3, max: 5 },
      charger:    { min: 0.3, max: 6 },
      storage:    { min: 0.3, max: 5 },
      camera:     { min: 0.4, max: 4 },
      shoes:      { min: 0.3, max: 5 },
      clothes:    { min: 0.3, max: 6 },
      bag:        { min: 0.3, max: 5 },
      toy:        { min: 0.2, max: 8 },
      tool:       { min: 0.3, max: 5 },
      lighting:   { min: 0.2, max: 8 },
      fishing:    { min: 0.2, max: 8 },
      general:    { min: 0.15, max: 7 },
    };

    const r = ranges[productType] || ranges.general;
    return {
      min: referencePrice * r.min,
      max: referencePrice * r.max,
    };
  }

  // ═══════════════════════════════════════════════════════
  // SCORING
  // ═══════════════════════════════════════════════════════

  function scoreProduct(p, ctx) {
    const price = parseFloat(p.target_sale_price || p.sale_price || 0);
    const oldP = parseFloat(p.target_original_price || p.original_price || 0);
    const rating = parseFloat(String(p.evaluate_rate || "0").replace("%", "")) / 20;
    const title = p.product_title || p.product_name || "";
    const id = String(p.product_id || "");
    const store = (p.shop_name || p.store_name || "").trim();
    const img = p.product_main_image_url || "";
    const imageHash = extractImageHash(img);

    if (!id || !price || !title) return null;
    if (id === ctx.productId) return null;

    const titleUpper = title.toUpperCase();

    // ⭐⭐⭐ IMAGE HASH (فحص كل صور المنتج)
    const hashMatch = ctx.imageHashes.some(h => h === imageHash) ||
                      (ctx.imageHash && ctx.imageHash === imageHash);

    // ⭐⭐ Fuzzy brand
    const cardBrand = extractBrand(title);
    const normalizedCardBrand = normalizeBrand(cardBrand);
    const normalizedCtxBrand = normalizeBrand(ctx.brand);
    const brandMatch = normalizedCtxBrand && normalizedCardBrand === normalizedCtxBrand;

    // ⭐ Model match
    const hasPrimaryModel = ctx.primaryModel && titleUpper.includes(ctx.primaryModel);
    const allModelsMatch = ctx.models.filter(m => titleUpper.includes(m));
    const modelMatches = allModelsMatch.length;

    // ⭐ Keywords
    const kwMatches = countKeywords(title, ctx.keywords);

    // ⭐ Title similarity (Levenshtein)
    const titleSim = titleSimilarity(ctx.title, title);

    // ⭐ فحص السعر حسب النوع
    const priceRange = getPriceRange(ctx.productType, ctx.referencePrice);
    if (price < priceRange.min || price > priceRange.max) return null;

    // ═══ حساب الـ Tier ═══
    let tier = 99;
    let score = 0;

    if (hashMatch) {
      tier = 1;
      score = 200;
    } else if (brandMatch && hasPrimaryModel && kwMatches >= 3 && titleSim >= 0.7) {
      tier = 1;
      score = 180;
    } else if (brandMatch && hasPrimaryModel && kwMatches >= 2) {
      tier = 2;
      score = 150;
    } else if (brandMatch && hasPrimaryModel) {
      tier = 3;
      score = 120;
    } else if (hasPrimaryModel && modelMatches >= 2 && kwMatches >= 3) {
      tier = 3;
      score = 110;
    } else if (hasPrimaryModel && kwMatches >= 3 && titleSim >= 0.6) {
      tier = 4;
      score = 90;
    } else if (brandMatch && kwMatches >= 3) {
      tier = 4;
      score = 80;
    } else if (hasPrimaryModel && kwMatches >= 2) {
      tier = 5;
      score = 65;
    } else if (brandMatch && kwMatches >= 2) {
      tier = 5;
      score = 55;
    } else if (kwMatches >= 4 && titleSim >= 0.5) {
      tier = 6;
      score = 40;
    } else if (kwMatches >= 3) {
      tier = 7;
      score = 25;
    } else {
      return null;
    }

    const finalOld = (oldP > price && price > 0) ? oldP : 0;
    const discount = finalOld > 0 ? Math.round((1 - price / finalOld) * 100) : 0;

    return {
      _tier: tier,
      _score: score,
      _id: id,
      _store: store.toLowerCase(),
      _imageHash: imageHash,
      _titleSim: titleSim,
      store: store || "AliExpress Seller",
      img,
      price,
      oldPrice: finalOld,
      discount,
      rating: rating > 0 && rating <= 5 ? +rating.toFixed(1) : 0,
      sold: parseInt(p.lastest_volume || p.volume || 0, 10),
      link: p.promotion_link || p.product_detail_url || "",
      title,
      similarity: Math.min(score, 100),
      isHashMatch: hashMatch,
      brandMatch,
      hasPrimaryModel,
      modelMatches,
      kwMatches,
      titleSim,
    };
  }

  function pickProgressive(scored, ctx) {
    const seenIds = new Set();
    const seenStores = new Set();
    const seenHashes = new Set();
    const accepted = [];
    const storesOriginal = ctx.originalStore.toLowerCase();

    scored.sort((a, b) => {
      if (a._tier !== b._tier) return a._tier - b._tier;
      return b._score - a._score;
    });

    for (const s of scored) {
      if (seenIds.has(s._id)) continue;
      if (s._store && storesOriginal && s._store === storesOriginal) continue;
      if (s._tier > 1 && s._store && seenStores.has(s._store)) continue;
      if (s._imageHash && seenHashes.has(s._imageHash) && !s.isHashMatch) continue;

      seenIds.add(s._id);
      if (s._store) seenStores.add(s._store);
      if (s._imageHash) seenHashes.add(s._imageHash);
      accepted.push(s);
      if (accepted.length >= 25) break;
    }

    return accepted;
  }

  function rankProducts(products) {
    return products.map(p => {
      let rank = p._score;
      if (p.rating >= 4.5) rank += 5;
      if (p.sold >= 100) rank += 3;
      if (p.titleSim >= 0.7) rank += 10;
      return { ...p, _rank: rank };
    }).sort((a, b) => {
      if (Math.abs(b._rank - a._rank) > 5) return b._rank - a._rank;
      return a.price - b.price;
    });
  }

  // ═══════════════════════════════════════════════════════
  // LOCAL CACHE
  // ═══════════════════════════════════════════════════════

  function localCacheGet(productId) {
    try {
      const raw = localStorage.getItem(`ss-cache-${productId}`);
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (Date.now() - data.ts > LOCAL_CACHE_TTL) return null;
      return data.sellers;
    } catch (_) { return null; }
  }

  function localCacheSet(productId, sellers) {
    try {
      localStorage.setItem(`ss-cache-${productId}`, JSON.stringify({
        ts: Date.now(),
        sellers,
      }));
    } catch (_) {}
  }

  // ═══════════════════════════════════════════════════════
  // PANEL
  // ═══════════════════════════════════════════════════════

  function buildPanel() {
    document.getElementById(PANEL_ID)?.remove();
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
          <button class="ss-btn-icon" data-action="refresh">↻</button>
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
        <button class="ss-chip ss-active" data-f="cheap">${T("cheapest")}</button>
        <button class="ss-chip" data-f="best">${T("bestValue")}</button>
        <button class="ss-chip" data-f="discount">${T("bestDiscount")}</button>
        <button class="ss-chip" data-f="sold">${T("mostSold")}</button>
      </div>
      <div class="ss-list" id="ss-list"></div>
      <div class="ss-footer">${T("footer")}</div>
    `;
    document.body.appendChild(panel);

    panel.querySelector("[data-action='close']").onclick = () => panel.classList.add("ss-hidden");
    panel.querySelector("[data-action='minimize']").onclick = () => {
      minimized = !minimized;
      panel.classList.toggle("ss-minimized", minimized);
      panel.querySelector("[data-action='minimize']").textContent = minimized ? "+" : "−";
    };
    panel.querySelector("[data-action='refresh']").onclick = () => {
      if (isScanning) return;
      // مسح الكاش المحلي
      try { localStorage.removeItem(`ss-cache-${currentProduct.id}`); } catch (_) {}
      doScan();
    };
    panel.querySelector("#ss-filters").onclick = (e) => {
      const chip = e.target.closest(".ss-chip");
      if (!chip) return;
      activeFilter = chip.dataset.f;
      panel.querySelectorAll(".ss-chip").forEach(c => c.classList.toggle("ss-active", c === chip));
      renderList();
    };

    makeDraggable(panel);
    restorePosition(panel);
    renderCurrentProduct();
    renderLoading();
  }

  async function doScan() {
    if (isScanning) return;
    isScanning = true;
    renderLoading();

    try {
      // ⭐ فحص الكاش المحلي أولاً
      const cached = localCacheGet(currentProduct.id);
      if (cached && cached.length > 0) {
        console.log("[Smart Shopper] ⚡ Local cache HIT");
        sellers = cached;
        updateSourceLabel("smart");
        renderList();
        isScanning = false;
        return;
      }

      const brand = extractBrand(currentProduct.title);
      const primaryModel = getPrimaryModel(currentProduct.title);
      const models = extractModels(currentProduct.title);
      const keywords = getKeywords(currentProduct.title);
      const referencePrice = currentProduct.price;
      const originalStore = currentProduct.store || "";
      const imageHash = currentProduct.imageHash || "";
      const imageHashes = currentProduct.imageHashes || [];

      console.log("═══════════════════════════════════════════");
      console.log("[Smart Shopper] v44 ULTIMATE");
      console.log("[Smart Shopper] Title:", currentProduct.title.slice(0, 80));
      console.log("[Smart Shopper] Brand:", brand);
      console.log("[Smart Shopper] Primary Model:", primaryModel);
      console.log("[Smart Shopper] Models:", models);
      console.log("[Smart Shopper] Category:", currentProduct.category);
      console.log("[Smart Shopper] Product Type:", currentProduct.productType);
      console.log("[Smart Shopper] Image Hashes:", imageHashes.length);
      console.log("[Smart Shopper] Reference Price:", referencePrice);
      console.log("═══════════════════════════════════════════");

      const queries = buildMegaQueries(currentProduct.title);
      console.log(`[Smart Shopper] Queries: ${queries.length}`);
      queries.forEach(q => console.log(`  → ${q.name}: "${q.keywords}"`));

      if (!queries.length) {
        sellers = [];
        renderEmpty();
        return;
      }

      // cacheKey فريد لكل منتج
      const cacheKey = `product-${currentProduct.id}-${currentProduct.productType}`;

      const data = await fetchMegaSearch(queries, cacheKey);
      const raw = data?.products || [];
      console.log(`[Smart Shopper] Raw: ${raw.length} unique${data.cached ? " (from edge cache)" : ""}`);

      const ctx = {
        productId: currentProduct.id,
        title: currentProduct.title,
        brand,
        primaryModel,
        models,
        keywords,
        referencePrice,
        originalStore,
        imageHash,
        imageHashes,
        productType: currentProduct.productType,
      };

      const scored = [];
      for (const p of raw) {
        const s = scoreProduct(p, ctx);
        if (s) scored.push(s);
      }

      console.log(`[Smart Shopper] Scored: ${scored.length}`);

      const tiers = {};
      scored.forEach(s => tiers[s._tier] = (tiers[s._tier] || 0) + 1);
      console.log("[Smart Shopper] Tiers:", tiers);

      const picked = pickProgressive(scored, ctx);
      console.log(`[Smart Shopper] ✅ FINAL: ${picked.length}`);

      sellers = rankProducts(picked);

      // ⭐ حفظ في الكاش المحلي
      if (sellers.length > 0) {
        localCacheSet(currentProduct.id, sellers);
      }

      updateSourceLabel(sellers.length > 0 ? "smart" : "none");
      renderList();
    } catch (e) {
      console.error("[Smart Shopper] Scan error:", e);
      sellers = [];
      renderEmpty();
    } finally {
      isScanning = false;
    }
  }

  function updateSourceLabel(mode) {
    const el = document.getElementById("ss-source");
    if (!el) return;
    if (mode === "smart") el.textContent = T("sameProduct") + " ✓";
    else if (mode === "none") el.textContent = "No matches";
    else el.textContent = T("scanning");
  }

  function renderCurrentProduct() {
    if (!currentProduct) return;
    const img = document.getElementById("ss-cur-img");
    const title = document.getElementById("ss-cur-title");
    const meta = document.getElementById("ss-cur-meta");
    if (img) {
      if (currentProduct.image) {
        img.src = currentProduct.image;
        img.onerror = () => { img.style.display = "none"; };
      } else img.style.display = "none";
    }
    if (title) title.textContent = currentProduct.title || "—";
    if (meta) {
      const parts = [];
      if (currentProduct.price != null) parts.push(`<strong>${formatPrice(currentProduct.price, currentProduct.currency)}</strong>`);
      if (currentProduct.rating != null) parts.push(`<span class="ss-meta-pill ss-star">★ ${currentProduct.rating}</span>`);
      if (currentProduct.sold != null) parts.push(`<span class="ss-meta-pill">${fmt(currentProduct.sold)} ${T("sold")}</span>`);
      meta.innerHTML = parts.join(" ");
    }
  }

  function renderLoading() {
    const list = document.getElementById("ss-list");
    if (!list) return;
    list.innerHTML = Array.from({ length: 4 }).map(() => `
      <div class="ss-skeleton">
        <div class="ss-sk ss-sk-thumb"></div>
        <div class="ss-sk-lines">
          <div class="ss-sk ss-sk-line"></div>
          <div class="ss-sk ss-sk-line short"></div>
        </div>
      </div>
    `).join("");
  }

  function renderEmpty() {
    const list = document.getElementById("ss-list");
    if (!list) return;
    list.innerHTML = `
      <div class="ss-empty">
        <div class="ss-empty-icon">🎯</div>
        <div class="ss-empty-title">No matches found</div>
        <div class="ss-empty-sub">
          This product seems unique. Try another product.
        </div>
        <button class="ss-empty-btn" id="ss-retry">${T("scanAgain")}</button>
      </div>
    `;
    document.getElementById("ss-retry")?.addEventListener("click", () => doScan());
  }

  function sortSellers(arr, f) {
    const copy = [...arr];
    if (f === "cheap") return copy.sort((a, b) => a.price - b.price);
    if (f === "discount") return copy.sort((a, b) => (b.discount || 0) - (a.discount || 0));
    if (f === "sold") return copy.sort((a, b) => (b.sold || 0) - (a.sold || 0));
    return copy.sort((a, b) => b._rank - a._rank);
  }

  function renderList() {
    const list = document.getElementById("ss-list");
    if (!list) return;
    if (!sellers.length) return renderEmpty();

    const items = sortSellers(sellers, activeFilter);
    const minPrice = Math.min(...items.map(s => s.price).filter(p => p > 0));
    const currentPrice = currentProduct?.price || 0;

    list.innerHTML = items.slice(0, 20).map((s, i) => {
      const rank = i + 1;
      const isCheap = s.price === minPrice && s.price > 0;
      const cardClass = rank === 1 ? "ss-best" : (isCheap ? "ss-cheap" : "");
      const rankClass = rank <= 3 ? `ss-r${rank}` : "";

      // بادج
      let badge = "";
      if (s.isHashMatch) badge = `<span class="ss-badge ss-badge-match">🎯 EXACT</span>`;
      else if (s.brandMatch && s.hasPrimaryModel) badge = `<span class="ss-badge ss-badge-match" style="background:#ecfdf5;color:#065f46">✓ SAME</span>`;
      else if (s.titleSim >= 0.75) badge = `<span class="ss-badge ss-badge-match" style="background:#fef3c7;color:#92400e">◐ ${Math.round(s.titleSim * 100)}%</span>`;
      else if (activeFilter === "cheap" && rank === 1) badge = `<span class="ss-badge ss-badge-cheap">${T("cheapestTag")}</span>`;
      else if (activeFilter === "discount" && rank === 1) badge = `<span class="ss-badge ss-badge-hot">${T("bestDeal")}</span>`;
      else if (activeFilter === "sold" && rank === 1) badge = `<span class="ss-badge ss-badge-top">${T("mostSoldTag")}</span>`;
      else if (activeFilter === "best" && rank === 1) badge = `<span class="ss-badge ss-badge-best">${T("bestValueTag")}</span>`;
      else if (isCheap) badge = `<span class="ss-badge ss-badge-cheap">${T("bestPrice")}</span>`;

      const discountBadge = s.discount > 0 ? `<span class="ss-save-badge">-${s.discount}%</span>` : "";
      const oldPriceHtml = s.oldPrice > 0 && s.oldPrice > s.price
        ? `<span class="ss-price-old">${formatPrice(s.oldPrice, currentProduct.currency)}</span>` : "";

      let compareVs = "";
      if (currentPrice && s.price > 0) {
        const diff = s.price - currentPrice;
        const pct = Math.round(Math.abs(diff) / currentPrice * 100);
        if (diff < 0) compareVs = `<span class="ss-compare-vs up">−${pct}%</span>`;
        else if (diff > 0) compareVs = `<span class="ss-compare-vs down">+${pct}%</span>`;
        else compareVs = `<span class="ss-compare-vs same">=</span>`;
      }

      const subtitleItems = [];
      if (s.rating > 0) subtitleItems.push(`<span class="ss-tag-inline rating">★ ${s.rating.toFixed(1)}</span>`);
      if (s.sold > 0) subtitleItems.push(`<span class="ss-tag-inline sold">${fmt(s.sold)} ${T("sold")}</span>`);

      const imgHtml = s.img
        ? `<img src="${s.img}" loading="lazy" onerror="this.style.display='none';this.parentElement.innerHTML='🖼️'">`
        : `🖼️`;

      return `
        <div class="ss-card ${cardClass}" data-idx="${i}">
          <div class="ss-card-row">
            <div class="ss-rank ${rankClass}">${rank}</div>
            <div class="ss-card-thumb">${imgHtml}</div>
            <div class="ss-card-info">
              <div class="ss-card-title">${esc(s.store)} ${badge}</div>
              <div class="ss-card-subtitle">${subtitleItems.join('<span class="ss-sep">●</span>')}</div>
            </div>
            <div class="ss-price-col">
              <div class="ss-price-line">
                <span class="ss-price-now">${formatPrice(s.price, currentProduct.currency)}</span>
                ${discountBadge}
              </div>
              <div style="display:flex;align-items:center;justify-content:flex-end;gap:5px">
                ${oldPriceHtml}
                ${compareVs}
              </div>
            </div>
          </div>
        </div>
      `;
    }).join("");

    list.querySelectorAll(".ss-card").forEach(card => {
      card.addEventListener("click", () => {
        const item = items[+card.dataset.idx];
        if (item?.link) window.open(item.link, "_blank", "noopener");
      });
    });
  }

  function makeDraggable(panel) {
    const header = panel.querySelector(".ss-header");
    if (!header) return;
    let dragging = false, sx, sy, sl, st;
    header.addEventListener("mousedown", (e) => {
      if (e.target.closest(".ss-btn-icon")) return;
      e.preventDefault();
      dragging = true;
      panel.classList.add("ss-dragging");
      const r = panel.getBoundingClientRect();
      sx = e.clientX; sy = e.clientY; sl = r.left; st = r.top;
      panel.style.right = "auto"; panel.style.left = sl + "px"; panel.style.top = st + "px";
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    });
    function onMove(e) {
      if (!dragging) return;
      const dx = e.clientX - sx, dy = e.clientY - sy;
      panel.style.left = Math.max(4, Math.min(sl + dx, innerWidth - panel.offsetWidth - 4)) + "px";
      panel.style.top = Math.max(4, Math.min(st + dy, innerHeight - panel.offsetHeight - 4)) + "px";
    }
    function onUp() {
      dragging = false;
      panel.classList.remove("ss-dragging");
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      try { localStorage.setItem("ss-pos", JSON.stringify({ left: panel.style.left, top: panel.style.top })); } catch (_) {}
    }
  }

  function restorePosition(panel) {
    try {
      const saved = localStorage.getItem("ss-pos");
      if (!saved) return;
      const { left, top } = JSON.parse(saved);
      if (left && top) { panel.style.right = "auto"; panel.style.left = left; panel.style.top = top; }
    } catch (_) {}
  }

  async function run() {
    await sleep(800);
    currentProduct = extractProduct();
    console.log("[Smart Shopper] v44 ready");
    console.log("[Smart Shopper] Image Hashes:", currentProduct.imageHashes.length);
    if (!currentProduct.title || currentProduct.title.length < 5) return;
    buildPanel();
    await doScan();
  }

  chrome.runtime.onMessage.addListener((msg, _s, res) => {
    if (msg.type === "GET_PRODUCT") {
      try { res({ ok: true, product: extractProduct() }); }
      catch (e) { res({ ok: false, error: String(e) }); }
      return true;
    }
  });

  run();
  console.log("[Smart Shopper] v44 ready.");
})();