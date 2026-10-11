/* ═══════════════════════════════════════════════════════
   Smart Shopper — Content Script (v26.7)
   Replace "vs" comparison with competitor's own old price.
   ═══════════════════════════════════════════════════════ */

(function () {
  "use strict";

  if (window.__SMART_SHOPPER_LOADED__) return;
  window.__SMART_SHOPPER_LOADED__ = true;

  const T = typeof SS_T === "function" ? SS_T : (k) => k;
  const LANG = typeof SS_LANG !== "undefined" ? SS_LANG : "en";
  const IS_RTL = typeof SS_RTL !== "undefined" ? SS_RTL : false;

  console.log(`[Smart Shopper] v26.7 | Lang: ${LANG}`);

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
    m = txt.match(/\bsave\s+\$?\s*([\d.,]+)/i);
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
    const h1 = document.querySelector("h1[data-pl='product-title'], .product-title-text, h1.product-title");
    if (h1) {
      let node = h1;
      for (let i = 0; i < 6 && node; i++) {
        node = node.parentElement;
        if (!node) break;
        const txt = node.innerText || "";
        if (txt.length > 3000) continue;
        const nums = extractNumbers(txt)
          .filter(n => n.value >= 3)
          .filter(n => {
            const s = Math.max(0, n.index - 70);
            const e = Math.min(txt.length, n.index + 80);
            return !isExcludedContext(txt.slice(s, e));
          });
        if (nums.length) {
          nums.sort((a, b) => b.value - a.value);
          let basePrice = nums[0].value;
          basePrice = applyWelcomeDeal(basePrice, node);
          return basePrice;
        }
      }
    }
    return null;
  }

  function getProductId() {
    const m =
      location.pathname.match(/\/item\/(\d+)/) ||
      location.pathname.match(/(\d{10,})/);
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
  // SMART MATCH
  // ═══════════════════════════════════════════════════════

  async function fetchSmartMatch(product) {
    const bodies = [];
    if (product.id) bodies.push({ productId: product.id });
    if (product.image) bodies.push({ imageUrl: product.image });
    if (product.title) bodies.push({ productTitle: product.title });

    for (const body of bodies) {
      try {
        const key = Object.keys(body)[0];
        const res = await fetch(`${WORKER_URL}/api/smart-match`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const payload = await res.json();
        if (!payload.ok) throw new Error(payload.error || "API error");

        const resp =
          payload.data?.aliexpress_affiliate_product_smartmatch_response ||
          payload.data?.aliexpress_affiliate_productdetail_get_response;

        const products =
          resp?.resp_result?.result?.products?.product ||
          resp?.resp_result?.result?.product || [];

        const list = Array.isArray(products) ? products : [products];
        console.log(`[Smart Shopper] Smart Match (${key}) → ${list.length}`);
        if (list.length > 0) return { ok: true, method: key, products: list };
      } catch (e) {
        console.warn(`[Smart Shopper] ${Object.keys(body)[0]} failed:`, e.message);
      }
    }
    return { ok: false, method: null, products: [] };
  }

  function mapSmartMatchProduct(p) {
    const price = parseFloat(p.target_sale_price || p.sale_price || 0);
    const oldP = parseFloat(p.target_original_price || p.original_price || 0);
    const discount = oldP > price && price > 0 ? Math.round((1 - price / oldP) * 100) : 0;
    const rating = parseFloat(String(p.evaluate_rate || "0").replace("%", "")) / 20;

    return {
      store: p.shop_name || p.store_name || "AliExpress Seller",
      img: p.product_main_image_url || "",
      price,
      oldPrice: oldP,
      discount,
      rating: rating > 0 && rating <= 5 ? +rating.toFixed(1) : 0,
      sold: parseInt(p.lastest_volume || p.volume || 0, 10),
      link: p.promotion_link || p.product_detail_url || "",
      title: p.product_title || p.product_name || "",
      similarity: 100,
      isSmartMatch: true,
    };
  }

  // ═══════════════════════════════════════════════════════
  // IMAGE
  // ═══════════════════════════════════════════════════════

  const BAD_IMG_PATTERNS = [
    "star", "placeholder", "loading", "default", "empty", "blank",
    "no-image", "noimage", "grey", "gray", "spacer", "pixel",
    "transparent", "1x1", "img.alicdn.com/tps",
    "choice", "logo", "icon", "badge", "flag", "avatar",
  ];

  function isBadImage(src) {
    if (!src || !src.startsWith("http")) return true;
    const low = src.toLowerCase();
    for (const p of BAD_IMG_PATTERNS) if (low.includes(p)) return true;
    if (low.includes(".svg") && low.length < 300) return true;
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
    const lazySrc = img.getAttribute("data-lazy-src") || img.getAttribute("lazy-src");
    if (lazySrc && !isBadImage(lazySrc)) return lazySrc.startsWith("//") ? "https:" + lazySrc : lazySrc;
    if (img.src && !isBadImage(img.src)) return img.src;
    return "";
  }

  function extractRealImage(card) {
    for (const img of card.querySelectorAll("img")) {
      const w = img.naturalWidth || img.width || 0;
      const h = img.naturalHeight || img.height || 0;
      if (w > 0 && w < 80) continue;
      if (h > 0 && h < 80) continue;
      const src = getImgSrc(img);
      if (src) return src;
    }
    return "";
  }

  // ═══════════════════════════════════════════════════════
  // CARD PARSING
  // ═══════════════════════════════════════════════════════

  function parseCardPrice(card) {
    const txt = card.innerText || "";
    let current = 0, old = 0;

    const priceEls = card.querySelectorAll("[class*='price'], [class*='Price']");
    for (const el of priceEls) {
      const cls = (el.className || "").toString().toLowerCase();
      const style = (el.getAttribute("style") || "").toLowerCase();
      const elTxt = (el.innerText || "").trim();
      if (!elTxt || isExcludedContext(elTxt)) continue;

      const nums = extractNumbers(elTxt);
      if (!nums.length) continue;
      const v = nums[0].value;
      if (v < 0.5) continue;

      const isOld = /(old|origin|del|through|cross|before|strike)/i.test(cls) || /line-through/.test(style);
      if (isOld) old = Math.max(old, v);
      else current = Math.max(current, v);
    }

    if (!current) {
      const nums = extractNumbers(txt).filter(n => {
        if (n.value < 0.5) return false;
        const s = Math.max(0, n.index - 50);
        const e = Math.min(txt.length, n.index + 60);
        return !isExcludedContext(txt.slice(s, e));
      });
      if (nums.length) {
        nums.sort((a, b) => b.value - a.value);
        current = nums[0].value;
      }
    }

    if (!current) {
      const decimalNums = txt.match(/([\d]+[.,][\d]{2})/g) || [];
      const parsed = decimalNums.map(n => parseFloat(n.replace(",", "."))).filter(v => v >= 0.5);
      if (parsed.length) {
        parsed.sort((a, b) => b - a);
        current = parsed[0];
      }
    }

    current = applyWelcomeDeal(current, card);

    let discount = 0;
    const dMatch = txt.match(/[-−]\s*(\d{1,2})\s*%/);
    if (dMatch) {
      const d = parseInt(dMatch[1], 10);
      if (d >= 5 && d <= 90) discount = d;
    }

    if (old > 0 && old <= current) old = 0;
    if (!discount && old > current && current > 0) discount = Math.round((1 - current / old) * 100);

    return { price: current, oldPrice: old, discount };
  }

  function parseCardTitle(card) {
    return (card.innerText || "")
      .split("\n").map(l => l.trim())
      .filter(l => {
        if (l.length < 10 || l.length > 250) return false;
        if (/^[\d.,$%★]+$/.test(l)) return false;
        if (/^(free shipping|choice|save|new|hot|sale)$/i.test(l)) return false;
        return true;
      })[0] || "";
  }

  function parseCardSold(card) {
    const m = (card.innerText || "").match(/([\d,]+)\s*(sold|orders|vendus|vendidos|verkauft)/i);
    return m ? parseInt(m[1].replace(/,/g, ""), 10) : 0;
  }

  function parseCardRating(card) {
    const m = (card.innerText || "").match(/★\s*([\d.]+)|([\d.]+)\s*★/);
    if (m) {
      const r = parseFloat(m[1] || m[2]);
      if (r > 0 && r <= 5) return r;
    }
    return 0;
  }

  const STOP_WORDS = new Set([
    "for","with","and","the","a","an","of","to","in","on","at","by","is","are",
    "original","new","hot","sale","free","shipping","best","top","quality","high",
    "wholesale","dropshipping","factory","brand","genuine","fast","delivery",
    "1pc","2pcs","3pcs","pcs","set","pack","style","type","you","your","this","that",
    "from","into","only","more","all","any","good","great","item","product","pieces",
    "piece","color","colors","size","sizes","model","series","version",
  ]);

  function getKeywords(title) {
    if (!title) return [];
    return title.replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/)
      .map(w => w.trim())
      .filter(w => w.length > 2 && !STOP_WORDS.has(w.toLowerCase()) && !/^\d+$/.test(w))
      .map(w => w.toLowerCase());
  }

  function countKeywords(text, kw) {
    if (!text || !kw.length) return 0;
    const set = new Set(getKeywords(text));
    let c = 0;
    for (const k of kw) if (set.has(k)) c++;
    return c;
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

  async function autoScroll() {
    const originalY = window.scrollY;
    for (let i = 0; i < 12; i++) {
      window.scrollBy(0, 450);
      await sleep(350);
    }
    window.scrollTo(0, originalY);
    await sleep(800);
    await waitForImages();
  }

  function waitForImages() {
    return new Promise((resolve) => {
      const imgs = Array.from(document.querySelectorAll("img"));
      const pending = imgs.filter(img => !img.complete || img.naturalWidth === 0);
      if (pending.length === 0) return resolve();
      let loaded = 0;
      const total = pending.length;
      const timer = setTimeout(resolve, 4000);
      pending.forEach(img => {
        const done = () => { loaded++; if (loaded >= total) { clearTimeout(timer); resolve(); } };
        img.addEventListener("load", done, { once: true });
        img.addEventListener("error", done, { once: true });
      });
    });
  }

  function scrapePage(currentKeywords) {
    const results = [];
    const seen = new Set();
    const currentUrl = location.href.split("?")[0];
    const links = document.querySelectorAll("a[href*='/item/']");

    console.log(`[Smart Shopper] Page links: ${links.length}`);

    for (const link of links) {
      try {
        const href = link.href.split("?")[0];
        if (!href || href === currentUrl || seen.has(href)) continue;
        const card = findCardContainer(link);
        if (!card) continue;
        const img = extractRealImage(card);
        if (!img) continue;
        const priceInfo = parseCardPrice(card);
        if (!priceInfo.price) continue;
        const title = parseCardTitle(card);
        if (!title || title.length < 8) continue;
        const kwMatches = countKeywords(title, currentKeywords);
        if (kwMatches < 2) continue;
        const sold = parseCardSold(card);
        const rating = parseCardRating(card);
        seen.add(href);
        results.push({
          store: title.slice(0, 70).trim(),
          img,
          price: priceInfo.price,
          oldPrice: priceInfo.oldPrice,
          discount: priceInfo.discount,
          rating,
          sold,
          link: href,
          similarity: Math.min(kwMatches * 15, 80),
          isSmartMatch: false,
        });
      } catch (_) {}
    }
    console.log(`[Smart Shopper] Page matched: ${results.length}`);
    return results;
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
      const smart = await fetchSmartMatch(currentProduct);
      if (smart.ok && smart.products.length > 0) {
        sellers = rankProducts(smart.products.map(mapSmartMatchProduct));
        updateSourceLabel("smart");
        renderList();
        return;
      }
      const currentKeywords = getKeywords(currentProduct.title);
      await autoScroll();
      const candidates = scrapePage(currentKeywords);
      sellers = rankProducts(candidates);
      updateSourceLabel("page");
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
    el.textContent = mode === "smart" ? T("sameProduct") : mode === "page" ? T("similarMatched") : T("scanning");
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

    list.innerHTML = items.slice(0, 12).map((s, i) => {
      const rank = i + 1;
      const isCheap = s.price === minPrice && s.price > 0;
      const rowClass = rank === 1 ? "ss-best" : (isCheap ? "ss-cheap" : "");
      const rankClass = rank <= 3 ? `ss-r${rank}` : "";

      let tag = "";
      if (activeFilter === "cheap" && rank === 1) tag = `<span class="ss-tag ss-cheap">${T("cheapestTag")}</span>`;
      else if (activeFilter === "discount" && rank === 1) tag = `<span class="ss-tag ss-hot">${T("bestDeal")}</span>`;
      else if (activeFilter === "sold" && rank === 1) tag = `<span class="ss-tag ss-top">${T("mostSoldTag")}</span>`;
      else if (activeFilter === "best" && rank === 1) tag = `<span class="ss-tag ss-best">${T("bestValueTag")}</span>`;
      else if (isCheap) tag = `<span class="ss-tag ss-cheap">${T("bestPrice")}</span>`;

      // ⭐ السعر القديم للمنتج نفسه (مشطوب)
      const oldPriceHtml = s.oldPrice > 0
        ? `<span class="ss-old-price">${formatPrice(s.oldPrice, currentProduct.currency)}</span>`
        : "";

      const discountBadge = s.discount > 0 ? `<span class="ss-discount">-${s.discount}%</span>` : "";
      const ratingHtml = s.rating > 0 ? `<span class="ss-rating">★ ${s.rating.toFixed(1)}</span>` : "";
      const soldHtml = s.sold > 0 ? `<span class="ss-sold">${fmt(s.sold)} ${T("sold")}</span>` : "";
      const metaItems = [ratingHtml, soldHtml].filter(Boolean).join('<span class="ss-sep">·</span>');

      const imgHtml = s.img
        ? `<img src="${s.img}" loading="lazy" onerror="this.style.display='none';this.parentElement.innerHTML='🖼️'">`
        : `🖼️`;

      return `
        <div class="ss-row ${rowClass}" data-idx="${i}">
          ${tag}
          <div class="ss-rank ${rankClass}">${rank}</div>
          <div class="ss-thumb">${imgHtml}</div>
          <div class="ss-info">
            <div class="ss-store">${esc(s.store)}</div>
            <div class="ss-meta">${metaItems}</div>
          </div>
          <div class="ss-price-col">
            <div class="ss-price-line">
              <span class="ss-price-now">${formatPrice(s.price, currentProduct.currency)}</span>
              ${discountBadge}
            </div>
            ${oldPriceHtml ? `<div class="ss-old-line">${oldPriceHtml}</div>` : ""}
          </div>
        </div>
      `;
    }).join("");

    list.querySelectorAll(".ss-row").forEach(row => {
      row.addEventListener("click", () => {
        const item = items[+row.dataset.idx];
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
    await sleep(1500);
    currentProduct = extractProduct();
    console.log("[Smart Shopper] v26.7 — Own old price");
    console.log("[Smart Shopper] Product:", currentProduct);
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
  console.log("[Smart Shopper] v26.7 ready.");
})();