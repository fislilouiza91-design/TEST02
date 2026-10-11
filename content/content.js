/* ═══════════════════════════════════════════════════════
   Smart Shopper — Content Script (v45 COGNITIVE)
   14-layer analysis + 30 queries + semantic matching.
   ═══════════════════════════════════════════════════════ */

(function () {
  "use strict";

  if (window.__SMART_SHOPPER_LOADED__) return;
  window.__SMART_SHOPPER_LOADED__ = true;

  const T = typeof SS_T === "function" ? SS_T : (k) => k;
  const IS_RTL = typeof SS_RTL !== "undefined" ? SS_RTL : false;

  console.log(`[Smart Shopper] v45 COGNITIVE`);

  const PANEL_ID = "ss-floating-panel";
  const WORKER_URL = "https://cold-art-c5df.fislilouiza91.workers.dev";
  const CACHE_TTL = 30 * 60 * 1000;

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

  function getAllImageHashes() {
    const hashes = new Set();
    const og = document.querySelector("meta[property='og:image']")?.getAttribute("content");
    if (og) {
      const h = extractImageHash(og);
      if (h) hashes.add(h);
    }
    const imgs = document.querySelectorAll(
      "[class*='image-view'] img, [class*='thumb'] img, [class*='magnifier'] img, [class*='gallery'] img, img[src*='alicdn.com/kf/']"
    );
    for (const img of imgs) {
      if (hashes.size >= 12) break;
      const src = img.src || img.getAttribute("data-src") || img.getAttribute("data-large") || "";
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

  function getCategory() {
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

  function detectProductType(title) {
    const t = (title || "").toLowerCase();
    if (/\b(perfume|parfum|fragrance|عطر|тоалетн)\b/i.test(t)) return "perfume";
    if (/\b(headphone|earphone|earbud|headset|سماع|écouteur)\b/i.test(t)) return "headphones";
    if (/\b(phone|smartphone|mobile|هاتف|téléphone)\b/i.test(t)) return "phone";
    if (/\b(laptop|notebook|ordinateur|computer)\b/i.test(t)) return "laptop";
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
    if (/\b(glass|glasses|نظار)\b/i.test(t)) return "glasses";
    if (/\b(case|cover|حافظة|coque)\b/i.test(t)) return "case";
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
      imageHashes: getAllImageHashes(),
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
  // ⭐⭐⭐ TEXT ANALYSIS (14 طبقة)
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

  const COLOR_WORDS = new Set([
    "black","white","red","blue","green","yellow","pink","purple","silver","gold",
    "gray","grey","brown","orange","cyan","violet","أحمر","أخضر","أزرق","أسود","أبيض",
    "noir","blanc","rouge","bleu","vert","jaune","rose","violet","gris","marron",
  ]);

  const SIZE_WORDS = new Set([
    "xs","s","m","l","xl","xxl","xxxl","small","medium","large","mini","plus","max",
  ]);

  function getKeywords(title) {
    if (!title) return [];
    return title.replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/)
      .map(w => w.trim().toLowerCase())
      .filter(w => w.length > 2 && !STOP_WORDS.has(w) && !/^\d+$/.test(w));
  }

  function getKeywordsNoColor(title) {
    return getKeywords(title).filter(w => !COLOR_WORDS.has(w) && !SIZE_WORDS.has(w));
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

  const COMMON_VERSIONS = new Set([
    "5.3","5.2","5.1","5.0","4.2","4.1","4.0","3.0","2.0","1.0",
    "4g","5g","3g","2g",
    "usb","hdmi","rgb","led","lcd","ip67","ip68","ipx5","ipx7",
    "anc","tws","hifi","hd","uhd","4k","8k","1080p","720p",
  ]);

  function extractModels(title) {
    if (!title) return [];
    const set = new Set();
    let m = title.match(/\b[A-Z]{2,5}\d{1,5}\b/g) || [];
    m.forEach(x => {
      const up = x.toUpperCase();
      if (!COMMON_VERSIONS.has(up.toLowerCase())) set.add(up);
    });
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

  // ⭐ Layer 1: Keyword Count
  function countKeywords(text, kw) {
    if (!text || !kw.length) return 0;
    const set = new Set(getKeywords(text));
    let c = 0;
    for (const k of kw) if (set.has(k)) c++;
    return c;
  }

  // ⭐ Layer 2: Jaccard Similarity
  function jaccardSimilarity(t1, t2) {
    const s1 = new Set(getKeywords(t1));
    const s2 = new Set(getKeywords(t2));
    if (!s1.size || !s2.size) return 0;
    const intersection = [...s1].filter(x => s2.has(x)).length;
    const union = new Set([...s1, ...s2]).size;
    return union > 0 ? intersection / union : 0;
  }

  // ⭐ Layer 3: Cosine Similarity (TF-based)
  function cosineSimilarity(t1, t2) {
    const w1 = getKeywords(t1);
    const w2 = getKeywords(t2);
    if (!w1.length || !w2.length) return 0;

    const tf1 = {}, tf2 = {};
    w1.forEach(w => tf1[w] = (tf1[w] || 0) + 1);
    w2.forEach(w => tf2[w] = (tf2[w] || 0) + 1);

    const allWords = new Set([...Object.keys(tf1), ...Object.keys(tf2)]);
    let dotProduct = 0, mag1 = 0, mag2 = 0;

    allWords.forEach(w => {
      const a = tf1[w] || 0;
      const b = tf2[w] || 0;
      dotProduct += a * b;
      mag1 += a * a;
      mag2 += b * b;
    });

    if (mag1 === 0 || mag2 === 0) return 0;
    return dotProduct / (Math.sqrt(mag1) * Math.sqrt(mag2));
  }

  // ⭐ Layer 4: Levenshtein
  function normalizeTitle(title) {
    if (!title) return "";
    return title.toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

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

  function levenshteinSimilarity(t1, t2) {
    const a = normalizeTitle(t1);
    const b = normalizeTitle(t2);
    if (!a || !b) return 0;
    const maxLen = Math.max(a.length, b.length);
    const dist = levenshtein(a, b);
    return Math.max(0, 1 - dist / maxLen);
  }

  // ⭐ Layer 5: N-gram Matching
  function getNgrams(text, n = 2) {
    const words = getKeywordsNoColor(text);
    const ngrams = [];
    for (let i = 0; i <= words.length - n; i++) {
      ngrams.push(words.slice(i, i + n).join(" "));
    }
    return ngrams;
  }

  function ngramSimilarity(t1, t2) {
    const ng1 = new Set(getNgrams(t1, 2));
    const ng2 = new Set(getNgrams(t2, 2));
    if (!ng1.size || !ng2.size) return 0;
    const intersection = [...ng1].filter(x => ng2.has(x)).length;
    return intersection / Math.min(ng1.size, ng2.size);
  }

  // ⭐ Layer 6: Number Matching
  function extractCriticalNumbers(text) {
    if (!text) return [];
    const nums = text.match(/\b\d{2,5}\b/g) || [];
    return nums.filter(n => {
      const v = parseInt(n, 10);
      return v >= 10 && v <= 99999;
    });
  }

  function numberMatch(t1, t2) {
    const n1 = extractCriticalNumbers(t1);
    const n2 = extractCriticalNumbers(t2);
    if (!n1.length) return 0.5; // محايد
    let matches = 0;
    for (const n of n1) if (n2.includes(n)) matches++;
    return matches / n1.length;
  }

  // ⭐ Layer 7: Brand Fuzzy Match
  function normalizeBrand(brand) {
    if (!brand) return "";
    return brand.toLowerCase().replace(/[^a-z0-9]/g, "");
  }

  function brandFuzzyMatch(b1, b2) {
    const n1 = normalizeBrand(b1);
    const n2 = normalizeBrand(b2);
    if (!n1 || !n2) return false;
    if (n1 === n2) return true;
    if (n1.includes(n2) || n2.includes(n1)) return true;
    if (levenshtein(n1, n2) <= 2) return true;
    return false;
  }

  // ⭐ Layer 8: Category Match
  function categoryMatch(c1, c2) {
    if (!c1 || !c2) return 0;
    const w1 = new Set(c1.split(" > ").map(x => x.trim()).filter(x => x));
    const w2 = new Set(c2.split(" > ").map(x => x.trim()).filter(x => x));
    const intersection = [...w1].filter(x => w2.has(x)).length;
    if (intersection >= 2) return 1;
    if (intersection === 1) return 0.5;
    return 0;
  }

  // ⭐ Layer 9: Type Match
  function typeMatch(t1, t2) {
    if (!t1 || !t2) return 0;
    return t1 === t2 ? 1 : 0;
  }

  // ⭐ Layer 10: Model Score
  function modelScore(t1, t2, primaryModel, allModels) {
    if (!primaryModel && !allModels.length) return 0;
    const upper2 = t2.toUpperCase();

    let score = 0;
    let matched = 0;

    for (const m of allModels) {
      if (upper2.includes(m)) matched++;
    }

    if (primaryModel && upper2.includes(primaryModel)) score += 1;
    score += matched / Math.max(allModels.length, 1);

    return Math.min(score / 2, 1);
  }

  // ═══════════════════════════════════════════════════════
  // BUILD 30 QUERIES
  // ═══════════════════════════════════════════════════════

  function buildMegaQueries(title) {
    const brand = extractBrand(title);
    const primaryModel = getPrimaryModel(title);
    const allModels = extractModels(title);
    const kws = getKeywords(title);
    const kwsNoColor = getKeywordsNoColor(title);
    const queries = [];
    const seen = new Set();

    function addQ(name, kw, page = 1, priority = 5) {
      kw = (kw || "").trim();
      if (!kw) return;
      const key = `${kw.toLowerCase()}@${page}`;
      if (seen.has(key)) return;
      seen.add(key);
      queries.push({ name, keywords: kw, page, pageSize: 50, priority });
    }

    // ═══ Priority 1: الأقوى ═══
    if (brand && primaryModel) {
      addQ("brand+model", `${brand} ${primaryModel}`, 1, 1);
      addQ("brand+model-p2", `${brand} ${primaryModel}`, 2, 1);
    }

    // ═══ Priority 2: Model فقط ═══
    if (primaryModel) {
      addQ("model-only", primaryModel, 1, 2);
      addQ("model-only-p2", primaryModel, 2, 2);
    }

    // ═══ Priority 3: brand + 3 keywords ═══
    if (brand && kws.length >= 3) {
      addQ("brand+3kw", `${brand} ${kws[0]} ${kws[1]} ${kws[2]}`, 1, 3);
    }

    // ═══ Priority 4: brand + 2 keywords ═══
    if (brand && kws.length >= 2) {
      addQ("brand+2kw", `${brand} ${kws[0]} ${kws[1]}`, 1, 4);
    }

    // ═══ Priority 5: brand فقط ═══
    if (brand) {
      addQ("brand-only", brand, 1, 5);
    }

    // ═══ Priority 6: Model + keywords ═══
    if (primaryModel && kws.length >= 2) {
      addQ("model+2kw", `${primaryModel} ${kws[0]} ${kws[1]}`, 1, 6);
    }

    // ═══ Priority 7: All models ═══
    if (allModels.length >= 2) {
      addQ("all-models", allModels.slice(0, 3).join(" "), 1, 7);
    }

    // ═══ Priority 8: brand + kw (no color) ═══
    if (brand && kwsNoColor.length >= 1) {
      addQ("brand+kwNoColor", `${brand} ${kwsNoColor[0]}`, 1, 8);
    }

    // ═══ Priority 9: 4 keywords ═══
    if (kws.length >= 4) {
      addQ("kw4", kws.slice(0, 4).join(" "), 1, 9);
    }

    // ═══ Priority 10: 3 keywords ═══
    if (kws.length >= 3) {
      addQ("kw3", kws.slice(0, 3).join(" "), 1, 10);
      addQ("kw3-spread", `${kws[0]} ${kws[2]}`, 1, 10);
    }

    // ═══ Priority 11: 2 keywords ═══
    if (kws.length >= 2) {
      addQ("kw2", `${kws[0]} ${kws[1]}`, 1, 11);
    }

    // ═══ Priority 12: brand + all models ═══
    if (brand && allModels.length >= 2) {
      addQ("brand+allmodels", `${brand} ${allModels.slice(0, 2).join(" ")}`, 1, 12);
    }

    // ═══ Priority 13: reverse keyword order ═══
    if (kws.length >= 3) {
      addQ("kw-reverse", `${kws[2]} ${kws[0]}`, 1, 13);
    }

    // ═══ Priority 14: brand alone صفحة 2 ═══
    if (brand) {
      addQ("brand-only-p2", brand, 2, 14);
    }

    return queries.slice(0, 30);
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
  // PRICE RANGES
  // ═══════════════════════════════════════════════════════

  function getPriceRange(productType, referencePrice) {
    if (!referencePrice || referencePrice <= 0) return { min: 0, max: Infinity };
    const ranges = {
      perfume:    { min: 0.15, max: 8 },
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
      glasses:    { min: 0.3, max: 6 },
      case:       { min: 0.3, max: 6 },
      general:    { min: 0.15, max: 7 },
    };
    const r = ranges[productType] || ranges.general;
    return {
      min: referencePrice * r.min,
      max: referencePrice * r.max,
    };
  }

  // ═══════════════════════════════════════════════════════
  // ⭐⭐⭐ COGNITIVE SCORING (14 layers)
  // ═══════════════════════════════════════════════════════

  function cognitiveScore(p, ctx) {
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

    // ═══ Layer 1: Image Hash ═══
    const hashMatch = ctx.imageHashes.some(h => h === imageHash) ||
                      (ctx.imageHash && ctx.imageHash === imageHash);

    // ═══ Layer 2: Brand Fuzzy ═══
    const cardBrand = extractBrand(title);
    const brandMatch = brandFuzzyMatch(cardBrand, ctx.brand);

    // ═══ Layer 3: Model Match ═══
    const titleUpper = title.toUpperCase();
    const hasPrimaryModel = ctx.primaryModel && titleUpper.includes(ctx.primaryModel);
    const allModelsMatch = ctx.models.filter(m => titleUpper.includes(m));
    const modelMatches = allModelsMatch.length;

    // ═══ Layer 4: Keyword Count ═══
    const kwMatches = countKeywords(title, ctx.keywords);

    // ═══ Layer 5: Jaccard ═══
    const jaccard = jaccardSimilarity(ctx.title, title);

    // ═══ Layer 6: Cosine ═══
    const cosine = cosineSimilarity(ctx.title, title);

    // ═══ Layer 7: Levenshtein ═══
    const lev = levenshteinSimilarity(ctx.title, title);

    // ═══ Layer 8: N-gram ═══
    const ngram = ngramSimilarity(ctx.title, title);

    // ═══ Layer 9: Numbers ═══
    const numbers = numberMatch(ctx.title, title);

    // ═══ Layer 10: Category ═══
    const catScore = categoryMatch(ctx.category, "") || 0.5;

    // ═══ Layer 11: Type ═══
    const typeScore = typeMatch(ctx.productType, detectProductType(title));

    // ═══ Layer 12: Model Score ═══
    const modScore = modelScore(ctx.title, title, ctx.primaryModel, ctx.models);

    // ═══ Layer 13: Price Filter ═══
    const range = getPriceRange(ctx.productType, ctx.referencePrice);
    if (price < range.min || price > range.max) return null;

    // ═══ Layer 14: Confidence Score ═══
    let confidence = 0;
    confidence += hashMatch ? 100 : 0;
    confidence += brandMatch ? 15 : 0;
    confidence += hasPrimaryModel ? 20 : 0;
    confidence += Math.min(modelMatches * 5, 15);
    confidence += Math.min(kwMatches * 2, 10);
    confidence += Math.round(jaccard * 20);
    confidence += Math.round(cosine * 15);
    confidence += Math.round(lev * 15);
    confidence += Math.round(ngram * 15);
    confidence += Math.round(numbers * 10);
    confidence += Math.round(catScore * 5);
    confidence += Math.round(typeScore * 5);
    confidence += Math.round(modScore * 15);

    confidence = Math.min(confidence, 100);

    // ═══ Tier Determination ═══
    let tier = 99;

    if (hashMatch) tier = 1;
    else if (confidence >= 90) tier = 2;
    else if (confidence >= 80) tier = 3;
    else if (confidence >= 70) tier = 4;
    else if (confidence >= 60) tier = 5;
    else if (confidence >= 50) tier = 6;
    else if (confidence >= 40) tier = 7;
    else if (confidence >= 30) tier = 8;
    else if (confidence >= 25) tier = 9;
    else if (confidence >= 20) tier = 10;
    else if (confidence >= 15) tier = 11;
    else if (confidence >= 10) tier = 12;
    else if (confidence >= 5) tier = 13;
    else return null;

    const finalOld = (oldP > price && price > 0) ? oldP : 0;
    const discount = finalOld > 0 ? Math.round((1 - price / finalOld) * 100) : 0;

    return {
      _tier: tier,
      _confidence: confidence,
      _id: id,
      _store: store.toLowerCase(),
      _imageHash: imageHash,
      _hashMatch: hashMatch,
      _brandMatch: brandMatch,
      _hasPrimaryModel: hasPrimaryModel,
      _modelMatches: modelMatches,
      _kwMatches: kwMatches,
      _jaccard: jaccard,
      _cosine: cosine,
      _lev: lev,
      _ngram: ngram,
      _numbers: numbers,
      _catScore: catScore,
      _typeScore: typeScore,
      _modScore: modScore,
      store: store || "AliExpress Seller",
      img,
      price,
      oldPrice: finalOld,
      discount,
      rating: rating > 0 && rating <= 5 ? +rating.toFixed(1) : 0,
      sold: parseInt(p.lastest_volume || p.volume || 0, 10),
      link: p.promotion_link || p.product_detail_url || "",
      title,
      similarity: confidence,
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
      return b._confidence - a._confidence;
    });

    for (const s of scored) {
      if (seenIds.has(s._id)) continue;
      if (s._store && storesOriginal && s._store === storesOriginal) continue;
      if (s._tier > 1 && s._store && seenStores.has(s._store)) continue;
      if (s._imageHash && seenHashes.has(s._imageHash) && !s._hashMatch) continue;

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
      let rank = p._confidence;
      if (p.rating >= 4.5) rank += 3;
      if (p.sold >= 100) rank += 2;
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
      if (Date.now() - data.ts > CACHE_TTL) return null;
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
      console.log("[Smart Shopper] v45 COGNITIVE");
      console.log("[Smart Shopper] Title:", currentProduct.title.slice(0, 80));
      console.log("[Smart Shopper] Brand:", brand);
      console.log("[Smart Shopper] Model:", primaryModel);
      console.log("[Smart Shopper] Models:", models);
      console.log("[Smart Shopper] Category:", currentProduct.category);
      console.log("[Smart Shopper] Type:", currentProduct.productType);
      console.log("[Smart Shopper] Image Hashes:", imageHashes.length);
      console.log("[Smart Shopper] Price:", referencePrice);
      console.log("═══════════════════════════════════════════");

      const queries = buildMegaQueries(currentProduct.title);
      console.log(`[Smart Shopper] ${queries.length} queries`);

      if (!queries.length) {
        sellers = [];
        renderEmpty();
        return;
      }

      const cacheKey = `p-${currentProduct.id}-${currentProduct.productType}`;
      const data = await fetchMegaSearch(queries, cacheKey);
      const raw = data?.products || [];
      console.log(`[Smart Shopper] Raw: ${raw.length}${data.cached ? " (cached)" : ""}`);

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
        category: currentProduct.category,
      };

      const scored = [];
      for (const p of raw) {
        const s = cognitiveScore(p, ctx);
        if (s) scored.push(s);
      }

      console.log(`[Smart Shopper] Scored: ${scored.length}`);

      const tiers = {};
      scored.forEach(s => tiers[s._tier] = (tiers[s._tier] || 0) + 1);
      console.log("[Smart Shopper] Tiers:", tiers);

      const picked = pickProgressive(scored, ctx);
      console.log(`[Smart Shopper] ✅ FINAL: ${picked.length}`);

      sellers = rankProducts(picked);

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
        <div class="ss-empty-icon">🧠</div>
        <div class="ss-empty-title">No matches found</div>
        <div class="ss-empty-sub">
          This product seems unique across ${currentProduct?.productType || "all"} stores.
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

    list.innerHTML = items.slice(0, 25).map((s, i) => {
      const rank = i + 1;
      const isCheap = s.price === minPrice && s.price > 0;
      const cardClass = rank === 1 ? "ss-best" : (isCheap ? "ss-cheap" : "");
      const rankClass = rank <= 3 ? `ss-r${rank}` : "";

      // بادج ذكي
      let badge = "";
      const conf = s._confidence || s.similarity || 0;
      if (s._hashMatch) badge = `<span class="ss-badge ss-badge-match">🎯 EXACT 100%</span>`;
      else if (conf >= 85) badge = `<span class="ss-badge ss-badge-match" style="background:#ecfdf5;color:#065f46">✓ ${conf}%</span>`;
      else if (conf >= 70) badge = `<span class="ss-badge ss-badge-match" style="background:#dbeafe;color:#1e40af">◐ ${conf}%</span>`;
      else if (conf >= 55) badge = `<span class="ss-badge ss-badge-match" style="background:#fef3c7;color:#92400e">◔ ${conf}%</span>`;
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
    console.log("[Smart Shopper] v45 COGNITIVE ready");
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
  console.log("[Smart Shopper] v45 ready.");
})();