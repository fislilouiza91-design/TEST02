/* ═══════════════════════════════════════════════════════
   Smart Shopper — Content Script (v44 MEGA SORT)
   + ترتيب النافذة: تطابق صورة → تشابه → أفضل سعر
   ═══════════════════════════════════════════════════════ */

(function () {
  "use strict";

  if (window.__SMART_SHOPPER_LOADED__) return;
  window.__SMART_SHOPPER_LOADED__ = true;

  const T = typeof SS_T === "function" ? SS_T : (k) => k;
  const LANG = typeof SS_LANG !== "undefined" ? SS_LANG : "en";
  const IS_RTL = typeof SS_RTL !== "undefined" ? SS_RTL : false;

  console.log(`[Smart Shopper] v44 MEGA SORT | Lang: ${LANG}`);

  const PANEL_ID = "ss-floating-panel";
  const WORKER_URL = "https://cold-art-c5df.fislilouiza91.workers.dev";

  let currentProduct = null;
  let sellers = [];
  // ⭐ الافتراضي "best" = صورة → تشابه → سعر
  let activeFilter = "best";
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

  function extractProduct() {
    const img = getImage();
    return {
      id: getProductId(),
      title: getTitle(),
      image: img,
      imageHash: extractImageHash(img),
      price: getPrice(),
      currency: detectCurrency(),
      sold: getSold(),
      rating: getRating(),
      store: getOriginalStore(),
      url: location.href.split("?")[0],
    };
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

  function extractModels(title) {
    if (!title) return [];
    const set = new Set();
    let m = title.match(/\b[A-Z]{2,5}\d{1,5}\b/g) || [];
    m.forEach(x => set.add(x.toUpperCase()));
    m = title.match(/\b\d{1,3}[A-Z]{2,5}\b/g) || [];
    m.forEach(x => set.add(x.toUpperCase()));
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
  // BUILD MEGA QUERIES
  // ═══════════════════════════════════════════════════════

  function buildMegaQueries(title) {
    const brand = extractBrand(title);
    const primaryModel = getPrimaryModel(title);
    const allModels = extractModels(title);
    const kws = getKeywords(title);
    const queries = [];
    const seenKw = new Set();

    function addQ(name, kw) {
      kw = (kw || "").trim();
      if (!kw) return;
      const key = kw.toLowerCase();
      if (seenKw.has(key)) return;
      seenKw.add(key);
      queries.push({ name, keywords: kw, pageSize: 50 });
    }

    if (brand && primaryModel) addQ("brand+model", `${brand} ${primaryModel}`);
    if (brand && primaryModel) addQ("brand-model-p2", `${brand} ${primaryModel}`, 2);
    if (primaryModel) {
      addQ("model-only", primaryModel);
      addQ("model-p2", primaryModel, 2);
    }
    if (brand && kws.length >= 2) addQ("brand+2kw", `${brand} ${kws[0]} ${kws[1]}`);
    if (brand && kws.length >= 3) addQ("brand+3kw", `${brand} ${kws[0]} ${kws[1]} ${kws[2]}`);
    if (brand && kws.length >= 1) addQ("brand+kw1", `${brand} ${kws[0]}`);
    if (brand) addQ("brand-only", brand);
    if (primaryModel && kws.length >= 1) addQ("model+kw", `${primaryModel} ${kws[0]}`);
    if (primaryModel && brand) addQ("model+brand+kw", `${primaryModel} ${brand} ${kws[0]}`);
    if (allModels.length >= 2) addQ("all-models", allModels.slice(0, 3).join(" "));
    if (kws.length >= 2) addQ("kw2", `${kws[0]} ${kws[1]}`);
    if (kws.length >= 3) addQ("kw3", `${kws[0]} ${kws[1]} ${kws[2]}`);
    if (kws.length >= 4) addQ("kw4", kws.slice(0, 4).join(" "));
    if (kws.length >= 3) addQ("kw-spread", `${kws[0]} ${kws[2]}`);

    return queries.slice(0, 20);
  }

  async function fetchMegaSearch(queries) {
    const res = await fetch(`${WORKER_URL}/api/deep-search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ queries }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const payload = await res.json();
    if (!payload.ok) throw new Error(payload.error || "API error");
    return payload.data;
  }

  // ═══════════════════════════════════════════════════════
  // SCORING (5-TIER)
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
    const hashMatch = ctx.imageHash && imageHash && ctx.imageHash === imageHash;
    const hasPrimaryModel = ctx.primaryModel && titleUpper.includes(ctx.primaryModel);
    const cardBrand = extractBrand(title);
    const brandMatch = ctx.brand && cardBrand && ctx.brand === cardBrand;
    const kwMatches = countKeywords(title, ctx.keywords);

    let tier = 0;
    let score = 0;

    if (hashMatch) {
      tier = 1;
      score = 200;
    } else if (brandMatch && hasPrimaryModel && kwMatches >= 2) {
      tier = 1; score = 150;
    } else if (brandMatch && hasPrimaryModel) {
      tier = 2; score = 120;
    } else if (hasPrimaryModel && kwMatches >= 3) {
      tier = 2; score = 100;
    } else if (brandMatch && kwMatches >= 3) {
      tier = 3; score = 80;
    } else if (hasPrimaryModel && kwMatches >= 2) {
      tier = 3; score = 70;
    } else if (brandMatch && kwMatches >= 2) {
      tier = 4; score = 50;
    } else if (kwMatches >= 4) {
      tier = 4; score = 40;
    } else if (kwMatches >= 3) {
      tier = 5; score = 25;
    } else {
      return null;
    }

    if (ctx.referencePrice > 0) {
      const ratio = price / ctx.referencePrice;
      if (ratio < 0.15 || ratio > 7.0) return null;
    }

    const finalOld = (oldP > price && price > 0) ? oldP : 0;
    const discount = finalOld > 0 ? Math.round((1 - price / finalOld) * 100) : 0;

    return {
      _tier: tier,
      _score: score,
      _id: id,
      _store: store.toLowerCase(),
      _imageHash: imageHash,
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
      kwMatches,
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
      if (accepted.length >= 20) break;
    }
    return accepted;
  }

  // ⭐⭐⭐ NEW: ترتيب المبدئي = صورة → تشابه → سعر
  function rankProducts(products) {
    return products.map(p => {
      let rank = p._score;
      if (p.rating >= 4.5) rank += 5;
      if (p.sold >= 100) rank += 3;
      return { ...p, _rank: rank };
    }).sort((a, b) => {
      // 1) تطابق الصورة أولاً (مطلق)
      if (a.isHashMatch !== b.isHashMatch) return a.isHashMatch ? -1 : 1;
      // 2) التشابه النصي
      if (Math.abs(b._score - a._score) > 5) return b._score - a._score;
      // 3) السعر الأفضل (الأرخص أولاً)
      return a.price - b.price;
    });
  }

  // ═══════════════════════════════════════════════════════
  // PANEL
  // ═══════════════════════════════════════════════════════

  function buildPanel() {
    document.getElementById(PANEL_ID)?.remove();
    const panel = document.createElement("div");
    panel.id = PANEL_ID;
    if (IS_RTL) panel.setAttribute("dir", "rtl");

    // ⭐ ترتيب الأزرار: Best أولاً + active
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
        <button class="ss-chip ss-active" data-f="best">${T("bestValue")}</button>
        <button class="ss-chip" data-f="cheap">${T("cheapest")}</button>
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
    panel.querySelector("[data-action='refresh']").onclick = () => { if (!isScanning) doScan(); };
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
      const brand = extractBrand(currentProduct.title);
      const primaryModel = getPrimaryModel(currentProduct.title);
      const models = extractModels(currentProduct.title);
      const keywords = getKeywords(currentProduct.title);
      const referencePrice = currentProduct.price;
      const originalStore = currentProduct.store || "";
      const imageHash = currentProduct.imageHash || "";

      console.log("═══════════════════════════════════════════");
      console.log("[Smart Shopper] v44 MEGA SORT");
      console.log("[Smart Shopper] Product:", currentProduct.title.slice(0, 60));
      console.log("[Smart Shopper] Image Hash:", imageHash || "N/A");
      console.log("═══════════════════════════════════════════");

      const queries = buildMegaQueries(currentProduct.title);
      if (!queries.length) { sellers = []; renderEmpty(); return; }

      const data = await fetchMegaSearch(queries);
      const raw = data?.products || [];
      console.log(`[Smart Shopper] Raw: ${raw.length} unique`);

      const ctx = { productId: currentProduct.id, brand, primaryModel, models, keywords, referencePrice, originalStore, imageHash };

      const scored = [];
      for (const p of raw) {
        const s = scoreProduct(p, ctx);
        if (s) scored.push(s);
      }

      const picked = pickProgressive(scored, ctx);
      console.log(`[Smart Shopper] ✅ FINAL: ${picked.length}`);

      sellers = rankProducts(picked);
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
        <div class="ss-empty-sub">This product seems unique. Try another product.</div>
        <button class="ss-empty-btn" id="ss-retry">${T("scanAgain")}</button>
      </div>
    `;
    document.getElementById("ss-retry")?.addEventListener("click", () => doScan());
  }

  // ⭐⭐⭐ NEW SORT: صورة → تشابه → سعر
  function sortSellers(arr, f) {
    const copy = [...arr];

    // تطابق الصورة دائماً في الأعلى في كل الفلاتر
    const byImage = (a, b) => {
      if (a.isHashMatch !== b.isHashMatch) return a.isHashMatch ? -1 : 1;
      return 0;
    };
    // التشابه الثانوي
    const bySimilarity = (a, b) => {
      if (Math.abs(b._score - a._score) > 5) return b._score - a._score;
      return 0;
    };

    if (f === "cheap") {
      return copy.sort((a, b) => byImage(a, b) || a.price - b.price);
    }
    if (f === "discount") {
      return copy.sort((a, b) => byImage(a, b) || (b.discount || 0) - (a.discount || 0));
    }
    if (f === "sold") {
      return copy.sort((a, b) => byImage(a, b) || (b.sold || 0) - (a.sold || 0));
    }
    // "best" (افتراضي) = صورة → تشابه → سعر
    return copy.sort((a, b) =>
      byImage(a, b) ||
      bySimilarity(a, b) ||
      a.price - b.price
    );
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
      const cardClass = (rank === 1 ? "ss-best " : "") + (s.isHashMatch ? "ss-imgmatch " : "") + (isCheap && !s.isHashMatch ? "ss-cheap" : "");
      const rankClass = rank <= 3 ? `ss-r${rank}` : "";

      // شارة أولوية الترتيب
      let badge = "";
      if (s.isHashMatch) {
        badge = `<span class="ss-badge ss-badge-exact">🎯 EXACT IMG</span>`;
      } else if (s.brandMatch && s.hasPrimaryModel) {
        badge = `<span class="ss-badge ss-badge-match">✓ SAME</span>`;
      } else if (activeFilter === "cheap" && rank === 1) {
        badge = `<span class="ss-badge ss-badge-cheap">${T("cheapestTag")}</span>`;
      } else if (activeFilter === "discount" && rank === 1) {
        badge = `<span class="ss-badge ss-badge-hot">${T("bestDeal")}</span>`;
      } else if (activeFilter === "sold" && rank === 1) {
        badge = `<span class="ss-badge ss-badge-top">${T("mostSoldTag")}</span>`;
      } else if (isCheap) {
        badge = `<span class="ss-badge ss-badge-cheap">${T("bestPrice")}</span>`;
      }

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

      // ⭐ شريط النتيجة: IMG أو نسبة التشابه
      const matchScore = s.isHashMatch ? 100 : Math.min(100, s._score);
      const scoreColor = s.isHashMatch ? "" : (s._score >= 100 ? "mid" : "low");
      const scoreIcon = s.isHashMatch ? "🎯" : "≈";
      const matchBar = `
        <div class="ss-match-line">
          <span class="ss-match-text">${scoreIcon}</span>
          <div class="ss-match-track"><div class="ss-match-fill ${scoreColor}" style="width:${matchScore}%"></div></div>
          <span class="ss-match-text">${matchScore}%</span>
        </div>
      `;

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
              ${matchBar}
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
    console.log("[Smart Shopper] v44 MEGA SORT ready");
    console.log("[Smart Shopper] Image Hash:", currentProduct.imageHash);
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