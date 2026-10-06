/* ═══════════════════════════════════════════════════════
   Smart Shopper — Content Script (v26 - Price Accuracy Fix)
   Fixed: Takes lowest variant price + adds disclaimer. Strict dedup.
   ═══════════════════════════════════════════════════════ */

(function () {
  "use strict";

  if (window.__SMART_SHOPPER_LOADED__) return;
  window.__SMART_SHOPPER_LOADED__ = true;

  const T = typeof SS_T === "function" ? SS_T : (k) => k;
  const LANG = typeof SS_LANG !== "undefined" ? SS_LANG : "en";
  const IS_RTL = typeof SS_RTL !== "undefined" ? SS_RTL : false;

  console.log(`[Smart Shopper] v26 | Language: ${LANG}`);

  const PANEL_ID = "ss-floating-panel";
  const WORKER_URL = "https://smart-shopper-proxy.fislilouiza91.workers.dev";
  const CACHE_TTL = 1000 * 60 * 30;

  let currentProduct = null;
  let sellers = [];
  let activeFilter = "best";
  let minimized = false;
  let dataSource = "none";
  let isScanning = false;

  // ═══════════════════════════════════════════════════════
  // ⭐ أداة استخراج رقم المنتج الفريد (لمنع التكرار)
  // ═══════════════════════════════════════════════════════
  function getProductId(url) {
    if (!url) return "";
    const m = url.match(/\/item\/(\d+)\.html/) || url.match(/\/i\/(\d+)\.html/);
    return m ? m[1] : url; 
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

  // ═══════════════════════════════════════════════════════
  // CURRENCY & HELPERS
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
    const symbolMap = { USD: "$", EUR: "€", GBP: "£", SAR: "﷼", DA: "DA ", TRY: "₺", RUB: "₽", CNY: "¥" };
    const sym = symbolMap[currency] || "$";
    const num = v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return IS_RTL ? `${num} ${sym.trim()}` : `${sym}${num}`;
  }

  function isExcludedContext(ctx) {
    return /(pieces|pcs|piece|bulk|wholesale|minimum|per piece|\d+\s*\+|installment|x\s*\$|×\s*\$|off\s+on|off\s+us|save|saving|coupon|discount\s+\$|reduction|with\s+coins|extra\s+%|tax)/i.test(ctx);
  }

  // ═══════════════════════════════════════════════════════
  // PRICE EXTRACTION (محسّن v26)
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

    // ⭐ محدّدات أكثر دقة لسعر المنتج الرئيسي
    const mainPriceSels = [
      ".product-price-value",
      ".es--wrap--MvFvp .es--text--VHm7A",
      "[class*='price--current']",
      "[class*='product-price']",
      "meta[property='product:price:amount']",
      "meta[property='og:price:amount']",
      "meta[itemprop='price']",
    ];
    for (const sel of mainPriceSels) {
      const el = document.querySelector(sel);
      if (!el) continue;
      const txt = el.innerText || el.getAttribute("content") || "";
      const nums = extractNumbers(txt);
      if (nums.length) {
        const v = nums[0].value;
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
      if (!txt) continue;
      if (isExcludedContext(txt)) continue;

      const nums = extractNumbers(txt);
      if (!nums.length) continue;

      const value = nums[0].value;
      if (value < 3) continue;

      const isCurrent = /(current|sale|now|main|primary|actual)/i.test(cls);
      const fontSize = parseFloat(window.getComputedStyle(el).fontSize) || 12;

      candidates.push({ value, isCurrent, fontSize, el });
    }

    if (candidates.length) {
      candidates.sort((a, b) => {
        if (a.isCurrent !== b.isCurrent) return a.isCurrent ? -1 : 1;
        return b.fontSize - a.fontSize;
      });
      return { price: candidates[0].value, currency: detectCurrency() };
    }

    const h1 = document.querySelector("h1[data-pl='product-title'], .product-title-text, h1.product-title");
    if (h1) {
      let node = h1;
      for (let i = 0; i < 6 && node; i++) {
        node = node.parentElement;
        if (!node) break;
        const txt = node.innerText || "";
        if (txt.length > 3000) continue;

        const nums = extractNumbers(txt);
        const valid = nums
          .filter(n => n.value >= 3)
          .filter(n => {
            const s = Math.max(0, n.index - 70);
            const e = Math.min(txt.length, n.index + 80);
            const ctx = txt.slice(s, e);
            return !isExcludedContext(ctx);
          });

        if (valid.length) {
          valid.sort((a, b) => a.value - b.value); // ⭐ ترتيب تصاعدي
          return { price: valid[0].value, currency: detectCurrency() }; // ⭐ أخذ الأقل
        }
      }
    }

    const top40 = (document.body.innerText || "").slice(0, 4000);
    const nums = extractNumbers(top40).filter(n => n.value >= 3).filter(n => {
      const s = Math.max(0, n.index - 70);
      const e = Math.min(top40.length, n.index + 80);
      return !isExcludedContext(top40.slice(s, e));
    });
    if (nums.length) {
      nums.sort((a, b) => a.value - b.value); // ⭐ ترتيب تصاعدي
      return { price: nums[0].value, currency: detectCurrency() }; // ⭐ أخذ الأقل
    }

    return { price: null, currency: "USD" };
  }

  function getTitle() {
    const sels = [
      "h1[data-pl='product-title']",
      ".product-title-text",
      ".pdp-comp-title",
      "[class*='title--wrap'] h1",
      "[class*='product-title']",
      "h1.product-title",
    ];
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
    const sels = ["[class*='reviewer--rating']", ".pdp-review-rating", "[class*='rating--value']"];
    for (const sel of sels) {
      const el = document.querySelector(sel);
      if (!el) continue;
      const m = (el.innerText || "").match(/([0-5](?:\.\d+)?)/);
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

  // ═══════════════════════════════════════════════════════
  // IMAGES
  // ═══════════════════════════════════════════════════════

  const BAD_PATTERNS = ["star", "placeholder", "loading", "default", "empty", "blank", "no-image", "noimage", "grey", "gray", "spacer", "pixel", "transparent", "1x1"];

  function isBadImage(src) {
    if (!src || !src.startsWith("http")) return true;
    const low = src.toLowerCase();
    for (const p of BAD_PATTERNS) if (low.includes(p)) return true;
    if (low.includes(".svg") && low.length < 300) return true;
    return false;
  }

  function getImgSrc(img) {
    if (!img) return "";
    if (img.currentSrc && !isBadImage(img.currentSrc)) return img.currentSrc;
    const srcset = img.getAttribute("srcset");
    if (srcset) {
      const entries = srcset.split(",").map(s => s.trim().split(" ")[0]);
      for (let i = entries.length - 1; i >= 0; i--) {
        if (!isBadImage(entries[i])) return entries[i];
      }
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

  // ═══════════════════════════════════════════════════════
  // AUTO-SCROLL
  // ═══════════════════════════════════════════════════════

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

  // ═══════════════════════════════════════════════════════
  // KEYWORDS
  // ═══════════════════════════════════════════════════════

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

  // ═══════════════════════════════════════════════════════
  // CARD PRICE EXTRACTION (⭐ v26: أخذ أقل سعر متاح)
  // ═══════════════════════════════════════════════════════

  function extractPriceInfoFromCard(card) {
    const txt = card.innerText || "";
    let discount = 0;
    const dMatch = txt.match(/[-−]\s*(\d{1,2})\s*%/);
    if (dMatch) discount = parseInt(dMatch[1], 10);

    const priceEls = card.querySelectorAll("[class*='price'], [class*='Price']");
    let current = Infinity; // ⭐ نبدأ بـ Infinity للبحث عن الأقل
    let old = 0;

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

      if (isOld) { 
        if (v > old) old = v; 
      } else { 
        // ⭐ نأخذ أقل سعر (السعر المبدئي) وليس الأغلى
        if (v < current) current = v; 
      }
    }

    if (current === Infinity) current = 0;

    if (old > 0 && discount > 0 && discount < 90) {
      const expected = old * (1 - discount / 100);
      if (!current || Math.abs(current - expected) / expected > 0.4) {
        current = Math.round(expected * 100) / 100;
      }
    }

    if (!current) {
      const numbers = extractNumbers(txt);
      const valid = [];
      for (const n of numbers) {
        if (n.value < 0.5) continue;
        const s = Math.max(0, n.index - 60);
        const e = Math.min(txt.length, n.index + 70);
        const ctx = txt.slice(s, e);
        if (isExcludedContext(ctx)) continue;
        valid.push(n.value);
      }
      if (valid.length) {
        valid.sort((a, b) => a - b);
        current = valid[0]; // ⭐ أخذ الأقل
        if (valid.length > 1) {
          const highest = valid[valid.length - 1];
          if (highest / current > 1.15) old = highest;
        }
      }
    }

    if (old > 0 && old <= current) old = 0;
    if (discount < 0 || discount > 90) discount = 0;
    if (!discount && old > current && current > 0) {
      discount = Math.round((1 - current / old) * 100);
    }

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
    const m2 = txt.match(/([4-5][.,]\d)/);
    if (m2) {
      const r = parseFloat(m2[1].replace(",", "."));
      if (r > 3 && r <= 5) return r;
    }
    return 0;
  }

  // ═══════════════════════════════════════════════════════
  // SCRAPER (مع منع التكرار)
  // ═══════════════════════════════════════════════════════

  function findCardContainer(link) {
    let cur = link;
    for (let i = 0; i < 6 && cur; i++) {
      cur = cur.parentElement;
      if (!cur) return null;
      if (cur.querySelector("img") && (cur.innerText || "").length > 15 && cur.offsetWidth > 100 && cur.offsetHeight > 80) return cur;
    }
    return null;
  }

  function collectCandidates(currentKeywords) {
    const results = [];
    const seenProductIds = new Set();
    const currentUrl = location.href.split("?")[0];
    const currentId = getProductId(currentUrl);
    const links = document.querySelectorAll("a[href*='/item/']");
    console.log(`[Smart Shopper] Scanning ${links.length} links`);

    for (const link of links) {
      try {
        const href = link.href.split("?")[0];
        const productId = getProductId(href);

        if (!productId || productId === currentId || seenProductIds.has(productId)) continue;

        const card = findCardContainer(link);
        if (!card) continue;

        const img = extractRealImage(card);
        if (!img) continue;

        const priceInfo = extractPriceInfoFromCard(card);
        if (!priceInfo.price) continue;

        const title = extractTitleFromCard(card);
        if (!title || title.length < 8) continue;

        seenProductIds.add(productId);

        const matchCount = countMatches(title, currentKeywords);
        const sold = extractSoldFromCard(card);
        const rating = extractRatingFromCard(card);

        results.push({
          store: shortenTitle(title),
          img,
          price: priceInfo.price,
          oldPrice: priceInfo.oldPrice,
          discount: priceInfo.discount,
          rating,
          sold: sold || 0,
          link: href,
          matchCount,
        });
      } catch (_) {}
    }
    console.log(`[Smart Shopper] Candidates after ID deduplication: ${results.length}`);
    return results;
  }

  function pickBest(candidates, cp) {
    if (!candidates.length) return [];

    let relevant = candidates.filter(c => c.matchCount >= 2);
    if (relevant.length < 2) relevant = candidates.filter(c => c.matchCount >= 1);

    let filtered = relevant;
    if (cp && cp > 0) {
      filtered = relevant.filter(c => c.price >= cp * 0.6 && c.price <= cp * 1.7);
      if (filtered.length < 2) filtered = relevant.filter(c => c.price >= cp * 0.4 && c.price <= cp * 2.5);
      if (filtered.length < 1) filtered = candidates.filter(c => c.matchCount >= 3 && c.price >= cp * 0.3 && c.price <= cp * 4.0);
    }

    if (!filtered.length) return [];

    const scored = filtered.map(c => {
      let score = c.matchCount * 10;
      if (cp && cp > 0) {
        const ratio = c.price / cp;
        if (ratio >= 0.7 && ratio <= 1.3) score += 20;
        else if (ratio >= 0.5 && ratio <= 1.7) score += 10;
      }
      if (c.rating >= 4.5) score += 5;
      if (c.sold > 100) score += 3;
      if (c.discount > 20) score += 2;
      return { ...c, _score: score };
    });

    scored.sort((a, b) => (b._score !== a._score ? b._score - a._score : a.price - b.price));
    const threshold = Math.max(3, Math.max(...scored.map(s => s._score)) * 0.3);
    return scored.filter(s => s._score >= threshold).slice(0, 15);
  }

  // ═══════════════════════════════════════════════════════
  // API FALLBACK
  // ═══════════════════════════════════════════════════════

  async function apiSearch(keyword) {
    const res = await fetch(`${WORKER_URL}/api/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ keyword, pageSize: 20 }),
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
        link: p.promotion_link || p.product_detail_url || "",
        title: p.product_title || "",
        matchCount: 0,
      };
    }).filter(s => s.price > 0 && s.img);
  }

  // ═══════════════════════════════════════════════════════
  // BUILD
  // ═══════════════════════════════════════════════════════

  async function buildSellerList(product, forceRescan = false) {
    if (!forceRescan) {
      const cached = loadCache(product);
      if (cached && cached.sellers.length) return { source: cached.source, sellers: cached.sellers, fromCache: true };
    }

    const currentKeywords = keywords(product.title);
    const cp = product?.price;

    await waitForStablePage(6000);
    await autoScroll();

    const candidates = collectCandidates(currentKeywords);
    const best = pickBest(candidates, cp);

    if (best.length >= 1) {
      saveCache(product, best, "page");
      return { source: "page", sellers: best };
    }

    // API Fallback
    const englishWords = (product.title || "").replace(/[^\x00-\x7F\s]/g, "").split(/\s+/).filter(w => w.length > 2);
    
    if (englishWords.length >= 2) {
      try {
        const query = englishWords.slice(0, 5).join(" ");
        const items = await apiSearch(query);
        
        if (items.length > 0) {
          const scored = items.map(it => ({ ...it, matchCount: countMatches(it.title || it.store, currentKeywords) }));
          let strictFiltered = scored.filter(it => it.matchCount >= 2);
          if (strictFiltered.length === 0) strictFiltered = scored.filter(it => it.matchCount >= 1);
          
          if (cp && cp > 0) strictFiltered = strictFiltered.filter(it => it.price >= cp * 0.5 && it.price <= cp * 2.0);
          
          strictFiltered.sort((a, b) => b.matchCount - a.matchCount || Math.abs(a.price - cp) - Math.abs(b.price - cp));
          
          if (strictFiltered.length > 0) {
            const uniqueApi = [];
            const seenApiIds = new Set();
            strictFiltered.forEach(it => {
                const pid = getProductId(it.link);
                if (!seenApiIds.has(pid)) { seenApiIds.add(pid); uniqueApi.push(it); }
            });

            saveCache(product, uniqueApi, "api");
            return { source: "api", sellers: uniqueApi };
          }
        }
      } catch (e) { console.warn(e); }
    }

    return { source: "none", sellers: [] };
  }

  // ═══════════════════════════════════════════════════════
  // PANEL
  // ═══════════════════════════════════════════════════════

  function buildPanel() {
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
      <div class="ss-footer" style="font-size:10px; color:#a1a1aa; text-align:center; padding: 8px 12px; border-top: 1px solid #f4f4f5;">
        ⚠️ الأسعار تقريبية. قد تنخفض عند الدخول بسبب الكوبونات أو الخيارات.
      </div>
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
  }

  async function doScan(forceRescan = false) {
    if (isScanning) return;
    isScanning = true;
    renderLoading();
    try {
      const result = await buildSellerList(currentProduct, forceRescan);
      sellers = result.sellers;
      dataSource = result.source;
      updateSourceLabel();
      renderList();
    } catch (e) {
      sellers = [];
      renderEmpty();
    } finally {
      isScanning = false;
    }
  }

  function updateSourceLabel() {
    const el = document.getElementById("ss-source");
    if (!el) return;
    const map = { page: T("sameProduct"), api: T("similarApi"), none: T("noAlt") };
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
    document.getElementById("ss-retry")?.addEventListener("click", () => { clearCache(currentProduct); doScan(true); });
  }

  function renderList() {
    const list = document.getElementById("ss-list");
    if (!list) return;
    if (!sellers.length) return renderEmpty();

    const items = sortSellers(sellers, activeFilter);
    const cp = currentProduct?.price || 0;
    const minPrice = Math.min(...items.map(s => s.price));
    const maxSold = Math.max(...items.map(s => s.sold || 0));
    const maxDiscount = Math.max(...items.map(s => s.discount || 0));

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
            ${oldPriceHtml ? `<div class="ss-old-line">${oldPriceHtml}</div>` : ""}
            ${cp && saveStr ? `<div class="ss-vs">${T("vs")} ${formatPrice(cp, currentProduct?.currency)} <b>${saveStr}</b></div>` : ""}
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

  // ═══════════════════════════════════════════════════════
  // DRAG
  // ═══════════════════════════════════════════════════════

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

  // ═══════════════════════════════════════════════════════
  // HELPERS
  // ═══════════════════════════════════════════════════════

  function valueScore(s) {
    const cp = currentProduct?.price || 0;
    const priceScore = cp ? (cp - s.price) / cp : 0;
    const soldScore = Math.min((s.sold || 0) / 5000, 1);
    const discountScore = Math.min((s.discount || 0) / 60, 1);
    const matchScore = Math.min((s.matchCount || 0) / 5, 1);
    return priceScore * 0.25 + soldScore * 0.15 + discountScore * 0.2 + matchScore * 0.4;
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

  // ═══════════════════════════════════════════════════════
  // MAIN
  // ═══════════════════════════════════════════════════════

  async function run() {
    await sleep(1500);
    currentProduct = extractProduct();
    if (!currentProduct.title || currentProduct.title.length < 5) return;
    buildPanel();
    await doScan(false);
  }

  chrome.runtime.onMessage.addListener((msg, _s, res) => {
    if (msg.type === "GET_PRODUCT") {
      try { res({ ok: true, product: extractProduct() }); }
      catch (e) { res({ ok: false, error: String(e) }); }
      return true;
    }
  });

  run();
  console.log(`[Smart Shopper] v26 ready.`);
})();