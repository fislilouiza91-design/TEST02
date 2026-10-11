/* ═══════════════════════════════════════════════════════
   Smart Shopper — Content Script (v52 COMPREHENSIVE)
   All Languages + All Countries + All Currencies.
   No cache — for testing and refinement.
   ═══════════════════════════════════════════════════════ */

(function () {
  "use strict";

  if (window.__SMART_SHOPPER_LOADED__) return;
  window.__SMART_SHOPPER_LOADED__ = true;

  const T = typeof SS_T === "function" ? SS_T : (k) => k;
  const IS_RTL = typeof SS_RTL !== "undefined" ? SS_RTL : false;

  console.log(`[Smart Shopper] v52 COMPREHENSIVE`);

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
  // 💱 CURRENCY DATABASE (110+ Currencies)
  // ═══════════════════════════════════════════════════════

  const CURRENCY_INFO = {
    // ═══ Americas ═══
    USD: { symbol: "$",    prefix: true,  decimals: 2 },
    CAD: { symbol: "CA$",  prefix: true,  decimals: 2 },
    BRL: { symbol: "R$",   prefix: true,  decimals: 2 },
    MXN: { symbol: "MX$",  prefix: true,  decimals: 2 },
    ARS: { symbol: "AR$",  prefix: true,  decimals: 2 },
    CLP: { symbol: "CLP$", prefix: true,  decimals: 0 },
    COP: { symbol: "COP$", prefix: true,  decimals: 0 },
    PEN: { symbol: "S/",   prefix: true,  decimals: 2 },
    UYU: { symbol: "$U",   prefix: true,  decimals: 2 },
    PYG: { symbol: "₲",    prefix: true,  decimals: 0 },
    BOB: { symbol: "Bs",   prefix: true,  decimals: 2 },
    VES: { symbol: "Bs.S", prefix: true,  decimals: 2 },
    GTQ: { symbol: "Q",    prefix: true,  decimals: 2 },
    CRC: { symbol: "₡",    prefix: true,  decimals: 2 },
    PAB: { symbol: "B/.",  prefix: true,  decimals: 2 },
    DOP: { symbol: "RD$",  prefix: true,  decimals: 2 },
    JMD: { symbol: "J$",   prefix: true,  decimals: 2 },
    TTD: { symbol: "TT$",  prefix: true,  decimals: 2 },
    BBD: { symbol: "Bds$", prefix: true,  decimals: 2 },
    BSD: { symbol: "B$",   prefix: true,  decimals: 2 },
    BZD: { symbol: "BZ$",  prefix: true,  decimals: 2 },
    HNL: { symbol: "L",    prefix: true,  decimals: 2 },
    NIO: { symbol: "C$",   prefix: true,  decimals: 2 },
    CUP: { symbol: "₱",    prefix: true,  decimals: 2 },

    // ═══ Europe ═══
    EUR: { symbol: "€",    prefix: false, decimals: 2 },
    GBP: { symbol: "£",    prefix: true,  decimals: 2 },
    CHF: { symbol: "CHF",  prefix: false, decimals: 2 },
    SEK: { symbol: "kr",   prefix: false, decimals: 2 },
    NOK: { symbol: "kr",   prefix: false, decimals: 2 },
    DKK: { symbol: "kr",   prefix: false, decimals: 2 },
    ISK: { symbol: "kr",   prefix: false, decimals: 0 },
    PLN: { symbol: "zł",   prefix: false, decimals: 2 },
    CZK: { symbol: "Kč",   prefix: false, decimals: 2 },
    HUF: { symbol: "Ft",   prefix: false, decimals: 0 },
    RON: { symbol: "lei",  prefix: false, decimals: 2 },
    BGN: { symbol: "лв",   prefix: false, decimals: 2 },
    HRK: { symbol: "kn",   prefix: false, decimals: 2 },
    RSD: { symbol: "дин",  prefix: false, decimals: 0 },
    MKD: { symbol: "ден",  prefix: false, decimals: 0 },
    ALL: { symbol: "L",    prefix: false, decimals: 0 },
    BAM: { symbol: "KM",   prefix: false, decimals: 2 },
    MDL: { symbol: "L",    prefix: false, decimals: 2 },
    RUB: { symbol: "₽",    prefix: false, decimals: 0 },
    UAH: { symbol: "₴",    prefix: false, decimals: 0 },
    BYN: { symbol: "Br",   prefix: false, decimals: 2 },
    TRY: { symbol: "₺",    prefix: true,  decimals: 2 },
    GEL: { symbol: "₾",    prefix: false, decimals: 2 },
    AMD: { symbol: "֏",    prefix: false, decimals: 0 },
    AZN: { symbol: "₼",    prefix: false, decimals: 2 },

    // ═══ Middle East ═══
    AED: { symbol: "AED",  prefix: false, decimals: 2 },
    SAR: { symbol: "SAR",  prefix: false, decimals: 2 },
    QAR: { symbol: "QAR",  prefix: false, decimals: 2 },
    KWD: { symbol: "KWD",  prefix: false, decimals: 3 },
    BHD: { symbol: "BHD",  prefix: false, decimals: 3 },
    OMR: { symbol: "OMR",  prefix: false, decimals: 3 },
    JOD: { symbol: "JOD",  prefix: false, decimals: 3 },
    ILS: { symbol: "₪",    prefix: true,  decimals: 2 },
    IQD: { symbol: "د.ع",  prefix: false, decimals: 0 },
    IRR: { symbol: "﷼",    prefix: false, decimals: 0 },
    LBP: { symbol: "ل.ل",  prefix: false, decimals: 0 },
    SYP: { symbol: "ل.س",  prefix: false, decimals: 0 },
    YER: { symbol: "﷼",    prefix: false, decimals: 0 },

    // ═══ North Africa ═══
    EGP: { symbol: "EGP",  prefix: false, decimals: 2 },
    DZD: { symbol: "DA",   prefix: false, decimals: 2 },
    MAD: { symbol: "MAD",  prefix: false, decimals: 2 },
    TND: { symbol: "TND",  prefix: false, decimals: 3 },
    LYD: { symbol: "LYD",  prefix: false, decimals: 3 },
    SDG: { symbol: "ج.س",  prefix: false, decimals: 2 },
    MRU: { symbol: "UM",   prefix: false, decimals: 2 },

    // ═══ Sub-Saharan Africa ═══
    ZAR: { symbol: "R",    prefix: true,  decimals: 2 },
    NGN: { symbol: "₦",    prefix: true,  decimals: 2 },
    KES: { symbol: "KSh",  prefix: false, decimals: 2 },
    GHS: { symbol: "GH₵",  prefix: true,  decimals: 2 },
    UGX: { symbol: "USh",  prefix: false, decimals: 0 },
    TZS: { symbol: "TSh",  prefix: false, decimals: 0 },
    RWF: { symbol: "FRw",  prefix: false, decimals: 0 },
    BIF: { symbol: "FBu",  prefix: false, decimals: 0 },
    ETB: { symbol: "Br",   prefix: false, decimals: 2 },
    SOS: { symbol: "Sh",   prefix: false, decimals: 0 },
    DJF: { symbol: "Fdj",  prefix: false, decimals: 0 },
    ERN: { symbol: "Nfk",  prefix: false, decimals: 2 },
    SSP: { symbol: "SSP",  prefix: false, decimals: 2 },
    CDF: { symbol: "FC",   prefix: false, decimals: 2 },
    XAF: { symbol: "FCFA", prefix: false, decimals: 0 },
    XOF: { symbol: "CFA",  prefix: false, decimals: 0 },
    GMD: { symbol: "D",    prefix: false, decimals: 2 },
    GNF: { symbol: "FG",   prefix: false, decimals: 0 },
    LRD: { symbol: "L$",   prefix: true,  decimals: 2 },
    SLL: { symbol: "Le",   prefix: false, decimals: 0 },
    MRO: { symbol: "UM",   prefix: false, decimals: 2 },
    MWK: { symbol: "MK",   prefix: false, decimals: 2 },
    MZN: { symbol: "MT",   prefix: false, decimals: 2 },
    ZMW: { symbol: "ZK",   prefix: false, decimals: 2 },
    ZWL: { symbol: "Z$",   prefix: true,  decimals: 2 },
    BWP: { symbol: "P",    prefix: false, decimals: 2 },
    NAD: { symbol: "N$",   prefix: true,  decimals: 2 },
    SZL: { symbol: "E",    prefix: false, decimals: 2 },
    LSL: { symbol: "L",    prefix: false, decimals: 2 },
    MGA: { symbol: "Ar",   prefix: false, decimals: 0 },
    MUR: { symbol: "₨",    prefix: true,  decimals: 2 },
    SCR: { symbol: "₨",    prefix: true,  decimals: 2 },
    CVE: { symbol: "$",    prefix: true,  decimals: 2 },
    STN: { symbol: "Db",   prefix: false, decimals: 2 },
    AOA: { symbol: "Kz",   prefix: false, decimals: 2 },

    // ═══ South Asia ═══
    INR: { symbol: "₹",    prefix: true,  decimals: 2 },
    PKR: { symbol: "₨",    prefix: true,  decimals: 0 },
    BDT: { symbol: "৳",    prefix: true,  decimals: 0 },
    LKR: { symbol: "Rs",   prefix: true,  decimals: 2 },
    NPR: { symbol: "रू",   prefix: true,  decimals: 2 },
    AFN: { symbol: "؋",    prefix: false, decimals: 2 },
    MVR: { symbol: "Rf",   prefix: false, decimals: 2 },
    BTN: { symbol: "Nu.",  prefix: true,  decimals: 2 },

    // ═══ East Asia ═══
    JPY: { symbol: "¥",    prefix: true,  decimals: 0 },
    CNY: { symbol: "CN¥",  prefix: true,  decimals: 2 },
    KRW: { symbol: "₩",    prefix: true,  decimals: 0 },
    TWD: { symbol: "NT$",  prefix: true,  decimals: 2 },
    HKD: { symbol: "HK$",  prefix: true,  decimals: 2 },
    MOP: { symbol: "MOP$", prefix: true,  decimals: 2 },

    // ═══ Southeast Asia ═══
    THB: { symbol: "฿",    prefix: true,  decimals: 2 },
    VND: { symbol: "₫",    prefix: false, decimals: 0 },
    IDR: { symbol: "Rp",   prefix: true,  decimals: 0 },
    MYR: { symbol: "RM",   prefix: true,  decimals: 2 },
    SGD: { symbol: "S$",   prefix: true,  decimals: 2 },
    PHP: { symbol: "₱",    prefix: true,  decimals: 2 },
    BND: { symbol: "B$",   prefix: true,  decimals: 2 },
    MMK: { symbol: "K",    prefix: false, decimals: 0 },
    KHR: { symbol: "៛",    prefix: false, decimals: 0 },
    LAK: { symbol: "₭",    prefix: false, decimals: 0 },
    TL:  { symbol: "$",    prefix: true,  decimals: 2 },

    // ═══ Central Asia ═══
    KZT: { symbol: "₸",    prefix: false, decimals: 0 },
    UZS: { symbol: "so'm", prefix: false, decimals: 0 },
    KGS: { symbol: "с",    prefix: false, decimals: 0 },
    TJS: { symbol: "SM",   prefix: false, decimals: 2 },
    TMT: { symbol: "m",    prefix: false, decimals: 2 },
    MNT: { symbol: "₮",    prefix: false, decimals: 0 },

    // ═══ Oceania ═══
    AUD: { symbol: "AU$",  prefix: true,  decimals: 2 },
    NZD: { symbol: "NZ$",  prefix: true,  decimals: 2 },
    FJD: { symbol: "FJ$",  prefix: true,  decimals: 2 },
    PGK: { symbol: "K",    prefix: false, decimals: 2 },
    WST: { symbol: "T",    prefix: false, decimals: 2 },
    TOP: { symbol: "T$",   prefix: true,  decimals: 2 },
    VUV: { symbol: "VT",   prefix: false, decimals: 0 },
    SBD: { symbol: "SI$",  prefix: true,  decimals: 2 },
  };

  const CURRENCY_PATTERNS = [
    // Americas
    { code: "USD", regex: /US\s*\$/i, weight: 100 },
    { code: "CAD", regex: /\bCA\s*\$/i, weight: 95 },
    { code: "BRL", regex: /\bR\s*\$\s*\d/i, weight: 90 },
    { code: "MXN", regex: /\bMX\s*\$/i, weight: 90 },
    { code: "ARS", regex: /\bAR\s*\$/i, weight: 85 },
    { code: "CLP", regex: /\bCLP\s*\$/i, weight: 85 },
    { code: "COP", regex: /\bCOP\s*\$/i, weight: 85 },
    { code: "PEN", regex: /\bS\/\s*\d/i, weight: 85 },
    { code: "UYU", regex: /\$U/i, weight: 80 },
    { code: "PYG", regex: /₲/, weight: 75 },
    { code: "BOB", regex: /\bBs\b/i, weight: 75 },
    { code: "GTQ", regex: /\bQ\b/i, weight: 60 },
    { code: "CRC", regex: /₡/, weight: 80 },
    { code: "DOP", regex: /RD\$/i, weight: 80 },
    { code: "JMD", regex: /J\$/i, weight: 75 },
    { code: "TTD", regex: /TT\$/i, weight: 75 },

    // Europe
    { code: "EUR", regex: /€/, weight: 100 },
    { code: "GBP", regex: /£/, weight: 100 },
    { code: "CHF", regex: /\bCHF\b/i, weight: 90 },
    { code: "SEK", regex: /\bSEK\b/i, weight: 85 },
    { code: "NOK", regex: /\bNOK\b/i, weight: 85 },
    { code: "DKK", regex: /\bDKK\b/i, weight: 85 },
    { code: "ISK", regex: /\bISK\b/i, weight: 80 },
    { code: "PLN", regex: /\bzł\b/i, weight: 85 },
    { code: "CZK", regex: /\bKč\b/i, weight: 85 },
    { code: "HUF", regex: /\bFt\b/i, weight: 85 },
    { code: "RON", regex: /\blei\b/i, weight: 85 },
    { code: "BGN", regex: /лв/i, weight: 85 },
    { code: "HRK", regex: /\bkn\b/i, weight: 80 },
    { code: "RSD", regex: /\bдин\b|\bRSD\b/i, weight: 80 },
    { code: "MKD", regex: /ден/i, weight: 75 },
    { code: "ALL", regex: /\bALL\b/i, weight: 75 },
    { code: "BAM", regex: /\bKM\b/i, weight: 70 },
    { code: "MDL", regex: /\bMDL\b/i, weight: 75 },
    { code: "RUB", regex: /₽|\bRUB\b/i, weight: 90 },
    { code: "UAH", regex: /₴|\bUAH\b/i, weight: 85 },
    { code: "BYN", regex: /\bBYN\b/i, weight: 75 },
    { code: "TRY", regex: /₺|\bTRY\b/i, weight: 85 },
    { code: "GEL", regex: /₾/, weight: 80 },
    { code: "AMD", regex: /֏/, weight: 75 },
    { code: "AZN", regex: /₼/, weight: 75 },

    // Middle East
    { code: "AED", regex: /\bAED\b/i, weight: 95 },
    { code: "SAR", regex: /\bSAR\b|﷼/i, weight: 95 },
    { code: "QAR", regex: /\bQAR\b/i, weight: 90 },
    { code: "KWD", regex: /\bKWD\b/i, weight: 90 },
    { code: "BHD", regex: /\bBHD\b/i, weight: 90 },
    { code: "OMR", regex: /\bOMR\b/i, weight: 90 },
    { code: "JOD", regex: /\bJOD\b/i, weight: 85 },
    { code: "ILS", regex: /₪|\bILS\b/i, weight: 90 },
    { code: "IQD", regex: /\bIQD\b|د\.ع/i, weight: 80 },
    { code: "IRR", regex: /\bIRR\b/i, weight: 75 },
    { code: "LBP", regex: /\bLBP\b|ل\.ل/i, weight: 75 },
    { code: "SYP", regex: /\bSYP\b|ل\.س/i, weight: 75 },
    { code: "YER", regex: /\bYER\b/i, weight: 70 },

    // North Africa
    { code: "EGP", regex: /\bEGP\b|ج\.م/i, weight: 90 },
    { code: "DZD", regex: /\bDA\b|د\.ج/i, weight: 90 },
    { code: "MAD", regex: /\bMAD\b|د\.م/i, weight: 85 },
    { code: "TND", regex: /\bTND\b|د\.ت/i, weight: 85 },
    { code: "LYD", regex: /\bLYD\b/i, weight: 80 },
    { code: "SDG", regex: /\bSDG\b|ج\.س/i, weight: 75 },
    { code: "MRU", regex: /\bMRU\b/i, weight: 70 },

    // Sub-Saharan Africa
    { code: "ZAR", regex: /\bZAR\b|\bR\s*\d/i, weight: 85 },
    { code: "NGN", regex: /₦|\bNGN\b/i, weight: 85 },
    { code: "KES", regex: /\bKSh\b|\bKES\b/i, weight: 85 },
    { code: "GHS", regex: /GH₵|\bGHS\b/i, weight: 80 },
    { code: "UGX", regex: /\bUGX\b/i, weight: 75 },
    { code: "TZS", regex: /\bTZS\b/i, weight: 75 },
    { code: "RWF", regex: /\bRWF\b/i, weight: 75 },
    { code: "ETB", regex: /\bETB\b/i, weight: 75 },
    { code: "XOF", regex: /\bCFA\b|\bXOF\b/i, weight: 75 },
    { code: "XAF", regex: /\bFCFA\b|\bXAF\b/i, weight: 75 },
    { code: "MZN", regex: /\bMZN\b/i, weight: 70 },
    { code: "ZMW", regex: /\bZMW\b/i, weight: 70 },
    { code: "BWP", regex: /\bBWP\b/i, weight: 70 },
    { code: "NAD", regex: /\bNAD\b/i, weight: 70 },
    { code: "MUR", regex: /\bMUR\b/i, weight: 75 },
    { code: "MGA", regex: /\bMGA\b/i, weight: 70 },
    { code: "AOA", regex: /\bAOA\b/i, weight: 70 },

    // South Asia
    { code: "INR", regex: /₹|\bINR\b/i, weight: 95 },
    { code: "PKR", regex: /\bPKR\b|\bRs\b/i, weight: 80 },
    { code: "BDT", regex: /৳|\bBDT\b/i, weight: 80 },
    { code: "LKR", regex: /\bLKR\b|\bRs\./i, weight: 75 },
    { code: "NPR", regex: /रू|\bNPR\b/i, weight: 75 },
    { code: "AFN", regex: /؋|\bAFN\b/i, weight: 70 },
    { code: "MVR", regex: /\bMVR\b/i, weight: 70 },

    // East Asia
    { code: "JPY", regex: /¥|\bJPY\b/i, weight: 90 },
    { code: "CNY", regex: /CN¥|\bCNY\b|￥/i, weight: 90 },
    { code: "KRW", regex: /₩|\bKRW\b/i, weight: 90 },
    { code: "TWD", regex: /\bNT\s*\$/i, weight: 85 },
    { code: "HKD", regex: /\bHK\s*\$/i, weight: 85 },
    { code: "MOP", regex: /\bMOP\b/i, weight: 75 },

    // Southeast Asia
    { code: "THB", regex: /฿|\bTHB\b/i, weight: 90 },
    { code: "VND", regex: /₫|\bVND\b/i, weight: 90 },
    { code: "IDR", regex: /\bRp\b|\bIDR\b/i, weight: 90 },
    { code: "MYR", regex: /\bRM\b|\bMYR\b/i, weight: 90 },
    { code: "SGD", regex: /\bS\$/i, weight: 90 },
    { code: "PHP", regex: /₱|\bPHP\b/i, weight: 85 },
    { code: "BND", regex: /\bBND\b/i, weight: 70 },
    { code: "MMK", regex: /\bMMK\b/i, weight: 70 },
    { code: "KHR", regex: /៛|\bKHR\b/i, weight: 70 },
    { code: "LAK", regex: /₭|\bLAK\b/i, weight: 70 },

    // Central Asia
    { code: "KZT", regex: /₸|\bKZT\b/i, weight: 80 },
    { code: "UZS", regex: /\bUZS\b/i, weight: 75 },
    { code: "KGS", regex: /\bKGS\b/i, weight: 70 },
    { code: "TJS", regex: /\bTJS\b/i, weight: 70 },
    { code: "TMT", regex: /\bTMT\b/i, weight: 70 },
    { code: "MNT", regex: /₮|\bMNT\b/i, weight: 70 },

    // Oceania
    { code: "AUD", regex: /\bAU\s*\$/i, weight: 95 },
    { code: "NZD", regex: /\bNZ\s*\$/i, weight: 90 },
    { code: "FJD", regex: /\bFJ\s*\$/i, weight: 75 },
    { code: "PGK", regex: /\bPGK\b/i, weight: 70 },
  ];

  const LOCALE_CURRENCY = {
    // Arabic
    "ar-dz": "DZD", "ar-sa": "SAR", "ar-ae": "AED", "ar-eg": "EGP",
    "ar-ma": "MAD", "ar-tn": "TND", "ar-kw": "KWD", "ar-qa": "QAR",
    "ar-bh": "BHD", "ar-om": "OMR", "ar-jo": "JOD", "ar-lb": "LBP",
    "ar-iq": "IQD", "ar-ly": "LYD", "ar-sd": "SDG", "ar-sy": "SYP",
    "ar-ye": "YER", "ar-mr": "MRU",

    // English
    "en-us": "USD", "en-gb": "GBP", "en-ca": "CAD", "en-au": "AUD",
    "en-nz": "NZD", "en-ie": "EUR", "en-za": "ZAR", "en-in": "INR",
    "en-sg": "SGD", "en-hk": "HKD", "en-my": "MYR", "en-ph": "PHP",
    "en-ng": "NGN", "en-ke": "KES", "en-gh": "GHS", "en-pk": "PKR",

    // French
    "fr-fr": "EUR", "fr-ca": "CAD", "fr-be": "EUR", "fr-ch": "CHF",
    "fr-ma": "MAD", "fr-dz": "DZD", "fr-tn": "TND", "fr-sn": "XOF",
    "fr-ci": "XOF", "fr-cm": "XAF",

    // Spanish
    "es-es": "EUR", "es-mx": "MXN", "es-ar": "ARS", "es-co": "COP",
    "es-cl": "CLP", "es-pe": "PEN", "es-ve": "VES", "es-uy": "UYU",
    "es-py": "PYG", "es-bo": "BOB", "es-ec": "USD", "es-gt": "GTQ",
    "es-cr": "CRC", "es-pa": "PAB", "es-do": "DOP",

    // German
    "de-de": "EUR", "de-at": "EUR", "de-ch": "CHF",

    // Italian / Portuguese / Dutch
    "it-it": "EUR", "pt-br": "BRL", "pt-pt": "EUR", "nl-nl": "EUR", "nl-be": "EUR",

    // Nordic
    "sv-se": "SEK", "no-no": "NOK", "da-dk": "DKK", "fi-fi": "EUR", "is-is": "ISK",

    // Eastern Europe
    "ru-ru": "RUB", "uk-ua": "UAH", "be-by": "BYN", "pl-pl": "PLN",
    "cs-cz": "CZK", "sk-sk": "EUR", "hu-hu": "HUF", "ro-ro": "RON",
    "bg-bg": "BGN", "hr-hr": "HRK", "sr-rs": "RSD", "sl-si": "EUR",
    "mk-mk": "MKD", "sq-al": "ALL", "bs-ba": "BAM", "md-md": "MDL",
    "lt-lt": "EUR", "lv-lv": "EUR", "et-ee": "EUR",

    // Asia
    "zh-cn": "CNY", "zh-tw": "TWD", "zh-hk": "HKD",
    "ja-jp": "JPY", "ko-kr": "KRW",
    "hi-in": "INR", "bn-in": "INR", "ta-in": "INR", "te-in": "INR",
    "ur-pk": "PKR", "bn-bd": "BDT",
    "th-th": "THB", "vi-vn": "VND", "id-id": "IDR",
    "ms-my": "MYR", "tl-ph": "PHP",
    "my-mm": "MMK", "km-kh": "KHR", "lo-la": "LAK",

    // Middle East
    "tr-tr": "TRY", "he-il": "ILS", "fa-ir": "IRR",
    "az-az": "AZN", "hy-am": "AMD", "ka-ge": "GEL",
    "kk-kz": "KZT", "uz-uz": "UZS", "ky-kg": "KGS",
    "tg-tj": "TJS", "tk-tm": "TMT", "mn-mn": "MNT",
  };

  // ═══════════════════════════════════════════════════════
  // 🌍 SHIP-TO-COUNTRY (200+ countries)
  // ═══════════════════════════════════════════════════════

  const LOCALE_COUNTRY = {
    "ar-dz": "DZ", "ar-sa": "SA", "ar-ae": "AE", "ar-eg": "EG",
    "ar-ma": "MA", "ar-tn": "TN", "ar-kw": "KW", "ar-qa": "QA",
    "ar-bh": "BH", "ar-om": "OM", "ar-jo": "JO", "ar-lb": "LB",
    "ar-iq": "IQ", "ar-ly": "LY", "ar-sd": "SD", "ar-sy": "SY",
    "ar-ye": "YE", "ar-mr": "MR",

    "en-us": "US", "en-gb": "GB", "en-ca": "CA", "en-au": "AU",
    "en-nz": "NZ", "en-ie": "IE", "en-za": "ZA", "en-in": "IN",
    "en-sg": "SG", "en-hk": "HK", "en-my": "MY", "en-ph": "PH",
    "en-ng": "NG", "en-ke": "KE", "en-gh": "GH", "en-pk": "PK",

    "fr-fr": "FR", "fr-ca": "CA", "fr-be": "BE", "fr-ch": "CH",
    "fr-ma": "MA", "fr-dz": "DZ", "fr-tn": "TN",
    "fr-sn": "SN", "fr-ci": "CI", "fr-cm": "CM",

    "es-es": "ES", "es-mx": "MX", "es-ar": "AR", "es-co": "CO",
    "es-cl": "CL", "es-pe": "PE", "es-ve": "VE", "es-uy": "UY",
    "es-py": "PY", "es-bo": "BO", "es-ec": "EC", "es-gt": "GT",
    "es-cr": "CR", "es-pa": "PA", "es-do": "DO",

    "de-de": "DE", "de-at": "AT", "de-ch": "CH",
    "it-it": "IT", "pt-br": "BR", "pt-pt": "PT",
    "nl-nl": "NL", "nl-be": "BE",

    "sv-se": "SE", "no-no": "NO", "da-dk": "DK", "fi-fi": "FI", "is-is": "IS",

    "ru-ru": "RU", "uk-ua": "UA", "be-by": "BY", "pl-pl": "PL",
    "cs-cz": "CZ", "sk-sk": "SK", "hu-hu": "HU", "ro-ro": "RO",
    "bg-bg": "BG", "hr-hr": "HR", "sr-rs": "RS", "sl-si": "SI",
    "mk-mk": "MK", "sq-al": "AL", "bs-ba": "BA", "md-md": "MD",
    "lt-lt": "LT", "lv-lv": "LV", "et-ee": "EE",

    "zh-cn": "CN", "zh-tw": "TW", "zh-hk": "HK",
    "ja-jp": "JP", "ko-kr": "KR",
    "hi-in": "IN", "bn-in": "IN", "ta-in": "IN", "te-in": "IN",
    "ur-pk": "PK", "bn-bd": "BD",
    "th-th": "TH", "vi-vn": "VN", "id-id": "ID",
    "ms-my": "MY", "tl-ph": "PH",
    "my-mm": "MM", "km-kh": "KH", "lo-la": "LA",

    "tr-tr": "TR", "he-il": "IL", "fa-ir": "IR",
    "az-az": "AZ", "hy-am": "AM", "ka-ge": "GE",
    "kk-kz": "KZ", "uz-uz": "UZ", "ky-kg": "KG",
    "tg-tj": "TJ", "tk-tm": "TM", "mn-mn": "MN",
  };

  // ═══════════════════════════════════════════════════════
  // 🌐 TARGET LANGUAGES (AliExpress API)
  // ═══════════════════════════════════════════════════════

  const SUPPORTED_LANGUAGES = ["EN", "AR", "FR", "ES", "DE", "IT", "PT", "RU", "TR", "TH", "VI", "ID", "MS", "JA", "KO", "ZH", "HE", "NL", "PL"];

  function formatPrice(v, currency) {
    if (v == null || isNaN(v) || v === 0) return "—";
    const info = CURRENCY_INFO[currency] || CURRENCY_INFO.USD;
    const decimals = info.decimals ?? 2;
    const num = v.toLocaleString("en-US", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
    return info.prefix ? `${info.symbol}${num}` : `${num} ${info.symbol}`;
  }

  function detectCurrency() {
    const txt = document.body.innerText || "";
    const found = [];
    for (const cur of CURRENCY_PATTERNS) {
      if (cur.regex.test(txt)) {
        found.push({ code: cur.code, weight: cur.weight });
      }
    }
    if (found.length > 0) {
      found.sort((a, b) => b.weight - a.weight);
      return found[0].code;
    }
    try {
      const lang = (navigator.language || "en-US").toLowerCase();
      if (LOCALE_CURRENCY[lang]) return LOCALE_CURRENCY[lang];
      const base = lang.split("-")[0];
      for (const [k, v] of Object.entries(LOCALE_CURRENCY)) {
        if (k.startsWith(base + "-")) return v;
      }
    } catch (_) {}
    return "USD";
  }

  function detectCountry() {
    try {
      const lang = (navigator.language || "en-US").toLowerCase();
      if (LOCALE_COUNTRY[lang]) return LOCALE_COUNTRY[lang];
      const base = lang.split("-")[0];
      for (const [k, v] of Object.entries(LOCALE_COUNTRY)) {
        if (k.startsWith(base + "-")) return v;
      }
    } catch (_) {}
    return "US";
  }

  function detectLanguage() {
    try {
      const lang = (navigator.language || "en-US").toUpperCase();
      const base = lang.split("-")[0];
      if (SUPPORTED_LANGUAGES.includes(base)) return base;
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
      /(?:US|CA|AU|NZ|HK|NT|MX|AR|BR|CLP|COP|S|R|RM|Rp|S\$|B\$|FJ\s*\$/)\s*\$\s*([\d]+\.?\d{0,2})/g,
      /([€£¥₩₹₽₺₴₸₼₾֏₪₦₱₫฿៛₭﷼₲₡؋₮])\s*([\d]+\.?\d{0,2})/g,
      /(?:د\.ج|د\.م|د\.ت|ج\.م|ج\.س|ر\.س|ر\.ي|ل\.ل|ل\.س)\s*([\d]+\.?\d{0,2})/g,
      /\b(?:USD|EUR|GBP|AED|SAR|QAR|KWD|BHD|OMR|JOD|ILS|EGP|DZD|MAD|TND|LYD|SDG|MRU|ZAR|NGN|KES|GHS|UGX|TZS|RWF|BIF|ETB|SOS|DJF|ERN|SSP|CDF|XOF|XAF|GMD|GNF|LRD|SLL|MRO|MWK|MZN|ZMW|ZWL|BWP|NAD|SZL|LSL|MGA|MUR|SCR|CVE|STN|AOA|CHF|SEK|NOK|DKK|ISK|PLN|CZK|HUF|RON|BGN|HRK|RSD|MKD|ALL|BAM|MDL|RUB|UAH|BYN|TRY|GEL|AMD|AZN|IQD|IRR|LBP|SYP|YER|JPY|CNY|KRW|INR|PKR|BDT|LKR|NPR|AFN|MVR|BTN|THB|VND|IDR|MYR|SGD|PHP|BND|MMK|KHR|LAK|TWD|HKD|MOP|AUD|NZD|FJD|PGK|WST|TOP|VUV|SBD|CAD|KZT|UZS|KGS|TJS|TMT|MNT|BRL|MXN|ARS|CLP|COP|PEN|UYU|PYG|BOB|VES|GTQ|CRC|PAB|DOP|JMD|TTD|BBD|BSD|BZD|HNL|NIO|CUP|TL)\b\s*([\d]+\.?\d{0,2})/gi,
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
    return /(\boff\s+on\b|\boff\s+us\b|coupon|voucher|reduction|with\s+coins|extra\s+\d+\s*%|installment|x\s*\$|×\s*\$|pieces|pcs|piece|bulk|wholesale|minimum|per\s+piece|\d+\s*\+|buy\s+now\s+pay|tax\s+excl|خصم|كوبون|عرض|شحن|قطعة)/i.test(text);
  }

  function applyWelcomeDeal(price, rootEl) {
    if (!price || !rootEl) return price;
    const txt = rootEl.innerText || "";
    const patterns = [
      /new\s+shoppers?\s+save\s+\$?\s*([\d.,]+)/i,
      /اشترِ\s+الآن\s+وفر\s+([\d.,]+)/,
      /économisez\s+([\d.,]+)/i,
      /ahorra\s+([\d.,]+)/i,
    ];
    for (const re of patterns) {
      const m = txt.match(re);
      if (m) {
        const save = parseFloat(m[1].replace(",", "."));
        if (save > 0 && save < price) return Math.round((price - save) * 100) / 100;
      }
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
    if (/\b(perfume|parfum|fragrance|عطر|عطور)\b/i.test(t)) return "perfume";
    if (/\b(headphone|earphone|earbud|headset|سماع|سماعات|écouteur|casti)\b/i.test(t)) return "headphones";
    if (/\b(phone|smartphone|mobile|هاتف|téléphone|teléfono)\b/i.test(t)) return "phone";
    if (/\b(laptop|notebook|computer|كمبيوتر|ordinateur|computadora)\b/i.test(t)) return "laptop";
    if (/\b(watch|smartwatch|ساعة|montre|reloj)\b/i.test(t)) return "watch";
    if (/\b(charger|cable|شاحن|كابل|câble|cargador)\b/i.test(t)) return "charger";
    if (/\b(usb|flash drive|pendrive|memory card|ذاكرة)\b/i.test(t)) return "storage";
    if (/\b(camera|كاميرا|appareil photo|cámara)\b/i.test(t)) return "camera";
    if (/\b(shoe|sneaker|حذاء|chaussure|zapato)\b/i.test(t)) return "shoes";
    if (/\b(shirt|t-shirt|قميص|chemise|camisa)\b/i.test(t)) return "clothes";
    if (/\b(bag|backpack|حقيبة|sac|bolsa)\b/i.test(t)) return "bag";
    if (/\b(toy|لعبة|jouet|juguete)\b/i.test(t)) return "toy";
    if (/\b(tool|أدوات|outil|herramienta)\b/i.test(t)) return "tool";
    if (/\b(lamp|light|مصباح|lampe|lámpara)\b/i.test(t)) return "lighting";
    if (/\b(fishing|صيد|pêche|pesca)\b/i.test(t)) return "fishing";
    if (/\b(glass|glasses|نظار|verre|lunettes|gafas)\b/i.test(t)) return "glasses";
    if (/\b(case|cover|حافظة|coque|funda)\b/i.test(t)) return "case";
    if (/\b(drone|طائرة|drone|dron)\b/i.test(t)) return "drone";
    if (/\b(keyboard|لوحة مفاتيح|clavier|teclado)\b/i.test(t)) return "keyboard";
    if (/\b(mouse|ماوس|souris|ratón)\b/i.test(t)) return "mouse";
    if (/\b(speaker|مكبر|haut-parleur|altavoz)\b/i.test(t)) return "speaker";
    if (/\b(fan|مروحة|ventilateur|ventilador)\b/i.test(t)) return "fan";
    if (/\b(car|سيارة|voiture|coche)\b/i.test(t)) return "car";
    if (/\b(phone case|غطاء هاتف|coque|funda)\b/i.test(t)) return "phone_case";
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
  // MODEL EXTRACTION
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
    // Arabic
    "من","في","على","إلى","مع","عن","هذا","هذه","ذلك","التي","الذي","أو","و","ثم",
    "لكن","حتى","بعد","قبل","كل","بعض","أي","لا","ما","هو","هي","جديد","جديدة",
    "سعر","أسعار","شحن","مجاني","بيع","شراء","منتج","منتجات","عالية","جودة","أفضل",
    // French
    "pour","avec","et","le","la","les","un","une","des","de","du","au","ce","cette",
    "ces","son","sa","ses","dans","sur","par","vers","est","sont","très","plus",
    "moins","tout","tous","nouveau","nouvelle","meilleur",
    // Spanish
    "para","con","y","el","los","las","una","del","al","este","esta","por","es",
    "son","ser","muy","más","menos","todo","todos","nuevo","nueva","mejor",
    // German
    "für","mit","und","der","die","das","den","dem","des","ein","eine","einem",
    "eines","dieser","diese","dieses","auf","zu","nach","ist","sind","sein",
    "haben","sehr","mehr","weniger","alle","neu","neue","original","beste",
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
      let score = 0;
      score += m.length * 10;
      const digits = (m.match(/\d/g) || []).length;
      score += digits * 5;
      const letters = (m.match(/[A-Z]/g) || []).length;
      score += letters * 3;
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
    if (n1.includes(n2) || n2.includes(n1)) return true;
    if (n1.length >= 4 && n2.length >= 4) {
      let match = 0;
      for (let i = 0; i < Math.min(n1.length, n2.length); i++) {
        if (n1[i] === n2[i]) match++;
        else break;
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
    const hasPrimaryModel = ctx.primaryModel && titleUpper.includes(ctx.primaryModel);
    const modelsMatched = ctx.models.filter(m => titleUpper.includes(m)).length;
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
      if (accepted.length >= 30) break;
    }

    return accepted;
  }

  // ═══════════════════════════════════════════════════════
  // MULTI-LANGUAGE QUERIES
  // ═══════════════════════════════════════════════════════

  function buildQueries(title, language, country) {
    const brand = extractBrand(title);
    const primaryModel = getPrimaryModel(title);
    const allModels = extractModels(title);
    const kws = getKeywords(title);
    const queries = [];
    const seen = new Set();

    function addQ(name, kw, priority = 5, page = 1, lang = language) {
      kw = (kw || "").trim();
      if (!kw || kw.length < 2) return;
      const key = kw.toLowerCase() + "@" + page + "@" + lang;
      if (seen.has(key)) return;
      seen.add(key);
      queries.push({
        name,
        keywords: kw,
        page,
        pageSize: 50,
        priority,
        language: lang,
      });
    }

    // 🥇 P1: Model فقط (3 صفحات)
    if (primaryModel) {
      addQ("⭐MODEL-p1", primaryModel, 1, 1);
      addQ("⭐MODEL-p2", primaryModel, 1, 2);
      addQ("⭐MODEL-p3", primaryModel, 1, 3);
    }

    // 🥈 P2: Brand + Model
    if (brand && primaryModel) {
      addQ("⭐BRAND+MODEL", `${brand} ${primaryModel}`, 2);
    }

    // 🥉 P3: Model + keyword
    if (primaryModel && kws.length >= 1) {
      addQ("MODEL+KW1", `${primaryModel} ${kws[0]}`, 3);
    }

    // P4: Full Title
    const cleanTitle = title.replace(/[|/,،()\[\]]/g, " ").replace(/\s+/g, " ").trim();
    if (cleanTitle.length >= 15) {
      addQ("FULL-TITLE", cleanTitle.slice(0, 100), 4);
    }

    // P5: All Models
    if (allModels.length >= 2) {
      addQ("ALL-MODELS", allModels.slice(0, 4).join(" "), 5);
    }

    // P6: Title 6 words
    const titleWords = cleanTitle.split(/\s+/).filter(w => w.length > 2);
    if (titleWords.length >= 5) {
      addQ("TITLE-6W", titleWords.slice(0, 6).join(" "), 6);
    }

    // P7: Brand + 2 keywords
    if (brand && kws.length >= 2) {
      addQ("BRAND+2KW", `${brand} ${kws[0]} ${kws[1]}`, 7);
    }

    // P8: Brand only
    if (brand) {
      addQ("BRAND", brand, 8);
    }

    // P9: 3 keywords
    if (kws.length >= 3) {
      addQ("KW3", kws.slice(0, 3).join(" "), 9);
    }

    // P10: 2 keywords
    if (kws.length >= 2) {
      addQ("KW2", `${kws[0]} ${kws[1]}`, 10);
    }

    // P11: Model + Brand
    if (primaryModel && brand) {
      addQ("MODEL+BRAND", `${primaryModel} ${brand}`, 11);
    }

    // P12: Title 10 words
    if (titleWords.length >= 8) {
      addQ("TITLE-10W", titleWords.slice(0, 10).join(" "), 12);
    }

    // P13: Model in other languages (للوصول لمنتجات بلغات أخرى)
    if (primaryModel && language !== "EN") {
      addQ("MODEL-EN", primaryModel, 13, 1, "EN");
    }
    if (primaryModel && language !== "AR") {
      addQ("MODEL-AR", primaryModel, 14, 1, "AR");
    }

    return queries.slice(0, 16);
  }

  async function fetchQueries(queries, country, currency) {
    const res = await fetch(`${WORKER_URL}/api/deep-search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ queries, shipToCountry: country, currency }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const payload = await res.json();
    if (!payload.ok) throw new Error(payload.error || "API error");
    return payload.data;
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
      console.log("[Smart Shopper] v52 COMPREHENSIVE");
      console.log("[Smart Shopper] Title:", currentProduct.title.slice(0, 90));
      console.log("[Smart Shopper] 🔥 Model:", primaryModel || "(none)");
      console.log("[Smart Shopper] All Models:", allModels);
      console.log("[Smart Shopper] Brand:", brand);
      console.log("[Smart Shopper] Language:", language);
      console.log("[Smart Shopper] Country:", country);
      console.log("[Smart Shopper] Currency:", currency);
      console.log("[Smart Shopper] Price:", currentProduct.price, currency);
      console.log("═══════════════════════════════════════════");

      const queries = buildQueries(currentProduct.title, language, country);
      console.log(`[Smart Shopper] ${queries.length} queries:`);
      queries.forEach(q => console.log(`  ${q.priority === 1 ? "🥇" : q.priority <= 2 ? "🥈" : q.priority <= 4 ? "🥉" : "  "} ${q.name}: "${q.keywords}" p${q.page} lang:${q.language}`));

      if (!queries.length) {
        sellers = [];
        renderEmpty();
        return;
      }

      const data = await fetchQueries(queries, country, currency);
      const raw = data?.products || [];
      const t1 = performance.now();
      console.log(`[Smart Shopper] Fetched ${raw.length} in ${Math.round(t1 - t0)}ms`);

      const ctx = {
        productId: currentProduct.id,
        title: currentProduct.title,
        brand,
        primaryModel,
        models: allModels,
        keywords,
        referencePrice,
        originalStore,
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
      console.log(`[Smart Shopper] Scored ${scored.length} (with model: ${withModel}) in ${Math.round(t2 - t1)}ms`);

      const picked = pickBest(scored, ctx);
      console.log(`[Smart Shopper] ✅ FINAL: ${picked.length} in ${Math.round(t2 - t0)}ms`);

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
    const currency = currentProduct?.currency || "USD";

    list.innerHTML = items.slice(0, 25).map((s, i) => {
      const rank = i + 1;
      const isCheap = s.price === minPrice && s.price > 0;
      const cardClass = rank === 1 ? "ss-best" : (isCheap ? "ss-cheap" : "");
      const rankClass = rank <= 3 ? `ss-r${rank}` : "";

      const conf = s._confidence || 0;
      const hasModel = s._hasPrimaryModel;
      const phraseLen = s._phraseLen || 0;

      let badge = "";
      if (hasModel && phraseLen >= 4) badge = `<span class="ss-badge ss-badge-match" style="background:#dcfce7;color:#166534">★ MODEL</span>`;
      else if (hasModel) badge = `<span class="ss-badge ss-badge-match" style="background:#ecfdf5;color:#065f46">✓ MODEL</span>`;
      else if (phraseLen >= 4) badge = `<span class="ss-badge ss-badge-match" style="background:#dbeafe;color:#1e40af">◐ ${conf}%</span>`;
      else if (conf >= 50) badge = `<span class="ss-badge ss-badge-match" style="background:#fef3c7;color:#92400e">◔ ${conf}%</span>`;
      else if (activeFilter === "cheap" && rank === 1) badge = `<span class="ss-badge ss-badge-cheap">${T("cheapestTag")}</span>`;
      else if (activeFilter === "discount" && rank === 1) badge = `<span class="ss-badge ss-badge-hot">${T("bestDeal")}</span>`;
      else if (activeFilter === "sold" && rank === 1) badge = `<span class="ss-badge ss-badge-top">${T("mostSoldTag")}</span>`;
      else if (activeFilter === "best" && rank === 1) badge = `<span class="ss-badge ss-badge-best">${T("bestValueTag")}</span>`;
      else if (isCheap) badge = `<span class="ss-badge ss-badge-cheap">${T("bestPrice")}</span>`;

      const discountBadge = s.discount > 0 ? `<span class="ss-save-badge">-${s.discount}%</span>` : "";
      const oldPriceHtml = s.oldPrice > 0 && s.oldPrice > s.price
        ? `<span class="ss-price-old">${formatPrice(s.oldPrice, currency)}</span>` : "";

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
                <span class="ss-price-now">${formatPrice(s.price, currency)}</span>
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
    console.log("[Smart Shopper] v52 ready");
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
  console.log("[Smart Shopper] v52 ready.");
})();