const API_BASE = "https://api-sg.aliexpress.com/sync";

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders(env) });

    const url = new URL(request.url);

    try {
      if (url.pathname === "/health") return json({ ok: true, service: "smart-shopper-proxy", time: Date.now() }, env);

      // AliExpress API
      if (url.pathname === "/api/search" && request.method === "POST") return await handleSearch(request, env);
      if (url.pathname === "/api/product" && request.method === "POST") return await handleProduct(request, env);
      if (url.pathname === "/api/link" && request.method === "POST") return await handleLink(request, env);

      // Neon DB
      if (url.pathname === "/product" && request.method === "POST") return await handleSaveProduct(request, env);
      if (url.pathname === "/products" && request.method === "GET") return await handleListProducts(request, env);
      if (url.pathname === "/products/clear" && request.method === "POST") return await handleClearProducts(request, env);

      // ⭐ NEW: Similar products
      if (url.pathname === "/similar" && request.method === "POST") return await handleSaveSimilar(request, env);
      if (url.pathname === "/similar" && request.method === "GET") return await handleListSimilar(request, env);

      return json({ ok: false, error: "Route not found" }, env, 404);
    } catch (err) {
      return json({ ok: false, error: String(err), stack: err.stack }, env, 500);
    }
  },
};

/* ═══════════════════════════════════════════════════════
   MAIN PRODUCTS
   ═══════════════════════════════════════════════════════ */

async function handleSaveProduct(request, env) {
  if (!env.NEON_DATABASE_URL) return json({ ok: false, error: "NEON_DATABASE_URL not configured" }, env, 500);

  let body;
  try { body = JSON.parse(await request.text()); }
  catch (e) { return json({ ok: false, error: "Invalid JSON body" }, env, 400); }

  if (!body.url) return json({ ok: false, error: "url is required" }, env, 400);

  const host = new URL(env.NEON_DATABASE_URL).hostname;
  const sqlUrl = `https://${host}/sql`;

  const resp = await fetch(sqlUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", "neon-connection-string": env.NEON_DATABASE_URL },
    body: JSON.stringify({
      query: `INSERT INTO products (product_url, title, price, currency, image_url, rating, sold_count, discount, updated_at)
              VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
              ON CONFLICT (product_url) DO UPDATE SET
                title = EXCLUDED.title, price = EXCLUDED.price, currency = EXCLUDED.currency,
                image_url = EXCLUDED.image_url, rating = EXCLUDED.rating,
                sold_count = EXCLUDED.sold_count, discount = EXCLUDED.discount, updated_at = NOW()
              RETURNING *;`,
      params: [body.url, body.title || "", body.price || 0, body.currency || "USD",
               body.image || null, body.rating || null, body.sold || null, body.discount || null]
    })
  });
  return json({ ok: true, data: await resp.json() }, env);
}

async function handleListProducts(request, env) {
  if (!env.NEON_DATABASE_URL) return json({ ok: false, error: "NEON_DATABASE_URL not configured" }, env, 500);
  const host = new URL(env.NEON_DATABASE_URL).hostname;
  const resp = await fetch(`https://${host}/sql`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "neon-connection-string": env.NEON_DATABASE_URL },
    body: JSON.stringify({
      query: `SELECT id, product_url, title, price, currency, image_url, rating, sold_count, discount, scraped_at, updated_at
              FROM products ORDER BY updated_at DESC NULLS LAST, id DESC LIMIT 100;`,
      params: []
    })
  });
  return json(await resp.json(), env);
}

async function handleClearProducts(request, env) {
  if (!env.NEON_DATABASE_URL) return json({ ok: false, error: "NEON_DATABASE_URL not configured" }, env, 500);
  const host = new URL(env.NEON_DATABASE_URL).hostname;
  const resp = await fetch(`https://${host}/sql`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "neon-connection-string": env.NEON_DATABASE_URL },
    body: JSON.stringify({ query: "DELETE FROM products;", params: [] })
  });
  return json({ ok: true, data: await resp.json() }, env);
}

/* ═══════════════════════════════════════════════════════
   ⭐ SIMILAR PRODUCTS
   ═══════════════════════════════════════════════════════ */

