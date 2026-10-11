/* ═══════════════════════════════════════════════════════
   Smart Shopper — Content Script (v53)
   Multi-Language + Multi-Country + Multi-Currency.
   No cache. Model-First search.
   ═══════════════════════════════════════════════════════ */

(function () {
  "use strict";

  if (window.__SMART_SHOPPER_LOADED__) return;
  window.__SMART_SHOPPER_LOADED__ = true;

  const T = typeof SS_T === "function" ? SS_T : (k) => k;
  const IS_RTL = typeof SS_RTL !== "undefined" ? SS_RTL : false;

  console.log("[Smart Shopper] v53 loading...");

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

  // ═══════════════════════════════════════════════════════
  // CURRENCY
  // ═══════════════════════════════════════════════════════

  const CURRENCY_INFO = {
    USD:{symbol:"$",prefix:true,dec:2}, CAD:{symbol:"CA$",prefix:true,dec:2},
    BRL:{symbol:"R$",prefix:true,dec:2}, MXN:{symbol:"MX$",prefix:true,dec:2},
    ARS:{symbol:"AR$",prefix:true,dec:2}, CLP:{symbol:"CLP$",prefix:true,dec:0},
    COP:{symbol:"COP$",prefix:true,dec:0}, PEN:{symbol:"S/",prefix:true,dec:2},
    UYU:{symbol:"$U",prefix:true,dec:2}, PYG:{symbol:"₲",prefix:true,dec:0},
    BOB:{symbol:"Bs",prefix:true,dec:2}, GTQ:{symbol:"Q",prefix:true,dec:2},
    CRC:{symbol:"₡",prefix:true,dec:2}, DOP:{symbol:"RD$",prefix:true,dec:2},
    JMD:{symbol:"J$",prefix:true,dec:2},
    EUR:{symbol:"€",prefix:false,dec:2}, GBP:{symbol:"£",prefix:true,dec:2},
    CHF:{symbol:"CHF",prefix:false,dec:2}, SEK:{symbol:"kr",prefix:false,dec:2},
    NOK:{symbol:"kr",prefix:false,dec:2}, DKK:{symbol:"kr",prefix:false,dec:2},
    ISK:{symbol:"kr",prefix:false,dec:0}, PLN:{symbol:"zł",prefix:false,dec:2},
    CZK:{symbol:"Kč",prefix:false,dec:2}, HUF:{symbol:"Ft",prefix:false,dec:0},
    RON:{symbol:"lei",prefix:false,dec:2}, BGN:{symbol:"лв",prefix:false,dec:2},
    HRK:{symbol:"kn",prefix:false,dec:2}, RSD:{symbol:"дин",prefix:false,dec:0},
    MKD:{symbol:"ден",prefix:false,dec:0}, ALL:{symbol:"L",prefix:false,dec:0},
    BAM:{symbol:"KM",prefix:false,dec:2}, MDL:{symbol:"L",prefix:false,dec:2},
    RUB:{symbol:"₽",prefix:false,dec:0}, UAH:{symbol:"₴",prefix:false,dec:0},
    BYN:{symbol:"Br",prefix:false,dec:2}, TRY:{symbol:"₺",prefix:true,dec:2},
    GEL:{symbol:"₾",prefix:false,dec:2}, AMD:{symbol:"֏",prefix:false,dec:0},
    AZN:{symbol:"₼",prefix:false,dec:2},
    AED:{symbol:"AED",prefix:false,dec:2}, SAR:{symbol:"SAR",prefix:false,dec:2},
    QAR:{symbol:"QAR",prefix:false,dec:2}, KWD:{symbol:"KWD",prefix:false,dec:3},
    BHD:{symbol:"BHD",prefix:false,dec:3}, OMR:{symbol:"OMR",prefix:false,dec:3},
    JOD:{symbol:"JOD",prefix:false,dec:3}, ILS:{symbol:"₪",prefix:true,dec:2},
    IQD:{symbol:"د.ع",prefix:false,dec:0}, IRR:{symbol:"﷼",prefix:false,dec:0},
    LBP:{symbol:"ل.ل",prefix:false,dec:0}, SYP:{symbol:"ل.س",prefix:false,dec:0},
    YER:{symbol:"﷼",prefix:false,dec:0},
    EGP:{symbol:"EGP",prefix:false,dec:2}, DZD:{symbol:"DA",prefix:false,dec:2},
    MAD:{symbol:"MAD",prefix:false,dec:2}, TND:{symbol:"TND",prefix:false,dec:3},
    LYD:{symbol:"LYD",prefix:false,dec:3}, SDG:{symbol:"ج.س",prefix:false,dec:2},
    MRU:{symbol:"UM",prefix:false,dec:2},
    ZAR:{symbol:"R",prefix:true,dec:2}, NGN:{symbol:"₦",prefix:true,dec:2},
    KES:{symbol:"KSh",prefix:false,dec:2}, GHS:{symbol:"GH₵",prefix:true,dec:2},
    UGX:{symbol:"USh",prefix:false,dec:0}, TZS:{symbol:"TSh",prefix:false,dec:0},
    RWF:{symbol:"FRw",prefix:false,dec:0}, ETB:{symbol:"Br",prefix:false,dec:2},
    XOF:{symbol:"CFA",prefix:false,dec:0}, XAF:{symbol:"FCFA",prefix:false,dec:0},
    MZN:{symbol:"MT",prefix:false,dec:2}, ZMW:{symbol:"ZK",prefix:false,dec:2},
    BWP:{symbol:"P",prefix:false,dec:2}, NAD:{symbol:"N$",prefix:true,dec:2},
    MGA:{symbol:"Ar",prefix:false,dec:0}, MUR:{symbol:"₨",prefix:true,dec:2},
    AOA:{symbol:"Kz",prefix:false,dec:2},
    INR:{symbol:"₹",prefix:true,dec:2}, PKR:{symbol:"₨",prefix:true,dec:0},
    BDT:{symbol:"৳",prefix:true,dec:0}, LKR:{symbol:"Rs",prefix:true,dec:2},
    NPR:{symbol:"रू",prefix:true,dec:2}, AFN:{symbol:"؋",prefix:false,dec:2},
    MVR:{symbol:"Rf",prefix:false,dec:2},
    JPY:{symbol:"¥",prefix:true,dec:0}, CNY:{symbol:"CN¥",prefix:true,dec:2},
    KRW:{symbol:"₩",prefix:true,dec:0}, TWD:{symbol:"NT$",prefix:true,dec:2},
    HKD:{symbol:"HK$",prefix:true,dec:2}, MOP:{symbol:"MOP$",prefix:true,dec:2},
    THB:{symbol:"฿",prefix:true,dec:2}, VND:{symbol:"₫",prefix:false,dec:0},
    IDR:{symbol:"Rp",prefix:true,dec:0}, MYR:{symbol:"RM",prefix:true,dec:2},
    SGD:{symbol:"S$",prefix:true,dec:2}, PHP:{symbol:"₱",prefix:true,dec:2},
    BND:{symbol:"B$",prefix:true,dec:2}, MMK:{symbol:"K",prefix:false,dec:0},
    KHR:{symbol:"៛",prefix:false,dec:0}, LAK:{symbol:"₭",prefix:false,dec:0},
    KZT:{symbol:"₸",prefix:false,dec:0}, UZS:{symbol:"so'm",prefix:false,dec:0},
    KGS:{symbol:"с",prefix:false,dec:0}, TJS:{symbol:"SM",prefix:false,dec:2},
    TMT:{symbol:"m",prefix:false,dec:2}, MNT:{symbol:"₮",prefix:false,dec:0},
    AUD:{symbol:"AU$",prefix:true,dec:2}, NZD:{symbol:"NZ$",prefix:true,dec:2},
    FJD:{symbol:"FJ$",prefix:true,dec:2}, PGK:{symbol:"K",prefix:false,dec:2},
  };

  const CURRENCY_PATTERNS = [
    {code:"USD",re:/US\s*\$/i,w:100},{code:"CAD",re:/\bCA\s*\$/i,w:95},
    {code:"BRL",re:/\bR\s*\$\s*\d/i,w:90},{code:"MXN",re:/\bMX\s*\$/i,w:90},
    {code:"ARS",re:/\bAR\s*\$/i,w:85},{code:"CLP",re:/\bCLP\s*\$/i,w:85},
    {code:"COP",re:/\bCOP\s*\$/i,w:85},{code:"PEN",re:/\bS\/\s*\d/i,w:85},
    {code:"EUR",re:/€/,w:100},{code:"GBP",re:/£/,w:100},
    {code:"CHF",re:/\bCHF\b/i,w:90},{code:"SEK",re:/\bSEK\b/i,w:85},
    {code:"NOK",re:/\bNOK\b/i,w:85},{code:"DKK",re:/\bDKK\b/i,w:85},
    {code:"ISK",re:/\bISK\b/i,w:80},{code:"PLN",re:/\bzł\b/i,w:85},
    {code:"CZK",re:/\bKč\b/i,w:85},{code:"HUF",re:/\bFt\b/i,w:85},
    {code:"RON",re:/\blei\b/i,w:85},{code:"BGN",re:/лв/i,w:85},
    {code:"HRK",re:/\bkn\b/i,w:80},{code:"RUB",re:/₽|\bRUB\b/i,w:90},
    {code:"UAH",re:/₴|\bUAH\b/i,w:85},{code:"TRY",re:/₺|\bTRY\b/i,w:85},
    {code:"RSD",re:/\bдин\b|\bRSD\b/i,w:80},{code:"MKD",re:/ден/i,w:75},
    {code:"MDL",re:/\bMDL\b/i,w:75},{code:"BYN",re:/\bBYN\b/i,w:75},
    {code:"GEL",re:/₾/,w:80},{code:"AMD",re:/֏/,w:75},{code:"AZN",re:/₼/,w:75},
    {code:"AED",re:/\bAED\b/i,w:95},{code:"SAR",re:/\bSAR\b|﷼/i,w:95},
    {code:"QAR",re:/\bQAR\b/i,w:90},{code:"KWD",re:/\bKWD\b/i,w:90},
    {code:"BHD",re:/\bBHD\b/i,w:90},{code:"OMR",re:/\bOMR\b/i,w:90},
    {code:"JOD",re:/\bJOD\b/i,w:85},{code:"ILS",re:/₪|\bILS\b/i,w:90},
    {code:"EGP",re:/\bEGP\b|ج\.م/i,w:90},{code:"DZD",re:/\bDA\b|د\.ج/i,w:90},
    {code:"MAD",re:/\bMAD\b|د\.م/i,w:85},{code:"TND",re:/\bTND\b|د\.ت/i,w:85},
    {code:"LYD",re:/\bLYD\b/i,w:80},{code:"ZAR",re:/\bZAR\b/i,w:85},
    {code:"NGN",re:/₦|\bNGN\b/i,w:85},{code:"KES",re:/\bKSh\b|\bKES\b/i,w:85},
    {code:"GHS",re:/GH₵|\bGHS\b/i,w:80},{code:"UGX",re:/\bUGX\b/i,w:75},
    {code:"TZS",re:/\bTZS\b/i,w:75},{code:"ETB",re:/\bETB\b/i,w:75},
    {code:"XOF",re:/\bCFA\b|\bXOF\b/i,w:75},{code:"XAF",re:/\bFCFA\b|\bXAF\b/i,w:75},
    {code:"MZN",re:/\bMZN\b/i,w:70},{code:"ZMW",re:/\bZMW\b/i,w:70},
    {code:"BWP",re:/\bBWP\b/i,w:70},{code:"MUR",re:/\bMUR\b/i,w:75},
    {code:"MGA",re:/\bMGA\b/i,w:70},{code:"AOA",re:/\bAOA\b/i,w:70},
    {code:"INR",re:/₹|\bINR\b/i,w:95},{code:"PKR",re:/\bPKR\b/i,w:80},
    {code:"BDT",re:/৳|\bBDT\b/i,w:80},{code:"LKR",re:/\bLKR\b/i,w:75},
    {code:"NPR",re:/रू|\bNPR\b/i,w:75},{code:"AFN",re:/؋/,w:70},
    {code:"JPY",re:/¥|\bJPY\b/i,w:90},{code:"CNY",re:/CN¥|\bCNY\b|￥/i,w:90},
    {code:"KRW",re:/₩|\bKRW\b/i,w:90},{code:"TWD",re:/\bNT\s*\$/i,w:85},
    {code:"HKD",re:/\bHK\s*\$/i,w:85},{code:"THB",re:/฿|\bTHB\b/i,w:90},
    {code:"VND",re:/₫|\bVND\b/i,w:90},{code:"IDR",re:/\bRp\b|\bIDR\b/i,w:90},
    {code:"MYR",re:/\bRM\b|\bMYR\b/i,w:90},{code:"SGD",re:/\bS\$/i,w:90},
    {code:"PHP",re:/₱|\bPHP\b/i,w:85},{code:"MMK",re:/\bMMK\b/i,w:70},
    {code:"KHR",re:/៛/,w:70},{code:"LAK",re:/₭/,w:70},
    {code:"KZT",re:/₸|\bKZT\b/i,w:80},{code:"UZS",re:/\bUZS\b/i,w:75},
    {code:"AUD",re:/\bAU\s*\$/i,w:95},{code:"NZD",re:/\bNZ\s*\$/i,w:90},
    {code:"FJD",re:/\bFJ\s*\$/i,w:75},
  ];

  const LOCALE_CURRENCY = {
    "ar-dz":"DZD","ar-sa":"SAR","ar-ae":"AED","ar-eg":"EGP","ar-ma":"MAD",
    "ar-tn":"TND","ar-kw":"KWD","ar-qa":"QAR","ar-bh":"BHD","ar-om":"OMR",
    "ar-jo":"JOD","ar-lb":"LBP","ar-iq":"IQD","ar-ly":"LYD","ar-sd":"SDG",
    "en-us":"USD","en-gb":"GBP","en-ca":"CAD","en-au":"AUD","en-nz":"NZD",
    "en-ie":"EUR","en-za":"ZAR","en-in":"INR","en-sg":"SGD","en-hk":"HKD",
    "en-my":"MYR","en-ph":"PHP","en-ng":"NGN","en-ke":"KES","en-pk":"PKR",
    "fr-fr":"EUR","fr-ca":"CAD","fr-be":"EUR","fr-ch":"CHF","fr-ma":"MAD",
    "fr-dz":"DZD","fr-tn":"TND","fr-sn":"XOF",
    "es-es":"EUR","es-mx":"MXN","es-ar":"ARS","es-co":"COP","es-cl":"CLP",
    "es-pe":"PEN","es-uy":"UYU","es-py":"PYG","es-bo":"BOB","es-ec":"USD",
    "es-gt":"GTQ","es-cr":"CRC",
    "de-de":"EUR","de-at":"EUR","de-ch":"CHF",
    "it-it":"EUR","pt-br":"BRL","pt-pt":"EUR","nl-nl":"EUR",
    "sv-se":"SEK","no-no":"NOK","da-dk":"DKK","fi-fi":"EUR","is-is":"ISK",
    "ru-ru":"RUB","uk-ua":"UAH","pl-pl":"PLN","cs-cz":"CZK","hu-hu":"HUF",
    "ro-ro":"RON","bg-bg":"BGN","hr-hr":"HRK","rs-rs":"RSD","mk-mk":"MKD",
    "zh-cn":"CNY","zh-tw":"TWD","zh-hk":"HKD","ja-jp":"JPY","ko-kr":"KRW",
    "hi-in":"INR","ur-pk":"PKR","bn-bd":"BDT","th-th":"THB","vi-vn":"VND",
    "id-id":"IDR","ms-my":"MYR","tl-ph":"PHP",
    "tr-tr":"TRY","he-il":"ILS","fa-ir":"IRR",
    "az-az":"AZN","hy-am":"AMD","ka-ge":"GEL","kk-kz":"KZT","uz-uz":"UZS",
  };

  const LOCALE_COUNTRY = {
    "ar-dz":"DZ","ar-sa":"SA","ar-ae":"AE","ar-eg":"EG","ar-ma":"MA",
    "ar-tn":"TN","ar-kw":"KW","ar-qa":"QA","ar-bh":"BH","ar-om":"OM",
    "ar-jo":"JO","ar-lb":"LB","ar-iq":"IQ","ar-ly":"LY","ar-sd":"SD",
    "en-us":"US","en-gb":"GB","en-ca":"CA","en-au":"AU","en-nz":"NZ",
    "en-ie":"IE","en-za":"ZA","en-in":"IN","en-sg":"SG","en-hk":"HK",
    "en-my":"MY","en-ph":"PH","en-ng":"NG","en-ke":"KE","en-pk":"PK",
    "fr-fr":"FR","fr-ca":"CA","fr-be":"BE","fr-ch":"CH","fr-ma":"MA",
    "fr-dz":"DZ","fr-tn":"TN","fr-sn":"SN",
    "es-es":"ES","es-mx":"MX","es-ar":"AR","es-co":"CO","es-cl":"CL",
    "es-pe":"PE","es-uy":"UY","es-py":"PY","es-bo":"BO","es-ec":"EC",
    "es-gt":"GT","es-cr":"CR",
    "de-de":"DE","de-at":"AT","de-ch":"CH",
    "it-it":"IT","pt-br":"BR","pt-pt":"PT","nl-nl":"NL","nl-be":"BE",
    "sv-se":"SE","no-no":"NO","da-dk":"DK","fi-fi":"FI","is-is":"IS",
    "ru-ru":"RU","uk-ua":"UA","pl-pl":"PL","cs-cz":"CZ","hu-hu":"HU",
    "ro-ro":"RO","bg-bg":"BG","hr-hr":"HR","rs-rs":"RS","mk-mk":"MK",
    "zh-cn":"CN","zh-tw":"TW","zh-hk":"HK","ja-jp":"JP","ko-kr":"KR",
    "hi-in":"IN","ur-pk":"PK","bn-bd":"BD","th-th":"TH","vi-vn":"VN",
    "id-id":"ID","ms-my":"MY","tl-ph":"PH",
    "tr-tr":"TR","he-il":"IL","fa-ir":"IR",
    "az-az":"AZ","hy-am":"AM","ka-ge":"GE","kk-kz":"KZ","uz-uz":"UZ",
  };

  const SUPPORTED_LANGUAGES = ["EN","AR","FR","ES","DE","IT","PT","RU","TR","TH","VI","ID","MS","JA","KO","ZH","HE","NL","PL"];

  function formatPrice(v, currency) {
    if (v == null || isNaN(v) || v === 0) return "—";
    const info = CURRENCY_INFO[currency] || CURRENCY_INFO.USD;
    const d = info.dec || 2;
    const num = v.toLocaleString("en-US", {
      minimumFractionDigits: d,
      maximumFractionDigits: d,
    });
    return info.prefix ? info.symbol + num : num + " " + info.symbol;
  }

  function detectCurrency() {
    try {
      const txt = document.body.innerText || "";
      const found = [];
      for (const c of CURRENCY_PATTERNS) {
        if (c.re.test(txt)) found.push({ code: c.code, w: c.w });
      }
      if (found.length) {
        found.sort((a, b) => b.w - a.w);
        return found[0].code;
      }
      const lang = (navigator.language || "en-US").toLowerCase();
      if (LOCALE_CURRENCY[lang]) return LOCALE_CURRENCY[lang];
      const base = lang.split("-")[0];
      for (const k in LOCALE_CURRENCY) {
        if (k.indexOf(base + "-") === 0) return LOCALE_CURRENCY[k];
      }
    } catch (_) {}
    return "USD";
  }

  function detectCountry() {
    try {
      const lang = (navigator.language || "en-US").toLowerCase();
      if (LOCALE_COUNTRY[lang]) return LOCALE_COUNTRY[lang];
      const base = lang.split("-")[0];
      for (const k in LOCALE_COUNTRY) {
        if (k.indexOf(base + "-") === 0) return LOCALE_COUNTRY[k];
      }
    } catch (_) {}
    return "US";
  }

  function detectLanguage() {
    try {
      const lang = (navigator.language || "en-US").toUpperCase();
      const base = lang.split("-")[0];
      if (SUPPORTED_LANGUAGES.indexOf(base) >= 0) return base;
    } catch (_) {}
    return "EN";
  }

  function extractNumbers(text) {
    if (!text) return [];
    const normalized = text
      .replace(/[٠-٩]/g, d => "٠١٢٣٤٥٦٧٨٩".indexOf(d))
      .replace(/[۰-۹]/g, d => "۰۱۲۳۴۵۶۷۸۹".indexOf(d))
      .replace(/[,\u066C\u00A0\u2009]/g, " ")
      .replace(/[−–—]/g, "-");

    const results = [];
    const patterns = [
      /(?:US|CA|AU|NZ|HK|NT|MX|AR|BR|CLP|COP|S|R|RM|Rp|S\$|B\$)\s*\$\s*([\d]+\.?\d{0,2})/g,
      /([€£¥₩₹₽₺₴₸₼₾֏₪₦₱₫฿៛₭﷼₲₡؋₮])\s*([\d]+\.?\d{0,2})/g,
      /(?:د\.ج|د\.م|د\.ت|ج\.م|ج\.س|ر\.س|ر\.ي|ل\.ل|ل\.س)\s*([\d]+\.?\d{0,2})/g,
      /\b(?:USD|EUR|GBP|AED|SAR|QAR|KWD|BHD|OMR|JOD|ILS|EGP|DZD|MAD|TND|LYD|ZAR|NGN|KES|GHS|CHF|SEK|NOK|DKK|PLN|CZK|HUF|RON|BGN|RUB|UAH|TRY|JPY|CNY|KRW|INR|PKR|BDT|THB|VND|IDR|MYR|SGD|PHP|AUD|NZD|CAD|BRL|MXN|ARS|CLP|COP|PEN|KZT|UZS)\s*([\d]+\.?\d{0,2})/gi,
      /([\d]+\.?\d{0,2})\s*(?:USD|EUR|GBP|JPY|CNY|SAR|AED|DZD|MAD|EGP|RUB|TRY|UAH)\b/gi,
      /\$\s*([\d]+\.?\d{0,2})/g,
      /\b([\d]+\.[\d]{2})\b/g,
    ];

    for (const re of patterns) {
      let m;
      while ((m = re.exec(normalized)) !== null) {
        let v = null;
        for (let i = m.length - 1; i >= 1; i--) {
          if (m[i]) { v = parseFloat(m[i]); break; }
        }
        if (v != null && v > 0) results.push({ value: v, index: m.index });
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
    const m = txt.match(/new\s+shoppers?\s+save\s+\$?\s*([\d.,]+)/i);
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
        const t = el.innerText ? el.innerText.trim() : "";
        if (t && t.length > 8) return t;
      }
    }
    const meta = document.querySelector("meta[property='og:title']");
    return meta ? (meta.getAttribute("content") || "").trim() : "";
  }

  function getImage() {
    const meta = document.querySelector("meta[property='og:image']");
    if (meta) {
      const c = meta.getAttribute("content");
      if (c && c.indexOf("http") === 0) return c;
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
    const els = document.querySelectorAll("[aria-label*='star'], [aria-label*='rating']");
    for (const el of els) {
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
        const t = el.innerText ? el.innerText.trim() : "";
        if (t && t.length > 2 && t.length < 60) return t;
      }
    }
    return "";
  }

  function detectProductType(title) {
    const t = (title || "").toLowerCase();
    if (/(perfume|parfum|fragrance|عطر|عطور)/i.test(t)) return "perfume";
    if (/(headphone|earphone|earbud|headset|سماع|سماعات|écouteur|casti)/i.test(t)) return "headphones";
    if (/(smartphone|mobile|هاتف|téléphone|teléfono)/i.test(t)) return "phone";
    if (/(laptop|notebook|computer|كمبيوتر|ordinateur|computadora)/i.test(t)) return "laptop";
    if (/(smartwatch|ساعة|montre|reloj)/i.test(t)) return "watch";
    if (/(charger|cable|شاحن|كابل|câble|cargador)/i.test(t)) return "charger";
    if (/(usb|flash drive|pendrive|memory card|ذاكرة)/i.test(t)) return "storage";
    if (/(camera|كاميرا|appareil photo|cámara)/i.test(t)) return "camera";
    if (/(sneaker|حذاء|chaussure|zapato)/i.test(t)) return "shoes";
    if (/(shirt|t-shirt|قميص|chemise|camisa)/i.test(t)) return "clothes";
    if (/(backpack|حقيبة|sac|bolsa)/i.test(t)) return "bag";
    if (/(toy|لعبة|jouet|juguete)/i.test(t)) return "toy";
    if (/(tool|أدوات|outil|herramienta)/i.test(t)) return "tool";
    if (/(lamp|light|مصباح|lampe|lámpara)/i.test(t)) return "lighting";
    if (/(fishing|صيد|pêche|pesca)/i.test(t)) return "fishing";
    if (/(glasses|نظار|lunettes|gafas)/i.test(t)) return "glasses";
    if (/(cover|case|حافظة|coque|funda)/i.test(t)) return "case";
    if (/(drone|طائرة|dron)/i.test(t)) return "drone";
    if (/(keyboard|لوحة مفاتيح|clavier|teclado)/i.test(t)) return "keyboard";
    if (/(mouse|ماوس|souris|ratón)/i.test(t)) return "mouse";
    if (/(speaker|مكبر|haut-parleur|altavoz)/i.test(t)) return "speaker";
    if (/(fan|مروحة|ventilateur|ventilador)/i.test(t)) return "fan";
    return "general";
  }

  function extractProduct() {
    const title = getTitle();
    return {
      id: getProductId(),
      title: title,
      image: getImage(),
      price: getPrice(),
      currency: detectCurrency(),
      country: detectCountry(),
      language: detectLanguage(),
      sold: getSold(),
      rating: getRating(),
      store: getOriginalStore(),
      productType: detectProductType(title),
      url: location.href.split("?")[0],
    };
  }

  // ═══════════════════════════════════════════════════════
  // MODEL & KEYWORDS
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
    "من","في","على","إلى","مع","عن","هذا","هذه","ذلك","التي","الذي","أو","و","ثم",
    "لكن","حتى","بعد","قبل","كل","بعض","أي","لا","ما","هو","هي","جديد","جديدة",
    "سعر","أسعار","شحن","مجاني","بيع","شراء","منتج","منتجات","عالية","جودة","أفضل",
    "pour","avec","et","le","la","les","un","une","des","de","du","au","ce","cette",
    "ces","son","sa","ses","dans","sur","par","vers","est","sont","très","plus",
    "menos","moins","tout","tous","nouveau","nouvelle","meilleur",
    "para","con","y","el","los","las","una","del","al","este","esta","por","es",
    "son","ser","muy","más","todo","todos","nuevo","nueva","mejor",
  ]);

  const NOT_MODELS = new Set([
    "5.3","5.2","5.1","5.0","4.2","4.1","4.0","3.0","2.0","1.0",
    "4g","5g","3g","2g",
    "usb","hdmi","rgb","led","lcd",
    "ip67","ip68","ipx5","ipx7","ipx4","ipx6",
    "anc","tws","hifi","hd","uhd","4k","8k","1080p","720p",
    "bt","bluetooth","wifi","typec","typc",
    "mah","mm","cm","inch","ft","kg","gb","tb","mb",
    "pro","max","mini","plus",
    "khz","mhz","ghz","nm",
  ]);

  function extractModels(title) {
    if (!title) return [];
    const set = new Set();

    let m = title.match(/\b[A-Z]{1,5}\d{1,5}[A-Z]?\b/g) || [];
    m.forEach(x => {
      const up = x.toUpperCase();
      if (up.length < 3) return;
      if (NOT_MODELS.has(up.toLowerCase())) return;
      if (!/^[A-Z]+\d+[A-Z]?$/.test(up)) return;
      set.add(up);
    });

    m = title.match(/\b\d{1,4}[A-Z]{2,4}\b/g) || [];
    m.forEach(x => {
      const up = x.toUpperCase();
      if (up.length < 3) return;
      if (NOT_MODELS.has(up.toLowerCase())) return;
      set.add(up);
    });

    m = title.match(/\b[A-Z]\d{1,3}\b/g) || [];
    m.forEach(x => {
      const up = x.toUpperCase();
      if (up.length < 2) return;
      if (NOT_MODELS.has(up.toLowerCase())) return;
      set.add(up);
    });

    return Array.from(set);
  }

  function getPrimaryModel(title) {
    const models = extractModels(title);
    if (!models.length) return "";
    const scored = models.map(m => {
      let score = m.length * 10;
      score += (m.match(/\d/g) || []).length * 5;
      score += (m.match(/[A-Z]/g) || []).length * 3;
      if (/^[A-Z]+\d+$/.test(m)) score += 20;
      return { model: m, score };
    });
    scored.sort((a, b) => b.score - a.score);
    return scored[0].model;
  }

  function getAllModels(title) {
    return extractModels(title);
  }

  function getKeywords(title) {
    if (!title) return [];
    return title.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/)
      .filter(w => w.length > 2 && !STOP_WORDS.has(w) && !/^\d+$/.test(w));
  }

  function extractBrand(title) {
    if (!title) return "";
    let m = title.match(/\b([A-Z]{3,15})\b/);
    if (m && !NOT_MODELS.has(m[1].toLowerCase())) return m[1];
    m = title.match(/\b([A-Z][a-z]{2,15})\b/);
    if (m && !STOP_WORDS.has(m[1].toLowerCase())) return m[1].toUpperCase();
    m = title.slice(0, 30).match(/\b([A-Z][a-zA-Z]{2,15})\b/);
    if (m) return m[1].toUpperCase();
    return "";
  }

  function normalizeBrand(brand) {
    if (!brand) return "";
    return brand.toLowerCase().replace(/[^a-z0-9]/g, "");
  }

  function brandMatch(b1, b2) {
    const n1 = normalizeBrand(b1);
    const n2 = normalizeBrand(b2);
    if (!n1 || !n2) return false;
    if (n1 === n2) return true;
    if (n1.indexOf(n2) >= 0 || n2.indexOf(n1) >= 0) return true;
    if (n1.length >= 4 && n2.length >= 4) {
      let match = 0;
      for (let i = 0; i < Math.min(n1.length, n2.length); i++) {
        if (n1[i] === n2[i]) match++; else break;
      }
      if (match >= 4) return true;
    }
    return false;
  }

  function longestCommonPhrase(t1, t2) {
    const w1 = getKeywords(t1);
    const w2 = getKeywords(t2);
    if (!w1.length || !w2.length) return { length: 0, phrase: "" };

    let maxLen = 0;
    let bestPhrase = "";
    const matrix = [];
    for (let i = 0; i <= w1.length; i++) matrix[i] = new Array(w2.length + 1).fill(0);

    for (let i = 1; i <= w1.length; i++) {
      for (let j = 1; j <= w2.length; j++) {
        if (w1[i - 1] === w2[j - 1]) {
          matrix[i][j] = matrix[i - 1][j - 1] + 1;
          if (matrix[i][j] > maxLen) {
            maxLen = matrix[i][j];
            bestPhrase = w1.slice(i - maxLen, i).join(" ");
          }
        }
      }
    }

    return { length: maxLen, phrase: bestPhrase };
  }

  // ═══════════════════════════════════════════════════════
  // SCORING
  // ═══════════════════════════════════════════════════════

  function fastScore(p, ctx) {
    const price = parseFloat(p.target_sale_price || p.sale_price || 0);
    const oldP = parseFloat(p.target_original_price || p.original_price || 0);
    const rating = parseFloat(String(p.evaluate_rate || "0").replace("%", "")) / 20;
    const title = p.product_title || p.product_name || "";
    const id = String(p.product_id || "");
    const store = (p.shop_name || p.store_name || "").trim();

    if (!id || !price || !title) return null;
    if (id === ctx.productId) return null;

    if (ctx.referencePrice > 0) {
      const ratio = price / ctx.referencePrice;
      if (ratio < 0.05 || ratio > 20.0) return null;
    }

    const titleUpper = title.toUpperCase();
    const hasPrimaryModel = ctx.primaryModel && titleUpper.indexOf(ctx.primaryModel) >= 0;
    const modelsMatched = ctx.models.filter(m => titleUpper.indexOf(m) >= 0).length;
    const cardBrand = extractBrand(title);
    const bMatch = brandMatch(cardBrand, ctx.brand);

    const cardKws = new Set(getKeywords(title));
    let kwMatches = 0;
    for (const k of ctx.keywords) if (cardKws.has(k)) kwMatches++;
    const unionSize = cardKws.size + ctx.keywords.length - kwMatches;
    const jaccard = unionSize > 0 ? kwMatches / unionSize : 0;

    const phrase = longestCommonPhrase(ctx.title, title);
    const cardType = detectProductType(title);
    const typeMatch = ctx.productType === cardType ? 1 : 0;

    let confidence = 0;
    if (hasPrimaryModel) confidence += 50;
    confidence += Math.min(modelsMatched * 10, 20);
    if (bMatch) confidence += 15;
    confidence += Math.min(kwMatches * 2, 10);
    confidence += Math.round(jaccard * 10);
    confidence += typeMatch ? 5 : 0;

    if (phrase.length >= 5) confidence += 25;
    else if (phrase.length >= 4) confidence += 18;
    else if (phrase.length >= 3) confidence += 12;
    else if (phrase.length >= 2) confidence += 6;

    confidence = Math.min(confidence, 100);

    if (ctx.primaryModel && !hasPrimaryModel) {
      if (modelsMatched === 0 && !bMatch && phrase.length < 4) return null;
    }

    if (confidence < 5) return null;

    let tier = 10;
    if (confidence >= 85) tier = 1;
    else if (confidence >= 70) tier = 2;
    else if (confidence >= 55) tier = 3;
    else if (confidence >= 40) tier = 4;
    else if (confidence >= 25) tier = 5;
    else if (confidence >= 15) tier = 6;
    else if (confidence >= 8) tier = 7;
    else tier = 8;

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
      _phraseLen: phrase.length,
      _phrase: phrase.phrase,
      _typeMatch: typeMatch,
      store: store || "AliExpress Seller",
      img: p.product_main_image_url || "",
      price: price,
      oldPrice: finalOld,
      discount: discount,
      rating: rating > 0 && rating <= 5 ? +rating.toFixed(1) : 0,
      sold: parseInt(p.lastest_volume || p.volume || 0, 10),
      link: p.promotion_link || p.product_detail_url || "",
      title: title,
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
      if (accepted.length >= 30) break;
    }
    return accepted;
  }

  // ═══════════════════════════════════════════════════════
  // QUERIES
  // ═══════════════════════════════════════════════════════

  function buildQueries(title, language, country) {
    const brand = extractBrand(title);
    const primaryModel = getPrimaryModel(title);
    const allModels = extractModels(title);
    const kws = getKeywords(title);
    const queries = [];
    const seen = new Set();

    function addQ(name, kw, priority, page, lang) {
      kw = (kw || "").trim();
      if (!kw || kw.length < 2) return;
      page = page || 1;
      lang = lang || language;
      const key = kw.toLowerCase() + "@" + page + "@" + lang;
      if (seen.has(key)) return;
      seen.add(key);
      queries.push({
        name: name,
        keywords: kw,
        page: page,
        pageSize: 50,
        priority: priority || 5,
        language: lang,
      });
    }

    if (primaryModel) {
      addQ("MODEL-p1", primaryModel, 1, 1);
      addQ("MODEL-p2", primaryModel, 1, 2);
      addQ("MODEL-p3", primaryModel, 1, 3);
    }

    if (brand && primaryModel) {
      addQ("BRAND+MODEL", brand + " " + primaryModel, 2, 1);
    }

    if (primaryModel && kws.length >= 1) {
      addQ("MODEL+KW1", primaryModel + " " + kws[0], 3, 1);
    }

    const cleanTitle = title.replace(/[|/,،()\[\]]/g, " ").replace(/\s+/g, " ").trim();
    if (cleanTitle.length >= 15) {
      addQ("FULL-TITLE", cleanTitle.slice(0, 100), 4, 1);
    }

    if (allModels.length >= 2) {
      addQ("ALL-MODELS", allModels.slice(0, 4).join(" "), 5, 1);
    }

    const titleWords = cleanTitle.split(/\s+/).filter(w => w.length > 2);
    if (titleWords.length >= 5) {
      addQ("TITLE-6W", titleWords.slice(0, 6).join(" "), 6, 1);
    }

    if (brand && kws.length >= 2) {
      addQ("BRAND+2KW", brand + " " + kws[0] + " " + kws[1], 7, 1);
    }

    if (brand) {
      addQ("BRAND", brand, 8, 1);
    }

    if (kws.length >= 3) {
      addQ("KW3", kws.slice(0, 3).join(" "), 9, 1);
    }

    if (kws.length >= 2) {
      addQ("KW2", kws[0] + " " + kws[1], 10, 1);
    }

    if (primaryModel && brand) {
      addQ("MODEL+BRAND", primaryModel + " " + brand, 11, 1);
    }

    if (primaryModel && language !== "EN") {
      addQ("MODEL-EN", primaryModel, 12, 1, "EN");
    }
    if (primaryModel && language !== "AR") {
      addQ("MODEL-AR", primaryModel, 13, 1, "AR");
    }

    return queries.slice(0, 16);
  }

  async function fetchQueries(queries, country, currency) {
    const res = await fetch(WORKER_URL + "/api/deep-search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ queries: queries, shipToCountry: country, currency: currency }),
    });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const payload = await res.json();
    if (!payload.ok) throw new Error(payload.error || "API error");
    return payload.data;
  }

  // ═══════════════════════════════════════════════════════
  // PANEL UI
  // ═══════════════════════════════════════════════════════

  function buildPanel() {
    const old = document.getElementById(PANEL_ID);
    if (old) old.remove();

    const panel = document.createElement("div");
    panel.id = PANEL_ID;
    if (IS_RTL) panel.setAttribute("dir", "rtl");

    panel.innerHTML =
      '<div class="ss-header">' +
        '<div class="ss-header-left">' +
          '<div class="ss-logo">S</div>' +
          '<div>' +
            '<div class="ss-title">' + T("title") + '</div>' +
            '<div class="ss-subtitle" id="ss-source">' + T("scanning") + '</div>' +
          '</div>' +
        '</div>' +
        '<div class="ss-header-actions">' +
          '<button class="ss-btn-icon" data-action="refresh">↻</button>' +
          '<button class="ss-btn-icon" data-action="minimize">−</button>' +
          '<button class="ss-btn-icon" data-action="close">×</button>' +
        '</div>' +
      '</div>' +
      '<div class="ss-current">' +
        '<div class="ss-current-thumb"><img id="ss-cur-img" src="" alt=""></div>' +
        '<div class="ss-current-info">' +
          '<div class="ss-current-title" id="ss-cur-title">' + T("scanning") + '</div>' +
          '<div class="ss-current-meta" id="ss-cur-meta"></div>' +
        '</div>' +
      '</div>' +
      '<div class="ss-filters" id="ss-filters">' +
        '<button class="ss-chip ss-active" data-f="cheap">' + T("cheapest") + '</button>' +
        '<button class="ss-chip" data-f="best">' + T("bestValue") + '</button>' +
        '<button class="ss-chip" data-f="discount">' + T("bestDiscount") + '</button>' +
        '<button class="ss-chip" data-f="sold">' + T("mostSold") + '</button>' +
      '</div>' +
      '<div class="ss-list" id="ss-list"></div>' +
      '<div class="ss-footer">' + T("footer") + '</div>';

    document.body.appendChild(panel);

    panel.querySelector("[data-action='close']").onclick = function () {
      panel.classList.add("ss-hidden");
    };
    panel.querySelector("[data-action='minimize']").onclick = function () {
      minimized = !minimized;
      panel.classList.toggle("ss-minimized", minimized);
      panel.querySelector("[data-action='minimize']").textContent = minimized ? "+" : "−";
    };
    panel.querySelector("[data-action='refresh']").onclick = function () {
      if (!isScanning) doScan();
    };
    panel.querySelector("#ss-filters").onclick = function (e) {
      const chip = e.target.closest(".ss-chip");
      if (!chip) return;
      activeFilter = chip.dataset.f;
      panel.querySelectorAll(".ss-chip").forEach(function (c) {
        c.classList.toggle("ss-active", c === chip);
      });
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
      const brand = extractBrand(currentProduct.title);
      const primaryModel = getPrimaryModel(currentProduct.title);
      const allModels = getAllModels(currentProduct.title);
      const keywords = getKeywords(currentProduct.title);
      const referencePrice = currentProduct.price;
      const originalStore = currentProduct.store || "";
      const language = currentProduct.language || "EN";
      const country = currentProduct.country || "US";
      const currency = currentProduct.currency || "USD";

      console.log("═══════════════════════════════════════════");
      console.log("[Smart Shopper] v53");
      console.log("[Smart Shopper] Title:", currentProduct.title.slice(0, 90));
      console.log("[Smart Shopper] Model:", primaryModel || "(none)");
      console.log("[Smart Shopper] Brand:", brand);
      console.log("[Smart Shopper] Language:", language);
      console.log("[Smart Shopper] Country:", country);
      console.log("[Smart Shopper] Currency:", currency);
      console.log("[Smart Shopper] Price:", currentProduct.price, currency);
      console.log("═══════════════════════════════════════════");

      const queries = buildQueries(currentProduct.title, language, country);
      console.log("[Smart Shopper] " + queries.length + " queries:");
      queries.forEach(function (q) {
        console.log("  " + q.name + ": \"" + q.keywords + "\" p" + q.page + " lang:" + q.language);
      });

      if (!queries.length) {
        sellers = [];
        renderEmpty();
        return;
      }

      const data = await fetchQueries(queries, country, currency);
      const raw = (data && data.products) || [];
      const t1 = performance.now();
      console.log("[Smart Shopper] Fetched " + raw.length + " in " + Math.round(t1 - t0) + "ms");

      const ctx = {
        productId: currentProduct.id,
        title: currentProduct.title,
        brand: brand,
        primaryModel: primaryModel,
        models: allModels,
        keywords: keywords,
        referencePrice: referencePrice,
        originalStore: originalStore,
        productType: currentProduct.productType,
      };

      const scored = [];
      let withModel = 0;
      for (const p of raw) {
        const s = fastScore(p, ctx);
        if (s) {
          scored.push(s);
          if (s._hasPrimaryModel) withModel++;
        }
      }

      const t2 = performance.now();
      console.log("[Smart Shopper] Scored " + scored.length + " (with model: " + withModel + ") in " + Math.round(t2 - t1) + "ms");

      const picked = pickBest(scored, ctx);
      console.log("[Smart Shopper] FINAL: " + picked.length + " in " + Math.round(t2 - t0) + "ms");

      sellers = picked;
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
        img.onerror = function () { img.style.display = "none"; };
      } else {
        img.style.display = "none";
      }
    }
    if (title) title.textContent = currentProduct.title || "—";
    if (meta) {
      const parts = [];
      if (currentProduct.price != null) parts.push("<strong>" + formatPrice(currentProduct.price, currentProduct.currency) + "</strong>");
      if (currentProduct.rating != null) parts.push('<span class="ss-meta-pill ss-star">★ ' + currentProduct.rating + '</span>');
      if (currentProduct.sold != null) parts.push('<span class="ss-meta-pill">' + fmt(currentProduct.sold) + ' ' + T("sold") + '</span>');
      meta.innerHTML = parts.join(" ");
    }
  }

  function renderLoading() {
    const list = document.getElementById("ss-list");
    if (!list) return;
    let html = "";
    for (let i = 0; i < 4; i++) {
      html += '<div class="ss-skeleton">' +
        '<div class="ss-sk ss-sk-thumb"></div>' +
        '<div class="ss-sk-lines">' +
          '<div class="ss-sk ss-sk-line"></div>' +
          '<div class="ss-sk ss-sk-line short"></div>' +
        '</div>' +
      '</div>';
    }
    list.innerHTML = html;
  }

  function renderEmpty() {
    const list = document.getElementById("ss-list");
    if (!list) return;
    list.innerHTML =
      '<div class="ss-empty">' +
        '<div class="ss-empty-icon">🎯</div>' +
        '<div class="ss-empty-title">No matches found</div>' +
        '<div class="ss-empty-sub">This product seems unique on AliExpress.</div>' +
        '<button class="ss-empty-btn" id="ss-retry">' + T("scanAgain") + '</button>' +
      '</div>';
    const btn = document.getElementById("ss-retry");
    if (btn) btn.addEventListener("click", function () { doScan(); });
  }

  function sortSellers(arr, f) {
    const copy = arr.slice();
    if (f === "cheap") return copy.sort(function (a, b) { return a.price - b.price; });
    if (f === "discount") return copy.sort(function (a, b) { return (b.discount || 0) - (a.discount || 0); });
    if (f === "sold") return copy.sort(function (a, b) { return (b.sold || 0) - (a.sold || 0); });
    return copy.sort(function (a, b) { return b._confidence - a._confidence; });
  }

  function renderList() {
    const list = document.getElementById("ss-list");
    if (!list) return;
    if (!sellers.length) return renderEmpty();

    const items = sortSellers(sellers, activeFilter);
    const prices = items.map(function (s) { return s.price; }).filter(function (p) { return p > 0; });
    const minPrice = prices.length ? Math.min.apply(null, prices) : 0;
    const currentPrice = (currentProduct && currentProduct.price) || 0;
    const currency = (currentProduct && currentProduct.currency) || "USD";

    let html = "";
    for (let i = 0; i < Math.min(items.length, 25); i++) {
      const s = items[i];
      const rank = i + 1;
      const isCheap = s.price === minPrice && s.price > 0;
      const cardClass = rank === 1 ? "ss-best" : (isCheap ? "ss-cheap" : "");
      const rankClass = rank <= 3 ? "ss-r" + rank : "";

      const conf = s._confidence || 0;
      const hasModel = s._hasPrimaryModel;
      const phraseLen = s._phraseLen || 0;

      let badge = "";
      if (hasModel && phraseLen >= 4) badge = '<span class="ss-badge ss-badge-match" style="background:#dcfce7;color:#166534">★ MODEL</span>';
      else if (hasModel) badge = '<span class="ss-badge ss-badge-match" style="background:#ecfdf5;color:#065f46">✓ MODEL</span>';
      else if (phraseLen >= 4) badge = '<span class="ss-badge ss-badge-match" style="background:#dbeafe;color:#1e40af">◐ ' + conf + '%</span>';
      else if (conf >= 50) badge = '<span class="ss-badge ss-badge-match" style="background:#fef3c7;color:#92400e">◔ ' + conf + '%</span>';
      else if (activeFilter === "cheap" && rank === 1) badge = '<span class="ss-badge ss-badge-cheap">' + T("cheapestTag") + '</span>';
      else if (activeFilter === "discount" && rank === 1) badge = '<span class="ss-badge ss-badge-hot">' + T("bestDeal") + '</span>';
      else if (activeFilter === "sold" && rank === 1) badge = '<span class="ss-badge ss-badge-top">' + T("mostSoldTag") + '</span>';
      else if (activeFilter === "best" && rank === 1) badge = '<span class="ss-badge ss-badge-best">' + T("bestValueTag") + '</span>';
      else if (isCheap) badge = '<span class="ss-badge ss-badge-cheap">' + T("bestPrice") + '</span>';

      const discountBadge = s.discount > 0 ? '<span class="ss-save-badge">-' + s.discount + '%</span>' : "";
      const oldPriceHtml = (s.oldPrice > 0 && s.oldPrice > s.price) ? '<span class="ss-price-old">' + formatPrice(s.oldPrice, currency) + '</span>' : "";

      let compareVs = "";
      if (currentPrice && s.price > 0) {
        const diff = s.price - currentPrice;
        const pct = Math.round(Math.abs(diff) / currentPrice * 100);
        if (diff < 0) compareVs = '<span class="ss-compare-vs up">−' + pct + '%</span>';
        else if (diff > 0) compareVs = '<span class="ss-compare-vs down">+' + pct + '%</span>';
        else compareVs = '<span class="ss-compare-vs same">=</span>';
      }

      const subItems = [];
      if (s.rating > 0) subItems.push('<span class="ss-tag-inline rating">★ ' + s.rating.toFixed(1) + '</span>');
      if (s.sold > 0) subItems.push('<span class="ss-tag-inline sold">' + fmt(s.sold) + ' ' + T("sold") + '</span>');

      const imgHtml = s.img
        ? '<img src="' + s.img + '" loading="lazy" onerror="this.style.display=\'none\';this.parentElement.innerHTML=\'🖼️\'">'
        : '🖼️';

      html +=
        '<div class="ss-card ' + cardClass + '" data-idx="' + i + '">' +
          '<div class="ss-card-row">' +
            '<div class="ss-rank ' + rankClass + '">' + rank + '</div>' +
            '<div class="ss-card-thumb">' + imgHtml + '</div>' +
            '<div class="ss-card-info">' +
              '<div class="ss-card-title">' + esc(s.store) + ' ' + badge + '</div>' +
              '<div class="ss-card-subtitle">' + subItems.join('<span class="ss-sep">●</span>') + '</div>' +
            '</div>' +
            '<div class="ss-price-col">' +
              '<div class="ss-price-line">' +
                '<span class="ss-price-now">' + formatPrice(s.price, currency) + '</span>' +
                discountBadge +
              '</div>' +
              '<div style="display:flex;align-items:center;justify-content:flex-end;gap:5px">' +
                oldPriceHtml + compareVs +
              '</div>' +
            '</div>' +
          '</div>' +
        '</div>';
    }
    list.innerHTML = html;

    list.querySelectorAll(".ss-card").forEach(function (card) {
      card.addEventListener("click", function () {
        const item = items[+card.dataset.idx];
        if (item && item.link) window.open(item.link, "_blank", "noopener");
      });
    });
  }

  function makeDraggable(panel) {
    const header = panel.querySelector(".ss-header");
    if (!header) return;
    let dragging = false, sx, sy, sl, st;
    header.addEventListener("mousedown", function (e) {
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
      try {
        localStorage.setItem("ss-pos", JSON.stringify({ left: panel.style.left, top: panel.style.top }));
      } catch (_) {}
    }
  }

  function restorePosition(panel) {
    try {
      const saved = localStorage.getItem("ss-pos");
      if (!saved) return;
      const pos = JSON.parse(saved);
      if (pos.left && pos.top) {
        panel.style.right = "auto";
        panel.style.left = pos.left;
        panel.style.top = pos.top;
      }
    } catch (_) {}
  }

  async function run() {
    try {
      await sleep(600);
      currentProduct = extractProduct();
      console.log("[Smart Shopper] v53 ready");
      console.log("[Smart Shopper] Product:", currentProduct);
      if (!currentProduct.title || currentProduct.title.length < 5) return;
      buildPanel();
      await doScan();
    } catch (e) {
      console.error("[Smart Shopper] run() error:", e);
    }
  }

  chrome.runtime.onMessage.addListener(function (msg, _s, res) {
    if (msg.type === "GET_PRODUCT") {
      try { res({ ok: true, product: extractProduct() }); }
      catch (e) { res({ ok: false, error: String(e) }); }
      return true;
    }
  });

  run();
  console.log("[Smart Shopper] v53 loaded.");
})();