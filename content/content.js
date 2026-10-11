/* ═══════════════════════════════════════════════════════
   Smart Shopper — Content Script (v48 OPTIMIZED)
   Only proven methods. Fast + accurate.
   ═══════════════════════════════════════════════════════ */

(function () {
  "use strict";

  if (window.__SMART_SHOPPER_LOADED__) return;
  window.__SMART_SHOPPER_LOADED__ = true;

  const T = typeof SS_T === "function" ? SS_T : (k) => k;
  const IS_RTL = typeof SS_RTL !== "undefined" ? SS_RTL : false;

  console.log(`[Smart Shopper] v48 OPTIMIZED`);

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

  function detectProductType(title) {
    const t = (title || "").toLowerCase();
    if (/\b(perfume|parfum|fragrance|عطر)\b/i.test(t)) return "perfume";
    if (/\b(headphone|earphone|earbud|headset|سماع)\b/i.test(t)) return "headphones";
    if (/\b(phone|smartphone|mobile|هاتف)\b/i.test(t)) return "phone";
    if (/\b(laptop|notebook|computer)\b/i.test(t)) return "laptop";
    if (/\b(watch|smartwatch|ساعة)\b/i.test(t)) return "watch";
    if (/\b(charger|cable|شاحن)\b/i.test(t)) return "charger";
    if (/\b(usb|flash drive|pendrive|memory card)\b/i.test(t)) return "storage";
    if (/\b(camera|كاميرا)\b/i.test(t)) return "camera";
    if (/\b(shoe|sneaker|حذاء)\b/i.test(t)) return "shoes";
    if (/\b(shirt|t-shirt|قميص)\b/i.test(t)) return "clothes";
    if (/\b(bag|backpack|حقيبة)\b/i.test(t)) return "bag";
    if (/\b(toy|لعبة)\b/i.test(t)) return "toy";
    if (/\b(tool|أدوات)\b/i.test(t)) return "tool";
    if (/\b(lamp|light|مصباح)\b/i.test(t)) return "lighting";
    if (/\b(fishing|صيد)\b/i.test(t)) return "fishing";
    if (/\b(glass|glasses|نظار)\b/i.test(t)) return "glasses";
    if (/\b(case|cover|حافظة)\b/i.test(t)) return "case";
    return "general";
  }

  function extractProduct() {
    const title = getTitle();
    return {
      id: getProductId(),
      title,
      image: getImage(),
      price: getPrice(),
      currency: detectCurrency(),
      sold: getSold(),
      rating: getRating(),
      store: getOriginalStore(),
      productType: detectProductType(title),
      url: location.href.split("?")[0],
    };
  }

  // ═══════════════════════════════════════════════════════
  // ⭐ KEYWORDS & TEXT ANALYSIS (fast & proven)
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
    "gray","grey","brown","orange","cyan","violet","beige","navy",
    "أحمر","أخضر","أزرق","أسود","أبيض","بني","وردي",
    "noir","blanc","rouge","bleu","vert","jaune","rose","violet","gris","marron",
  ]);

  const SIZE_WORDS = new Set([
    "xs","s","m","l","xl","xxl","xxxl","small","medium","large","mini","plus","max",
  ]);

  const COMMON_VERSIONS = new Set([
    "5.3","5.2","5.1","5.0","4.2","4.1","4.0","3.0","2.0","1.0",
    "4g","5g","3g","2g",
    "usb","hdmi","rgb","led","lcd","ip67","ip68","ipx5","ipx7",
    "anc","tws","hifi","hd","uhd","4k","8k","1080p","720p",
  ]);

  function normalizeText(text) {
    if (!text) return "";
    return text.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
  }

  function getKeywords(title) {
    if (!title) return [];
    return normalizeText(title).split(/\s+/)
      .filter(w => w.length > 2 && !STOP_WORDS.has(w) && !/^\d+$/.test(w));
  }

  /**
   * ⭐⭐ استخراج Brand محسّن
   * يتعامل مع: HOCO, SoundMax, ROCKBROS, EDEN
   */
  function extractBrand(title) {
    if (!title) return "";

    // 1) كلمات كلها CAPS (3-15 حرف)
    let m = title.match(/\b([A-Z]{3,15})\b/);
    if (m) return m[1];

    // 2) كلمة تبدأ بحرف كبير (Capitalized)
    m = title.match(/\b([A-Z][a-z]{2,15})\b/);
    if (m && !STOP_WORDS.has(m[1].toLowerCase())) return m[1].toUpperCase();

    // 3) من أول 30 حرف
    m = title.slice(0, 30).match(/\b([A-Z][a-zA-Z0-9]{2,15})\b/);
    if (m) return m[1].toUpperCase();

    return "";
  }

  function extractModels(title) {
    if (!title) return [];
    const set = new Set();

    // نمط 1: EQ5, EQ38, F80, X21
    let m = title.match(/\b[A-Z]{2,5}\d{1,5}\b/g) || [];
    m.forEach(x => {
      const up = x.toUpperCase();
      if (!COMMON_VERSIONS.has(up.toLowerCase())) set.add(up);
    });

    // نمط 2: 5G, 4K
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

  /**
   * ⭐⭐ تطبيع Brand للمقارنة
   */
  function normalizeBrand(brand) {
    if (!brand) return "";
    return brand.toLowerCase().replace(/[^a-z0-9]/g, "");
  }

  function brandMatch(b1, b2) {
    const n1 = normalizeBrand(b1);
    const n2 = normalizeBrand(b2);
    if (!n1 || !n2) return false;
    if (n1 === n2) return true;
    if (n1.includes(n2) || n2.includes(n1)) return true;
    if (n1.length >= 4 && n2.length >= 4) {
      // مقارنة الأحرف الأولى
      let match = 0;
      for (let i = 0; i < Math.min(n1.length, n2.length); i++) {
        if (n1[i] === n2[i]) match++;
        else break;
      }
      if (match >= 4) return true;
    }
    return false;
  }

  /**
   * ⭐⭐⭐ FAST SCORING
   */
  function fastScore(p, ctx) {
    const price = parseFloat(p.target_sale_price || p.sale_price || 0);
    const oldP = parseFloat(p.target_original_price || p.original_price || 0);
    const rating = parseFloat(String(p.evaluate_rate || "0").replace("%", "")) / 20;
    const title = p.product_title || p.product_name || "";
    const id = String(p.product_id || "");
    const store = (p.shop_name || p.store_name || "").trim();

    if (!id || !price || !title) return null;
    if (id === ctx.productId) return null;

    // Price filter
    if (ctx.referencePrice > 0) {
      const ratio = price / ctx.referencePrice;
      if (ratio < 0.1 || ratio > 10.0) return null;
    }

    const titleUpper = title.toUpperCase();

    // ═══ Brand ═══
    const cardBrand = extractBrand(title);
    const bMatch = brandMatch(cardBrand, ctx.brand);

    // ═══ Model ═══
    const hasPrimaryModel = ctx.primaryModel && titleUpper.includes(ctx.primaryModel);
    const modelsMatched = ctx.models.filter(m => titleUpper.includes(m)).length;

    // ═══ Keywords (Jaccard) ═══
    const cardKws = new Set(getKeywords(title));
    let kwMatches = 0;
    for (const k of ctx.keywords) if (cardKws.has(k)) kwMatches++;
    const unionSize = cardKws.size + ctx.keywords.length - kwMatches;
    const jaccard = unionSize > 0 ? kwMatches / unionSize : 0;

    // ═══ Type Match ═══
    const cardType = detectProductType(title);
    const typeMatch = ctx.productType === cardType ? 1 : 0;

    // ═══ Confidence ═══
    let confidence = 0;
    confidence += bMatch ? 25 : 0;
    confidence += hasPrimaryModel ? 30 : 0;
    confidence += Math.min(modelsMatched * 10, 20);
    confidence += Math.min(kwMatches * 3, 15);
    confidence += Math.round(jaccard * 25);
    confidence += typeMatch ? 10 : 0;

    confidence = Math.min(confidence, 100);

    // رفض الضعيف
    if (confidence < 10) return null;

    // Tier
    let tier = 10;
    if (confidence >= 85) tier = 1;
    else if (confidence >= 70) tier = 2;
    else if (confidence >= 55) tier = 3;
    else if (confidence >= 40) tier = 4;
    else if (confidence >= 25) tier = 5;
    else if (confidence >= 15) tier = 6;
    else tier = 7;

    const finalOld = (oldP > price && price > 0) ? oldP : 0;
    const discount = finalOld > 0 ? Math.round((1 - price / finalOld) * 100) : 0;

    return {
      _tier: tier,
      _confidence: confidence,
      _id: id,
      _store: store.toLowerCase(),
      _kwMatches: kwMatches,
      _modelsMatched: modelsMatched,
      _brandMatch: bMatch,
      _hasPrimaryModel: hasPrimaryModel,
      _jaccard: jaccard,
      store: store || "AliExpress Seller",
      img: p.product_main_image_url || "",
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

  function pickBest(scored, ctx) {
    const seenIds = new Set();
    const seenStores = new Set();
    const accepted = [];
    const original = ctx.originalStore.toLowerCase();

    scored.sort((a, b) => {
      if (a._tier !== b._tier) return a._tier - b._tier;
      return b._confidence - a._confidence;
    });

    for (const s of scored) {
      if (seenIds.has(s._id)) continue;
      if (s._store && original && s._store === original) continue;
      if (s._store && seenStores.has(s._store)) continue;

      seenIds.add(s._id);
      if (s._store) seenStores.add(s._store);
      accepted.push(s);
      if (accepted.length >= 25) break;
    }

    return accepted;
  }

  // ═══════════════════════════════════════════════════════
  // 12 QUERIES (توازن بين السرعة والتغطية)
  // ═══════════════════════════════════════════════════════

  function buildQueries(title) {
    const brand = extractBrand(title);
    const primaryModel = getPrimaryModel(title);
    const models = extractModels(title);
    const kws = getKeywords(title);
    const queries = [];
    const seen = new Set();

    function addQ(name, kw, priority = 5) {
      kw = (kw || "").trim();
      if (!kw || kw.length < 2) return;
      const key = kw.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      queries.push({ name, keywords: kw, page: 1, pageSize: 50, priority, language: "EN" });
    }

    // P1: brand + model
    if (brand && primaryModel) addQ("brand+model", `${brand} ${primaryModel}`, 1);

    // P2: model فقط
    if (primaryModel) addQ("model-only", primaryModel, 2);

    // P3: brand + 2 كلمات
    if (brand && kws.length >= 2) addQ("brand+2kw", `${brand} ${kws[0]} ${kws[1]}`, 3);

    // P4: brand + 1 كلمة
    if (brand && kws.length >= 1) addQ("brand+kw1", `${brand} ${kws[0]}`, 4);

    // P5: brand فقط
    if (brand) addQ("brand-only", brand, 5);

    // P6: 3 كلمات
    if (kws.length >= 3) addQ("kw3", kws.slice(0, 3).join(" "), 6);

    // P7: 2 كلمات
    if (kws.length >= 2) addQ("kw2", `${kws[0]} ${kws[1]}`, 7);

    // P8: model + kw
    if (primaryModel && kws.length >= 1) addQ("model+kw", `${primaryModel} ${kws[0]}`, 8);

    // P9: كل الموديلات
    if (models.length >= 2) addQ("all-models", models.slice(0, 3).join(" "), 9);

    // P10: 4 كلمات
    if (kws.length >= 4) addQ("kw4", kws.slice(0, 4).join(" "), 10);

    // P11: brand + model بـ EN
    if (brand && primaryModel) addQ("brand+model-ru", `${brand} ${primaryModel}`, 11, "RU");

    // P12: brand + model بـ AR
    if (brand && primaryModel) addQ("brand+model-ar", `${brand} ${primaryModel}`, 12, "AR");

    return queries.slice(0, 12);
  }

  async function fetchQueries(queries, cacheKey) {
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

    const t0 = performance.now();

    try {
      const cached = localCacheGet(currentProduct.id);
      if (cached && cached.length > 0) {
        console.log("[Smart Shopper] ⚡ Cache HIT");
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

      console.log("═══════════════════════════════════════════");
      console.log("[Smart Shopper] v48 OPTIMIZED");
      console.log("[Smart Shopper] Title:", currentProduct.title.slice(0, 80));
      console.log("[Smart Shopper] Brand:", brand);
      console.log("[Smart Shopper] Model:", primaryModel);
      console.log("[Smart Shopper] Models:", models);
      console.log("[Smart Shopper] Type:", currentProduct.productType);
      console.log("[Smart Shopper] Keywords:", keywords.slice(0, 8));
      console.log("═══════════════════════════════════════════");

      const queries = buildQueries(currentProduct.title);
      console.log(`[Smart Shopper] ${queries.length} queries`);
      queries.forEach(q => console.log(`  → ${q.name}: "${q.keywords}"`));

      if (!queries.length) {
        sellers = [];
        renderEmpty();
        return;
      }

      const cacheKey = `v48-${currentProduct.id}`;
      const data = await fetchQueries(queries, cacheKey);
      const raw = data?.products || [];
      const t1 = performance.now();
      console.log(`[Smart Shopper] Fetched ${raw.length} in ${Math.round(t1 - t0)}ms`);

      const ctx = {
        productId: currentProduct.id,
        title: currentProduct.title,
        brand,
        primaryModel,
        models,
        keywords,
        referencePrice,
        originalStore,
        productType: currentProduct.productType,
      };

      const scored = [];
      for (const p of raw) {
        const s = fastScore(p, ctx);
        if (s) scored.push(s);
      }

      const t2 = performance.now();
      console.log(`[Smart Shopper] Scored ${scored.length} in ${Math.round(t2 - t1)}ms`);

      const picked = pickBest(scored, ctx);
      console.log(`[Smart Shopper] ✅ FINAL: ${picked.length} in ${Math.round(t2 - t0)}ms total`);

      sellers = picked;

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
          This product seems unique on AliExpress.
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
    return copy.sort((a, b) => b._confidence - a._confidence);
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

      const conf = s._confidence || 0;
      let badge = "";
      if (conf >= 85) badge = `<span class="ss-badge ss-badge-match" style="background:#ecfdf5;color:#065f46">✓ ${conf}%</span>`;
      else if (conf >= 65) badge = `<span class="ss-badge ss-badge-match" style="background:#dbeafe;color:#1e40af">◐ ${conf}%</span>`;
      else if (conf >= 45) badge = `<span class="ss-badge ss-badge-match" style="background:#fef3c7;color:#92400e">◔ ${conf}%</span>`;
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
    await sleep(600);
    currentProduct = extractProduct();
    console.log("[Smart Shopper] v48 ready");
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
  console.log("[Smart Shopper] v48 ready.");
})();