async function handleSaveSimilar(request, env) {
  if (!env.NEON_DATABASE_URL) return json({ ok: false, error: "NEON_DATABASE_URL not configured" }, env, 500);

  let body;
  try { body = JSON.parse(await request.text()); }
  catch (e) { return json({ ok: false, error: "Invalid JSON body" }, env, 400); }

  const { parent_url, items } = body;
  if (!parent_url || !Array.isArray(items) || items.length === 0) {
    return json({ ok: false, error: "parent_url and items array are required" }, env, 400);
  }

  const host = new URL(env.NEON_DATABASE_URL).hostname;
  const sqlUrl = `https://${host}/sql`;

  // حذف المنتجات المشابهة القديمة لهذا المنتج الأصلي
  await fetch(sqlUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", "neon-connection-string": env.NEON_DATABASE_URL },
    body: JSON.stringify({
      query: "DELETE FROM similar_products WHERE parent_url = $1;",
      params: [parent_url]
    })
  });

  // إدراج المنتجات الجديدة
  let inserted = 0;
  for (const item of items) {
    try {
      await fetch(sqlUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", "neon-connection-string": env.NEON_DATABASE_URL },
        body: JSON.stringify({
          query: `INSERT INTO similar_products 
                  (parent_url, seller_title, product_url, price, old_price, discount, rating, sold_count, image_url, match_count)
                  VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10);`,
          params: [
            parent_url,
            item.seller_title || "",
            item.product_url || "",
            item.price || 0,
            item.old_price || 0,
            item.discount || 0,
            item.rating || 0,
            item.sold_count || 0,
            item.image_url || "",
            item.match_count || 0
          ]
        })
      });
      inserted++;
    } catch (e) {
      console.error("Failed to insert similar product:", e);
    }
  }

  return json({ ok: true, inserted, total: items.length }, env);
}

async function handleListSimilar(request, env) {
  if (!env.NEON_DATABASE_URL) return json({ ok: false, error: "NEON_DATABASE_URL not configured" }, env, 500);

  const url = new URL(request.url);
  const parentUrl = url.searchParams.get("parent_url");

  const host = new URL(env.NEON_DATABASE_URL).hostname;
  const sqlUrl = `https://${host}/sql`;

  let query, params;
  if (parentUrl) {
    query = `SELECT * FROM similar_products WHERE parent_url = $1 ORDER BY price ASC LIMIT 100;`;
    params = [parentUrl];
  } else {
    query = `SELECT * FROM similar_products ORDER BY scraped_at DESC LIMIT 100;`;
    params = [];
  }

  const resp = await fetch(sqlUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", "neon-connection-string": env.NEON_DATABASE_URL },
    body: JSON.stringify({ query, params })
  });

  return json(await resp.json(), env);
}

/* ═══════════════════════════════════════════════════════
   ALIEXPRESS API HANDLERS
   ═══════════════════════════════════════════════════════ */

async function handleSearch(request, env) {
  const body = await request.json();
  const { keyword, page = 1, pageSize = 20, currency = "USD" } = body;
  if (!keyword) return json({ ok: false, error: "keyword required" }, env, 400);
  const params = {
    method: "aliexpress.affiliate.product.query", app_key: env.ALI_APP_KEY, timestamp: Date.now(),
    format: "json", v: "2.0", sign_method: "md5", keywords: keyword, page_no: String(page),
    page_size: String(pageSize), currency, target_currency: currency, target_language: "EN",
    ship_to_country: "US", tracking_id: env.ALI_TRACKING_ID,
  };
  return json({ ok: true, data: await callAliExpress(params, env) }, env);
}

async function handleProduct(request, env) {
  const body = await request.json();
  const { productIds = [], currency = "USD" } = body;
  if (!Array.isArray(productIds) || productIds.length === 0) return json({ ok: false, error: "productIds required" }, env, 400);
  const params = {
    method: "aliexpress.affiliate.productdetail.get", app_key: env.ALI_APP_KEY, timestamp: Date.now(),
    format: "json", v: "2.0", sign_method: "md5", product_ids: productIds.join(","),
    currency, target_currency: currency, target_language: "EN", ship_to_country: "US",
    tracking_id: env.ALI_TRACKING_ID,
  };
  return json({ ok: true, data: await callAliExpress(params, env) }, env);
}

