/* ═══════════════════════════════════════════════════════
   Smart Shopper — Popup Script
   يعرض المنتجات المخزنة في Neon DB.
   ═══════════════════════════════════════════════════════ */

const WORKER_URL = "https://smart-shopper-proxy.fislilouiza91.workers.dev";

let allProducts = [];

document.addEventListener("DOMContentLoaded", () => {
  loadProducts();

  document.getElementById("refresh").addEventListener("click", loadProducts);

  document.getElementById("searchInput").addEventListener("input", (e) => {
    const query = e.target.value.trim().toLowerCase();
    renderProducts(filterProducts(query));
  });

  document.getElementById("clearBtn").addEventListener("click", async () => {
    if (!confirm("هل أنت متأكد من مسح كل المنتجات المخزنة؟")) return;
    try {
      await fetch(`${WORKER_URL}/products/clear`, { method: "POST" });
      loadProducts();
    } catch (err) {
      alert("فشل المسح: " + err.message);
    }
  });
});

async function loadProducts() {
  const status = document.getElementById("status");
  const list = document.getElementById("productsList");

  status.textContent = "جاري التحميل...";
  list.innerHTML = '<div class="loading">جاري التحميل...</div>';

  try {
    const res = await fetch(`${WORKER_URL}/products`);
    const data = await res.json();

    allProducts = data.rows || [];
    status.textContent = `تم العثور على ${allProducts.length} منتج`;
    renderProducts(allProducts);
  } catch (err) {
    status.textContent = "خطأ في التحميل";
    list.innerHTML = `<div class="empty">تعذر الاتصال بالخادم<br>${err.message}</div>`;
  }
}

function filterProducts(query) {
  if (!query) return allProducts;
  return allProducts.filter(p => {
    const title = (p.title || "").toLowerCase();
    const url = (p.product_url || "").toLowerCase();
    return title.includes(query) || url.includes(query);
  });
}

function renderProducts(products) {
  const list = document.getElementById("productsList");
  const stats = document.getElementById("stats");

  if (!products.length) {
    list.innerHTML = '<div class="empty">لا توجد منتجات محفوظة بعد<br>تصفح AliExpress لبدء التسجيل</div>';
    stats.textContent = "";
    return;
  }

  // الإحصائيات
  const avgPrice = (products.reduce((sum, p) => sum + parseFloat(p.price || 0), 0) / products.length).toFixed(2);
  stats.innerHTML = `📊 متوسط السعر: <b>$${avgPrice}</b> · عدد: <b>${products.length}</b>`;

  list.innerHTML = products.map(p => {
    const title = escapeHtml(p.title || "بدون عنوان");
    const price = formatPrice(p.price, p.currency);
    const rating = p.rating ? `<span class="product-rating">★ ${parseFloat(p.rating).toFixed(1)}</span>` : "";
    const sold = p.sold_count ? `<span class="product-sold">${formatNumber(p.sold_count)} مباع</span>` : "";
    const img = p.image_url ? `<img src="${escapeHtml(p.image_url)}" loading="lazy" onerror="this.style.display='none'">` : "";
    const time = formatTime(p.updated_at || p.scraped_at);

    return `
      <div class="product" data-url="${escapeHtml(p.product_url)}">
        <div class="product-thumb">${img}</div>
        <div class="product-info">
          <div class="product-title">${title}</div>
          <div class="product-meta">
            <span class="product-price">${price}</span>
            ${rating}
            ${sold}
          </div>
          <div class="product-time">${time}</div>
        </div>
      </div>
    `;
  }).join("");

  // فتح الرابط عند النقر
  list.querySelectorAll(".product").forEach(el => {
    el.addEventListener("click", () => {
      const url = el.dataset.url;
      if (url) chrome.tabs.create({ url });
    });
  });
}

/* ─── Helpers ─── */
function formatPrice(value, currency) {
  if (value == null) return "—";
  const symbols = { USD: "$", EUR: "€", GBP: "£", SAR: "﷼", DA: "DA ", TRY: "₺", RUB: "₽", CNY: "¥" };
  const sym = symbols[currency] || "$";
  const num = parseFloat(value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${sym}${num}`;
}

function formatNumber(n) {
  n = parseInt(n, 10);
  if (n >= 1000) return (n / 1000).toFixed(1).replace(".0", "") + "k";
  return n;
}

function formatTime(isoStr) {
  if (!isoStr) return "";
  try {
    const date = new Date(isoStr);
    const diff = Date.now() - date.getTime();
    const mins = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    if (mins < 1) return "الآن";
    if (mins < 60) return `قبل ${mins} دقيقة`;
    if (hours < 24) return `قبل ${hours} ساعة`;
    if (days < 30) return `قبل ${days} يوم`;
    return date.toLocaleDateString("ar-EG");
  } catch (_) { return ""; }
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}