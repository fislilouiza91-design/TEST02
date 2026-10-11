/* ═══════════════════════════════════════════════════════
   Smart Shopper — Content Script (v38)
   Multi-search + smart matching.
   ═══════════════════════════════════════════════════════ */

(function () {
  "use strict";

  if (window.__SMART_SHOPPER_LOADED__) return;
  window.__SMART_SHOPPER_LOADED__ = true;

  const T = typeof SS_T === "function" ? SS_T : (k) => k;
  const LANG = typeof SS_LANG !== "undefined" ? SS_LANG : "en";
  const IS_RTL = typeof SS_RTL !== "undefined" ? SS_RTL : false;

  console.log(`[Smart Shopper] v38 | Lang: ${LANG}`);

  const PANEL_ID = "ss-floating-panel";
  const WORKER_URL = "https://cold-art-c5df.fislilouiza91.workers.dev";

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

  function extractProduct() {
    return {
      id: getProductId(),
      title: getTitle(),
      image: getImage(),
      price: getPrice(),
      currency: detectCurrency(),
      sold: getSold(),
      rating: getRating(),
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
    let m = title.match(/\b[A-Z]{1,4}\d{1,5}[A-Z]?\b/g) || [];
    m.forEach(x => set.add(x.toUpperCase()));
    m = title.match(/\b\d{1,5}[A-Z]{2,4}\b/g) || [];
    m.forEach(x => set.add(x.toUpperCase()));
    return Array.from(set).slice(0, 5);
  }

  function countMatches(text, kw) {
    if (!text || !kw.length) return 0;
    const set = new Set(getKeywords(text));
    let c = 0;
    for (const k of kw) if (set.has(k)) c++;
    return c;
  }

  function countModelMatches(text, models) {
    if (!text || !models.length) return 0;
    const upper = text.toUpperCase();
    let c = 0;
    for (const m of models) if (upper.includes(m)) c++;
    return c;
  }

  /**
   * ⭐ بناء 3 كلمات بحث مختلفة (للبحث المتعدد)
   */
  function buildSearchQueries(title) {
    const brand = extractBrand(title);
    const models = extractModels(title);
    const kws = getKeywords(title);

    const queries = new Set();

    // 1) brand + 2 models
    if (brand && models.length >= 2) {
      queries.add(`${brand} ${models.slice(0, 2).join(" ")}`);
    }

    // 2) brand + top keywords (2 words)
    if (brand && kws.length >= 2) {
      queries.add(`${brand} ${kws.slice(0, 2).join(" ")}`);
    }

    // 3) brand + 1 model
    if (brand && models.length) {
      queries.add(`${brand} ${models[0]}`);
    }

    // 4) top 3 keywords
    if (kws.length >= 3) {
      queries.add(kws.slice(0, 3).join(" "));
    }

    // 5) top 2 keywords
    if (kws.length >= 2) {
      queries.add(kws.slice(0, 2).join(" "));
    }

    return Array.from(queries).slice(0, 3); // حد أقصى 3
  }

  async function searchProducts(keyword) {
    const res = await fetch(`${WORKER_URL}/api/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ keyword, pageSize: 50 }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const payload = await res.json();
    if (!payload.ok) throw new Error(payload.error || "API error");

    const resp = payload.data?.aliexpress_affiliate_product_query_response;
    const products = resp?.resp_result?.result?.products?.product || [];
    return Array.isArray(products) ? products : [products];
  }

  // ═══════════════════════════════════════════════════════
  // MAP + FILTER
  // ═══════════════════════════════════════════════════════

  function mapAndFilter(p, currentKeywords, currentBrand, currentModels, referencePrice, seenIds) {
    const price = parseFloat(p.target_sale_price || p.sale_price || 0);
    const oldP = parseFloat(p.target_original_price || p.original_price || 0);
    const rating = parseFloat(String(p.evaluate_rate || "0").replace("%", "")) / 20;
    const title = p.product_title || p.product_name || "";
    const id = String(p.product_id || "");

    if (!id || !price || !title) return null;
    if (id === currentProduct.id) return null;
    if (seenIds.has(id)) return null;

    const cardBrand = extractBrand(title);
    const brandMatch = currentBrand && cardBrand && currentBrand === cardBrand;
    const modelMatches = countModelMatches(title, currentModels);
    const kwMatches = countMatches(title, currentKeywords);

    // ⭐ فلتر مرن: brand OR 1 model OR 1 keyword
    const passes = brandMatch || modelMatches >= 1 || kwMatches >= 1;
    if (!passes) return null;

    // ⭐ فلتر السعر: 25% - 500%
    if (referencePrice > 0) {
      const ratio = price / referencePrice;
      if (ratio < 0.25 || ratio > 5.0) return null;
    }

    const finalOld = (oldP > price && price > 0) ? oldP : 0;
    const discount = finalOld > 0 ? Math.round((1 - price / finalOld) * 100) : 0;

    // ⭐ حساب النقاط
    const score =
      (brandMatch ? 40 : 0) +
      Math.min(modelMatches * 20, 40) +
      Math.min(kwMatches * 8, 24);

    seenIds.add(id);

    return {
      store: p.shop_name || p.store_name || "AliExpress Seller",
      img: p.product_main_image_url || "",
      price,
      oldPrice: finalOld,
      discount,
      rating: rating > 0 && rating <= 5 ? +rating.toFixed(1) : 0,
      sold: parseInt(p.lastest_volume || p.volume || 0, 10),
      link: p.promotion_link || p.product_detail_url || "",
      title,
      similarity: Math.min(score, 100),
      brandMatch,
      modelMatches,
      kwMatches,
    };
  }

  function rankProducts(products) {
    return products.map(p => {
      let rank = p.similarity * 0.7;
      if (p.rating >= 4.5) rank += 8;
      else if (p.rating >= 4) rank += 4;
      if (p.sold >= 500) rank += 8;
      else if (p.sold >= 100) rank += 5;
      else if (p.sold >= 20) rank += 2;
      return { ...p, _rank: rank };
    }).sort((a, b) => {
      if (Math.abs(b._rank - a._rank) > 2) return b._rank - a._rank;
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
          <button class="ss-btn-icon" data-action="refresh" title="Rescan">↻</button>
          <button class="ss-btn-icon" data-action="minimize" title="Minimize">−</button>
          <button class="ss-btn-icon" data-action="close" title="Close">×</button>
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
      const currentKeywords = getKeywords(currentProduct.title);
      const currentBrand = extractBrand(currentProduct.title);
      const currentModels = extractModels(currentProduct.title);
      const referencePrice = currentProduct.price;

      console.log("═══════════════════════════════════════════");
      console.log("[Smart Shopper] Product:", currentProduct.title.slice(0, 60));
      console.log("[Smart Shopper] Brand:", currentBrand);
      console.log("[Smart Shopper] Models:", currentModels);
      console.log("[Smart Shopper] Keywords:", currentKeywords.slice(0, 6));
      console.log("═══════════════════════════════════════════");

      // ⭐ بناء 3 كلمات بحث
      const queries = buildSearchQueries(currentProduct.title);
      console.log("[Smart Shopper] Search queries:", queries);

      if (!queries.length) {
        sellers = [];
        renderEmpty();
        return;
      }

      // ⭐ 3 عمليات بحث متوازية
      const seenIds = new Set();
      const allResults = [];

      for (const q of queries) {
        try {
          console.log(`[Smart Shopper] 🔎 Searching: "${q}"`);
          const raw = await searchProducts(q);
          console.log(`[Smart Shopper]   → ${raw.length} results`);

          for (const p of raw) {
            const mapped = mapAndFilter(p, currentKeywords, currentBrand, currentModels, referencePrice, seenIds);
            if (mapped) {
              console.log(`[Smart Shopper]   ✅ "${mapped.title.slice(0, 40)}" (score: ${mapped.similarity})`);
              allResults.push(mapped);
            }
          }
        } catch (e) {
          console.warn(`[Smart Shopper] Query failed: "${q}"`, e.message);
        }
      }

      console.log(`[Smart Shopper] ✅ Total: ${allResults.length}`);

      sellers = rankProducts(allResults);
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
    list.innerHTML = Array.from({ length: 3 }).map(() => `
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
        <div class="ss-empty-title">No similar products found</div>
        <div class="ss-empty-sub">
          AliExpress doesn't list this product from other sellers right now.
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

    list.innerHTML = items.slice(0, 15).map((s, i) => {
      const rank = i + 1;
      const isCheap = s.price === minPrice && s.price > 0;
      const cardClass = rank === 1 ? "ss-best" : (isCheap ? "ss-cheap" : "");
      const rankClass = rank <= 3 ? `ss-r${rank}` : "";

      let badge = "";
      if (activeFilter === "cheap" && rank === 1) badge = `<span class="ss-badge ss-badge-cheap">${T("cheapestTag")}</span>`;
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
    console.log("[Smart Shopper] v38 ready");
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
  console.log("[Smart Shopper] v38 ready.");
})();