async function handleLink(request, env) {
  const body = await request.json();
  const { urls = [] } = body;
  if (!Array.isArray(urls) || urls.length === 0) return json({ ok: false, error: "urls required" }, env, 400);
  const params = {
    method: "aliexpress.affiliate.link.generate", app_key: env.ALI_APP_KEY, timestamp: Date.now(),
    format: "json", v: "2.0", sign_method: "md5", promotion_link_type: "0",
    source_values: urls.join(","), tracking_id: env.ALI_TRACKING_ID,
  };
  return json({ ok: true, data: await callAliExpress(params, env) }, env);
}

async function callAliExpress(params, env) {
  const signed = signRequest(params, env.ALI_APP_SECRET);
  const query = new URLSearchParams(signed).toString();
  const res = await fetch(`${API_BASE}?${query}`, { method: "GET", headers: { "Accept": "application/json" } });
  const text = await res.text();
  try { return JSON.parse(text); } catch (_) { return { raw: text }; }
}

function signRequest(params, secret) {
  const sortedKeys = Object.keys(params).sort();
  let base = "";
  for (const k of sortedKeys) base += k + String(params[k]);
  return { ...params, sign: md5Hex(secret + base + secret) };
}

function md5Hex(str) {
  function md5cycle(x, k) {
    let a = x[0], b = x[1], c = x[2], d = x[3];
    a = ff(a, b, c, d, k[0], 7, -680876936); d = ff(d, a, b, c, k[1], 12, -389564586);
    c = ff(c, d, a, b, k[2], 17, 606105819); b = ff(b, c, d, a, k[3], 22, -1044525330);
    a = ff(a, b, c, d, k[4], 7, -176418897); d = ff(d, a, b, c, k[5], 12, 1200080426);
    c = ff(c, d, a, b, k[6], 17, -1473231341); b = ff(b, c, d, a, k[7], 22, -45705983);
    a = ff(a, b, c, d, k[8], 7, 1770035416); d = ff(d, a, b, c, k[9], 12, -1958414417);
    c = ff(c, d, a, b, k[10], 17, -42063); b = ff(b, c, d, a, k[11], 22, -1990404162);
    a = ff(a, b, c, d, k[12], 7, 1804603682); d = ff(d, a, b, c, k[13], 12, -40341101);
    c = ff(c, d, a, b, k[14], 17, -1502002290); b = ff(b, c, d, a, k[15], 22, 1236535329);
    a = gg(a, b, c, d, k[1], 5, -165796510); d = gg(d, a, b, c, k[6], 9, -1069501632);
    c = gg(c, d, a, b, k[11], 14, 643717713); b = gg(b, c, d, a, k[0], 20, -373897302);
    a = gg(a, b, c, d, k[5], 5, -701558691); d = gg(d, a, b, c, k[10], 9, 38016083);
    c = gg(c, d, a, b, k[15], 14, -660478335); b = gg(b, c, d, a, k[4], 20, -405537848);
    a = gg(a, b, c, d, k[9], 5, 568446438); d = gg(d, a, b, c, k[14], 9, -1019803690);
    c = gg(c, d, a, b, k[3], 14, -187363961); b = gg(b, c, d, a, k[8], 20, 1163531501);
    a = gg(a, b, c, d, k[13], 5, -1444681467); d = gg(d, a, b, c, k[2], 9, -51403784);
    c = gg(c, d, a, b, k[7], 14, 1735328473); b = gg(b, c, d, a, k[12], 20, -1926607734);
    a = hh(a, b, c, d, k[5], 4, -378558); d = hh(d, a, b, c, k[8], 11, -2022574463);
    c = hh(c, d, a, b, k[11], 16, 1839030562); b = hh(b, c, d, a, k[14], 23, -35309556);
    a = hh(a, b, c, d, k[1], 4, -1530992060); d = hh(d, a, b, c, k[4], 11, 1272893353);
    c = hh(c, d, a, b, k[7], 16, -155497632); b = hh(b, c, d, a, k[10], 23, -1094730640);
    a = hh(a, b, c, d, k[13], 4, 681279174); d = hh(d, a, b, c, k[0], 11, -358537222);
    c = hh(c, d, a, b, k[3], 16, -722521979); b = hh(b, c, d, a, k[6], 23, 76029189);
    a = hh(a, b, c, d, k[9], 4, -640364487); d = hh(d, a, b, c, k[12], 11, -421815835);
    c = hh(c, d, a, b, k[15], 16, 530742520); b = hh(b, c, d, a, k[2], 23, -995338651);
    a = ii(a, b, c, d, k[0], 6, -198630844); d = ii(d, a, b, c, k[7], 10, 1126891415);
    c = ii(c, d, a, b, k[14], 15, -1416354905); b = ii(b, c, d, a, k[5], 21, -57434055);
    a = ii(a, b, c, d, k[12], 6, 1700485571); d = ii(d, a, b, c, k[3], 10, -1894986606);
    c = ii(c, d, a, b, k[10], 15, -1051523); b = ii(b, c, d, a, k[1], 21, -2054922799);
    a = ii(a, b, c, d, k[8], 6, 1873313359); d = ii(d, a, b, c, k[15], 10, -30611744);
    c = ii(c, d, a, b, k[6], 15, -1560198380); b = ii(b, c, d, a, k[13], 21, 1309151649);
    a = ii(a, b, c, d, k[4], 6, -145523070); d = ii(d, a, b, c, k[11], 10, -1120210379);
    c = ii(c, d, a, b, k[2], 15, 718787259); b = ii(b, c, d, a, k[9], 21, -343485551);
    x[0] = add32(a, x[0]); x[1] = add32(b, x[1]); x[2] = add32(c, x[2]); x[3] = add32(d, x[3]);
  }
  function cmn(q, a, b, x, s, t) { a = add32(add32(a, q), add32(x, t)); return add32((a << s) | (a >>> (32 - s)), b); }
  function ff(a, b, c, d, x, s, t) { return cmn((b & c) | (~b & d), a, b, x, s, t); }
  function gg(a, b, c, d, x, s, t) { return cmn((b & d) | (c & ~d), a, b, x, s, t); }
  function hh(a, b, c, d, x, s, t) { return cmn(b ^ c ^ d, a, b, x, s, t); }
  function ii(a, b, c, d, x, s, t) { return cmn(c ^ (b | ~d), a, b, x, s, t); }
  function md51(s) {
    const n = s.length;
    const state = [1732584193, -271733879, -1732584194, 271733878];
    let i;
    for (i = 64; i <= n; i += 64) md5cycle(state, md5blk(s.substring(i - 64, i)));
    s = s.substring(i - 64);
    const tail = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    for (i = 0; i < s.length; i++) tail[i >> 2] |= s.charCodeAt(i) << ((i % 4) << 3);
    tail[i >> 2] |= 0x80 << ((i % 4) << 3);
    if (i > 55) { md5cycle(state, tail); for (i = 0; i < 16; i++) tail[i] = 0; }
    tail[14] = n * 8;
    md5cycle(state, tail);
    return state;
  }
  function md5blk(s) {
    const md5blks = [];
    for (let i = 0; i < 64; i += 4) {
      md5blks[i >> 2] = s.charCodeAt(i) + (s.charCodeAt(i + 1) << 8) + (s.charCodeAt(i + 2) << 16) + (s.charCodeAt(i + 3) << 24);
    }
    return md5blks;
  }
  const hex_chr = "0123456789abcdef".split("");
  function rhex(n) { let s = ""; for (let j = 0; j < 4; j++) s += hex_chr[(n >> (j * 8 + 4)) & 0x0f] + hex_chr[(n >> (j * 8)) & 0x0f]; return s; }
  function hex(x) { for (let i = 0; i < x.length; i++) x[i] = rhex(x[i]); return x.join(""); }
  function add32(a, b) { return (a + b) & 0xffffffff; }
  return hex(md51(str)).toUpperCase();
}

function corsHeaders(env) {
  return {
    "Access-Control-Allow-Origin": env.ALLOWED_ORIGIN || "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
  };
}

function json(data, env, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders(env) },
  });
}