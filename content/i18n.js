/* ============================================
   Smart Shopper - i18n Module
   Full multi-language (38 languages)
   ============================================ */
(function () {
  'use strict';

  const TRANSLATIONS = {
    en: { panelTitle: 'Smart Shopper', panelSubtitle: 'Same product - other sellers ✓',
      tabAll: 'All', tabCheapest: 'Cheapest', tabBestRated: 'Best rated',
      tabBestDiscount: 'Best discount', tabBestSelling: 'Best selling',
      noResults: 'No similar products found.', noReviews: 'No reviews',
      soldSuffix: 'sold', viewAll: 'View all on AliExpress ↗',
      scrollForMore: 'Scroll for more', errorContact: 'Cannot contact AliExpress. Try again.',
      refresh: 'Refresh', minimize: 'Minimize', close: 'Close',
      loading: 'Loading…', pageText: 'Page {p}/{t} · {n} products',
      resultsText: '✓ {n} results', countingText: '⏳ {s}s' },

    fr: { panelTitle: 'Smart Shopper', panelSubtitle: 'Même produit - autres vendeurs ✓',
      tabAll: 'Tous', tabCheapest: 'Moins cher', tabBestRated: 'Mieux noté',
      tabBestDiscount: 'Meilleure remise', tabBestSelling: 'Plus vendu',
      noResults: 'Aucun produit similaire trouvé.', noReviews: 'Aucun avis',
      soldSuffix: 'vendus', viewAll: 'Voir tout sur AliExpress ↗',
      scrollForMore: 'Défilez pour plus', errorContact: 'Impossible de contacter AliExpress.',
      refresh: 'Actualiser', minimize: 'Réduire', close: 'Fermer',
      loading: 'Chargement…', pageText: 'Page {p}/{t} · {n} produits',
      resultsText: '✓ {n} résultats', countingText: '⏳ {s}s' },

    es: { panelTitle: 'Smart Shopper', panelSubtitle: 'Mismo producto - otros vendedores ✓',
      tabAll: 'Todos', tabCheapest: 'Más barato', tabBestRated: 'Mejor valorado',
      tabBestDiscount: 'Mejor descuento', tabBestSelling: 'Más vendido',
      noResults: 'No se encontraron productos similares.', noReviews: 'Sin reseñas',
      soldSuffix: 'vendidos', viewAll: 'Ver todo en AliExpress ↗',
      scrollForMore: 'Desplázate para más', errorContact: 'No se puede contactar con AliExpress.',
      refresh: 'Actualizar', minimize: 'Minimizar', close: 'Cerrar',
      loading: 'Cargando…', pageText: 'Página {p}/{t} · {n} productos',
      resultsText: '✓ {n} resultados', countingText: '⏳ {s}s' },

    de: { panelTitle: 'Smart Shopper', panelSubtitle: 'Gleiches Produkt - andere Verkäufer ✓',
      tabAll: 'Alle', tabCheapest: 'Günstigste', tabBestRated: 'Bestbewertet',
      tabBestDiscount: 'Bester Rabatt', tabBestSelling: 'Meistverkauft',
      noResults: 'Keine ähnlichen Produkte gefunden.', noReviews: 'Keine Bewertungen',
      soldSuffix: 'verkauft', viewAll: 'Alle auf AliExpress anzeigen ↗',
      scrollForMore: 'Für mehr scrollen', errorContact: 'AliExpress kann nicht kontaktiert werden.',
      refresh: 'Aktualisieren', minimize: 'Minimieren', close: 'Schließen',
      loading: 'Laden…', pageText: 'Seite {p}/{t} · {n} Produkte',
      resultsText: '✓ {n} Ergebnisse', countingText: '⏳ {s}s' },

    it: { panelTitle: 'Smart Shopper', panelSubtitle: 'Stesso prodotto - altri venditori ✓',
      tabAll: 'Tutti', tabCheapest: 'Più economico', tabBestRated: 'Meglio valutato',
      tabBestDiscount: 'Miglior sconto', tabBestSelling: 'Più venduto',
      noResults: 'Nessun prodotto simile trovato.', noReviews: 'Nessuna recensione',
      soldSuffix: 'venduti', viewAll: 'Vedi tutto su AliExpress ↗',
      scrollForMore: 'Scorri per altro', errorContact: 'Impossibile contattare AliExpress.',
      refresh: 'Aggiorna', minimize: 'Riduci', close: 'Chiudi',
      loading: 'Caricamento…', pageText: 'Pagina {p}/{t} · {n} prodotti',
      resultsText: '✓ {n} risultati', countingText: '⏳ {s}s' },

    pt: { panelTitle: 'Smart Shopper', panelSubtitle: 'Mesmo produto - outros vendedores ✓',
      tabAll: 'Todos', tabCheapest: 'Mais barato', tabBestRated: 'Melhor avaliado',
      tabBestDiscount: 'Melhor desconto', tabBestSelling: 'Mais vendido',
      noResults: 'Nenhum produto similar encontrado.', noReviews: 'Sem avaliações',
      soldSuffix: 'vendidos', viewAll: 'Ver tudo no AliExpress ↗',
      scrollForMore: 'Role para mais', errorContact: 'Não é possível contatar o AliExpress.',
      refresh: 'Atualizar', minimize: 'Minimizar', close: 'Fechar',
      loading: 'Carregando…', pageText: 'Página {p}/{t} · {n} produtos',
      resultsText: '✓ {n} resultados', countingText: '⏳ {s}s' },

    ru: { panelTitle: 'Smart Shopper', panelSubtitle: 'Тот же товар - другие продавцы ✓',
      tabAll: 'Все', tabCheapest: 'Дешевле', tabBestRated: 'Лучший рейтинг',
      tabBestDiscount: 'Лучшая скидка', tabBestSelling: 'Хит продаж',
      noResults: 'Похожие товары не найдены.', noReviews: 'Нет отзывов',
      soldSuffix: 'продано', viewAll: 'Показать все на AliExpress ↗',
      scrollForMore: 'Прокрутите', errorContact: 'Не удаётся связаться с AliExpress.',
      refresh: 'Обновить', minimize: 'Свернуть', close: 'Закрыть',
      loading: 'Загрузка…', pageText: 'Стр. {p}/{t} · {n} товаров',
      resultsText: '✓ {n} результатов', countingText: '⏳ {s}с' },

    ar: { panelTitle: 'Smart Shopper', panelSubtitle: 'نفس المنتج - بائعون آخرون ✓',
      tabAll: 'الكل', tabCheapest: 'الأرخص', tabBestRated: 'الأعلى تقييماً',
      tabBestDiscount: 'أفضل خصم', tabBestSelling: 'الأكثر مبيعاً',
      noResults: 'لم يتم العثور على منتجات مشابهة.', noReviews: 'لا توجد مراجعات',
      soldSuffix: 'مبيعاً', viewAll: 'عرض الكل على AliExpress ↗',
      scrollForMore: 'اسحب للمزيد', errorContact: 'تعذّر الاتصال بـ AliExpress.',
      refresh: 'تحديث', minimize: 'تصغير', close: 'إغلاق',
      loading: 'جارٍ التحميل…', pageText: 'صفحة {p}/{t} · {n} منتجات',
      resultsText: '✓ {n} نتيجة', countingText: '⏳ {s} ثانية' },

    he: { panelTitle: 'Smart Shopper', panelSubtitle: 'אותו מוצר - מוכרים אחרים ✓',
      tabAll: 'הכל', tabCheapest: 'הזול ביותר', tabBestRated: 'המדורג ביותר',
      tabBestDiscount: 'ההנחה הטובה ביותר', tabBestSelling: 'הנמכר ביותר',
      noResults: 'לא נמצאו מוצרים דומים.', noReviews: 'אין ביקורות',
      soldSuffix: 'נמכרו', viewAll: 'הצג הכל ב-AliExpress ↗',
      scrollForMore: 'גלול לעוד', errorContact: 'לא ניתן ליצור קשר עם AliExpress.',
      refresh: 'רענן', minimize: 'מזער', close: 'סגור',
      loading: 'טוען…', pageText: 'עמוד {p}/{t} · {n} מוצרים',
      resultsText: '✓ {n} תוצאות', countingText: '⏳ {s}שנ' },

    ja: { panelTitle: 'Smart Shopper', panelSubtitle: '同じ商品 - 別の販売者 ✓',
      tabAll: 'すべて', tabCheapest: '最安値', tabBestRated: '最高評価',
      tabBestDiscount: '最大割引', tabBestSelling: 'ベストセラー',
      noResults: '類似商品が見つかりませんでした。', noReviews: 'レビューなし',
      soldSuffix: '販売済み', viewAll: 'AliExpressですべて表示 ↗',
      scrollForMore: 'スクロールして表示', errorContact: 'AliExpressに接続できません。',
      refresh: '更新', minimize: '最小化', close: '閉じる',
      loading: '読み込み中…', pageText: 'ページ {p}/{t} · {n} 商品',
      resultsText: '✓ {n} 件', countingText: '⏳ {s}秒' },

    ko: { panelTitle: 'Smart Shopper', panelSubtitle: '같은 상품 - 다른 판매자 ✓',
      tabAll: '전체', tabCheapest: '최저가', tabBestRated: '최고 평점',
      tabBestDiscount: '최대 할인', tabBestSelling: '베스트셀러',
      noResults: '유사 상품을 찾을 수 없습니다.', noReviews: '리뷰 없음',
      soldSuffix: '판매됨', viewAll: 'AliExpress에서 모두 보기 ↗',
      scrollForMore: '더 보려면 스크롤', errorContact: 'AliExpress에 연결할 수 없습니다.',
      refresh: '새로고침', minimize: '최소화', close: '닫기',
      loading: '로딩 중…', pageText: '페이지 {p}/{t} · {n}개 상품',
      resultsText: '✓ {n}개 결과', countingText: '⏳ {s}초' },

    th: { panelTitle: 'Smart Shopper', panelSubtitle: 'สินค้าเดียวกัน - ผู้ขายรายอื่น ✓',
      tabAll: 'ทั้งหมด', tabCheapest: 'ถูกที่สุด', tabBestRated: 'คะแนนสูงสุด',
      tabBestDiscount: 'ส่วนลดดีที่สุด', tabBestSelling: 'ขายดีที่สุด',
      noResults: 'ไม่พบสินค้าที่คล้ายกัน', noReviews: 'ไม่มีความคิดเห็น',
      soldSuffix: 'ขายแล้ว', viewAll: 'ดูทั้งหมดบน AliExpress ↗',
      scrollForMore: 'เลื่อนเพื่อดูเพิ่ม', errorContact: 'ไม่สามารถติดต่อ AliExpress',
      refresh: 'รีเฟรช', minimize: 'ย่อ', close: 'ปิด',
      loading: 'กำลังโหลด…', pageText: 'หน้า {p}/{t} · {n} สินค้า',
      resultsText: '✓ {n} ผลลัพธ์', countingText: '⏳ {s}วิ' },

    vi: { panelTitle: 'Smart Shopper', panelSubtitle: 'Cùng sản phẩm - người bán khác ✓',
      tabAll: 'Tất cả', tabCheapest: 'Rẻ nhất', tabBestRated: 'Đánh giá cao',
      tabBestDiscount: 'Giảm giá tốt nhất', tabBestSelling: 'Bán chạy nhất',
      noResults: 'Không tìm thấy sản phẩm tương tự.', noReviews: 'Không có đánh giá',
      soldSuffix: 'đã bán', viewAll: 'Xem tất cả trên AliExpress ↗',
      scrollForMore: 'Cuộn để xem thêm', errorContact: 'Không thể liên hệ AliExpress.',
      refresh: 'Làm mới', minimize: 'Thu nhỏ', close: 'Đóng',
      loading: 'Đang tải…', pageText: 'Trang {p}/{t} · {n} sản phẩm',
      resultsText: '✓ {n} kết quả', countingText: '⏳ {s}s' },

    tr: { panelTitle: 'Smart Shopper', panelSubtitle: 'Aynı ürün - diğer satıcılar ✓',
      tabAll: 'Tümü', tabCheapest: 'En ucuz', tabBestRated: 'En iyi puan',
      tabBestDiscount: 'En iyi indirim', tabBestSelling: 'En çok satan',
      noResults: 'Benzer ürün bulunamadı.', noReviews: 'Yorum yok',
      soldSuffix: 'satıldı', viewAll: "AliExpress'te tümünü gör ↗",
      scrollForMore: 'Daha fazla için kaydırın', errorContact: 'AliExpress ile iletişim kurulamıyor.',
      refresh: 'Yenile', minimize: 'Küçült', close: 'Kapat',
      loading: 'Yükleniyor…', pageText: 'Sayfa {p}/{t} · {n} ürün',
      resultsText: '✓ {n} sonuç', countingText: '⏳ {s}s' },

    pl: { panelTitle: 'Smart Shopper', panelSubtitle: 'Ten sam produkt - inni sprzedawcy ✓',
      tabAll: 'Wszystkie', tabCheapest: 'Najtańsze', tabBestRated: 'Najlepiej oceniane',
      tabBestDiscount: 'Najlepsza zniżka', tabBestSelling: 'Najczęściej kupowane',
      noResults: 'Nie znaleziono podobnych produktów.', noReviews: 'Brak opinii',
      soldSuffix: 'sprzedanych', viewAll: 'Zobacz wszystko na AliExpress ↗',
      scrollForMore: 'Przewiń', errorContact: 'Nie można skontaktować się z AliExpress.',
      refresh: 'Odśwież', minimize: 'Minimalizuj', close: 'Zamknij',
      loading: 'Ładowanie…', pageText: 'Strona {p}/{t} · {n} produktów',
      resultsText: '✓ {n} wyników', countingText: '⏳ {s}s' },

    nl: { panelTitle: 'Smart Shopper', panelSubtitle: 'Hetzelfde product - andere verkopers ✓',
      tabAll: 'Alle', tabCheapest: 'Goedkoopste', tabBestRated: 'Best beoordeeld',
      tabBestDiscount: 'Beste korting', tabBestSelling: 'Best verkocht',
      noResults: 'Geen vergelijkbare producten gevonden.', noReviews: 'Geen beoordelingen',
      soldSuffix: 'verkocht', viewAll: 'Alles bekijken op AliExpress ↗',
      scrollForMore: 'Scroll voor meer', errorContact: 'Kan geen contact maken met AliExpress.',
      refresh: 'Vernieuwen', minimize: 'Minimaliseren', close: 'Sluiten',
      loading: 'Laden…', pageText: 'Pagina {p}/{t} · {n} producten',
      resultsText: '✓ {n} resultaten', countingText: '⏳ {s}s' },

    id: { panelTitle: 'Smart Shopper', panelSubtitle: 'Produk sama - penjual lain ✓',
      tabAll: 'Semua', tabCheapest: 'Termurah', tabBestRated: 'Rating terbaik',
      tabBestDiscount: 'Diskon terbaik', tabBestSelling: 'Terlaris',
      noResults: 'Tidak ada produk serupa ditemukan.', noReviews: 'Tidak ada ulasan',
      soldSuffix: 'terjual', viewAll: 'Lihat semua di AliExpress ↗',
      scrollForMore: 'Gulir untuk lebih', errorContact: 'Tidak dapat menghubungi AliExpress.',
      refresh: 'Segarkan', minimize: 'Perkecil', close: 'Tutup',
      loading: 'Memuat…', pageText: 'Halaman {p}/{t} · {n} produk',
      resultsText: '✓ {n} hasil', countingText: '⏳ {s}d' },

    ms: { panelTitle: 'Smart Shopper', panelSubtitle: 'Produk sama - penjual lain ✓',
      tabAll: 'Semua', tabCheapest: 'Termurah', tabBestRated: 'Penilaian terbaik',
      tabBestDiscount: 'Diskaun terbaik', tabBestSelling: 'Paling laris',
      noResults: 'Tiada produk serupa ditemui.', noReviews: 'Tiada ulasan',
      soldSuffix: 'terjual', viewAll: 'Lihat semua di AliExpress ↗',
      scrollForMore: 'Tatal untuk lebih', errorContact: 'Tidak dapat menghubungi AliExpress.',
      refresh: 'Segar semula', minimize: 'Kecilkan', close: 'Tutup',
      loading: 'Memuatkan…', pageText: 'Halaman {p}/{t} · {n} produk',
      resultsText: '✓ {n} hasil', countingText: '⏳ {s}s' },

    hi: { panelTitle: 'Smart Shopper', panelSubtitle: 'एक ही उत्पाद - अन्य विक्रेता ✓',
      tabAll: 'सभी', tabCheapest: 'सबसे सस्ता', tabBestRated: 'सर्वाधिक रेटेड',
      tabBestDiscount: 'सर्वश्रेष्ठ छूट', tabBestSelling: 'सर्वाधिक बिकने वाला',
      noResults: 'कोई समान उत्पाद नहीं मिला।', noReviews: 'कोई समीक्षा नहीं',
      soldSuffix: 'बिके', viewAll: 'AliExpress पर सभी देखें ↗',
      scrollForMore: 'और देखने के लिए स्क्रॉल करें', errorContact: 'AliExpress से संपर्क नहीं हो पा रहा।',
      refresh: 'रिफ्रेश', minimize: 'मिनिमाइज़', close: 'बंद',
      loading: 'लोड हो रहा है…', pageText: 'पृष्ठ {p}/{t} · {n} उत्पाद',
      resultsText: '✓ {n} परिणाम', countingText: '⏳ {s}से' },

    bn: { panelTitle: 'Smart Shopper', panelSubtitle: 'একই পণ্য - অন্যান্য বিক্রেতা ✓',
      tabAll: 'সব', tabCheapest: 'সবচেয়ে সস্তা', tabBestRated: 'সর্বোচ্চ রেটেড',
      tabBestDiscount: 'সেরা ছাড়', tabBestSelling: 'সর্বাধিক বিক্রীত',
      noResults: 'কোনো অনুরূপ পণ্য পাওয়া যায়নি।', noReviews: 'কোনো পর্যালোচনা নেই',
      soldSuffix: 'বিক্রি', viewAll: 'AliExpress-এ সব দেখুন ↗',
      scrollForMore: 'আরও দেখতে স্ক্রল করুন', errorContact: 'AliExpress-এ যোগাযোগ করা যাচ্ছে না।',
      refresh: 'রিফ্রেশ', minimize: 'ছোট করুন', close: 'বন্ধ',
      loading: 'লোড হচ্ছে…', pageText: 'পৃষ্ঠা {p}/{t} · {n} পণ্য',
      resultsText: '✓ {n} ফলাফল', countingText: '⏳ {s}সে' },

    ur: { panelTitle: 'Smart Shopper', panelSubtitle: 'ایک ہی پروڈکٹ - دوسرے بیچنے والے ✓',
      tabAll: 'تمام', tabCheapest: 'سب سے سستا', tabBestRated: 'بہترین درجہ',
      tabBestDiscount: 'بہترین رعایت', tabBestSelling: 'سب سے زیادہ فروخت',
      noResults: 'کوئی مشابہ پروڈکٹ نہیں ملا۔', noReviews: 'کوئی جائزہ نہیں',
      soldSuffix: 'فروخت', viewAll: 'AliExpress پر سب دیکھیں ↗',
      scrollForMore: 'مزید کے لیے اسکرول کریں', errorContact: 'AliExpress سے رابطہ نہیں ہو سکتا۔',
      refresh: 'ریفریش', minimize: 'چھوٹا کریں', close: 'بند',
      loading: 'لوڈ ہو رہا ہے…', pageText: 'صفحہ {p}/{t} · {n} پروڈکٹس',
      resultsText: '✓ {n} نتائج', countingText: '⏳ {s}سیکنڈ' },

    fa: { panelTitle: 'Smart Shopper', panelSubtitle: 'همان محصول - فروشندگان دیگر ✓',
      tabAll: 'همه', tabCheapest: 'ارزان‌ترین', tabBestRated: 'بهترین امتیاز',
      tabBestDiscount: 'بهترین تخفیف', tabBestSelling: 'پرفروش‌ترین',
      noResults: 'محصول مشابهی یافت نشد.', noReviews: 'بدون نظر',
      soldSuffix: 'فروخته شده', viewAll: 'مشاهده همه در AliExpress ↗',
      scrollForMore: 'برای بیشتر اسکرول کنید', errorContact: 'امکان ارتباط با AliExpress نیست.',
      refresh: 'بازنشانی', minimize: 'کوچک', close: 'بستن',
      loading: 'در حال بارگذاری…', pageText: 'صفحه {p}/{t} · {n} محصول',
      resultsText: '✓ {n} نتیجه', countingText: '⏳ {s}ث' },

    uk: { panelTitle: 'Smart Shopper', panelSubtitle: 'Той самий товар - інші продавці ✓',
      tabAll: 'Усі', tabCheapest: 'Найдешевші', tabBestRated: 'Найкращий рейтинг',
      tabBestDiscount: 'Найкраща знижка', tabBestSelling: 'Хіт продажів',
      noResults: 'Схожих товарів не знайдено.', noReviews: 'Немає відгуків',
      soldSuffix: 'продано', viewAll: 'Показати все на AliExpress ↗',
      scrollForMore: 'Прокрутіть', errorContact: 'Не вдається зв\'язатися з AliExpress.',
      refresh: 'Оновити', minimize: 'Згорнути', close: 'Закрити',
      loading: 'Завантаження…', pageText: 'Стор. {p}/{t} · {n} товарів',
      resultsText: '✓ {n} результатів', countingText: '⏳ {s}с' },

    el: { panelTitle: 'Smart Shopper', panelSubtitle: 'Ίδιο προϊόν - άλλοι πωλητές ✓',
      tabAll: 'Όλα', tabCheapest: 'Φθηνότερα', tabBestRated: 'Καλύτερα αξιολογημένα',
      tabBestDiscount: 'Καλύτερη έκπτωση', tabBestSelling: 'Περισσότερο πουλημένα',
      noResults: 'Δεν βρέθηκαν παρόμοια προϊόντα.', noReviews: 'Χωρίς κριτικές',
      soldSuffix: 'πωλήθηκαν', viewAll: 'Δείτε όλα στο AliExpress ↗',
      scrollForMore: 'Κύλιση για περισσότερα', errorContact: 'Δεν είναι δυνατή η επικοινωνία με το AliExpress.',
      refresh: 'Ανανέωση', minimize: 'Ελαχιστοποίηση', close: 'Κλείσιμο',
      loading: 'Φόρτωση…', pageText: 'Σελίδα {p}/{t} · {n} προϊόντα',
      resultsText: '✓ {n} αποτελέσματα', countingText: '⏳ {s}δ' },

    cs: { panelTitle: 'Smart Shopper', panelSubtitle: 'Stejný produkt - jiní prodejci ✓',
      tabAll: 'Vše', tabCheapest: 'Nejlevnější', tabBestRated: 'Nejlépe hodnocené',
      tabBestDiscount: 'Nejlepší sleva', tabBestSelling: 'Nejprodávanější',
      noResults: 'Nebyly nalezeny podobné produkty.', noReviews: 'Žádné recenze',
      soldSuffix: 'prodáno', viewAll: 'Zobrazit vše na AliExpress ↗',
      scrollForMore: 'Posuňte pro více', errorContact: 'Nelze kontaktovat AliExpress.',
      refresh: 'Obnovit', minimize: 'Minimalizovat', close: 'Zavřít',
      loading: 'Načítání…', pageText: 'Strana {p}/{t} · {n} produktů',
      resultsText: '✓ {n} výsledků', countingText: '⏳ {s}s' },

    sv: { panelTitle: 'Smart Shopper', panelSubtitle: 'Samma produkt - andra säljare ✓',
      tabAll: 'Alla', tabCheapest: 'Billigaste', tabBestRated: 'Bäst betyg',
      tabBestDiscount: 'Bästa rabatten', tabBestSelling: 'Bästsäljande',
      noResults: 'Inga liknande produkter hittades.', noReviews: 'Inga recensioner',
      soldSuffix: 'sålda', viewAll: 'Visa alla på AliExpress ↗',
      scrollForMore: 'Rulla för mer', errorContact: 'Kan inte kontakta AliExpress.',
      refresh: 'Uppdatera', minimize: 'Minimera', close: 'Stäng',
      loading: 'Laddar…', pageText: 'Sida {p}/{t} · {n} produkter',
      resultsText: '✓ {n} resultat', countingText: '⏳ {s}s' },

    da: { panelTitle: 'Smart Shopper', panelSubtitle: 'Samme produkt - andre sælgere ✓',
      tabAll: 'Alle', tabCheapest: 'Billigste', tabBestRated: 'Bedst bedømt',
      tabBestDiscount: 'Bedste rabat', tabBestSelling: 'Bedst sælgende',
      noResults: 'Ingen lignende produkter fundet.', noReviews: 'Ingen anmeldelser',
      soldSuffix: 'solgt', viewAll: 'Se alle på AliExpress ↗',
      scrollForMore: 'Rul for mere', errorContact: 'Kan ikke kontakte AliExpress.',
      refresh: 'Opdater', minimize: 'Minimer', close: 'Luk',
      loading: 'Indlæser…', pageText: 'Side {p}/{t} · {n} produkter',
      resultsText: '✓ {n} resultater', countingText: '⏳ {s}s' },

    no: { panelTitle: 'Smart Shopper', panelSubtitle: 'Samme produkt - andre selgere ✓',
      tabAll: 'Alle', tabCheapest: 'Billigste', tabBestRated: 'Best vurdert',
      tabBestDiscount: 'Beste rabatt', tabBestSelling: 'Bestselgende',
      noResults: 'Ingen lignende produkter funnet.', noReviews: 'Ingen anmeldelser',
      soldSuffix: 'solgt', viewAll: 'Se alle på AliExpress ↗',
      scrollForMore: 'Rull for mer', errorContact: 'Kan ikke kontakte AliExpress.',
      refresh: 'Oppdater', minimize: 'Minimer', close: 'Lukk',
      loading: 'Laster…', pageText: 'Side {p}/{t} · {n} produkter',
      resultsText: '✓ {n} resultater', countingText: '⏳ {s}s' },

    fi: { panelTitle: 'Smart Shopper', panelSubtitle: 'Sama tuote - muut myyjät ✓',
      tabAll: 'Kaikki', tabCheapest: 'Halvimmat', tabBestRated: 'Parhaiten arvioidut',
      tabBestDiscount: 'Paras alennus', tabBestSelling: 'Myydyimmät',
      noResults: 'Vastaavia tuotteita ei löytynyt.', noReviews: 'Ei arvosteluja',
      soldSuffix: 'myyty', viewAll: 'Näytä kaikki AliExpressissä ↗',
      scrollForMore: 'Vieritä lisää', errorContact: 'AliExpressiin ei saada yhteyttä.',
      refresh: 'Päivitä', minimize: 'Pienennä', close: 'Sulje',
      loading: 'Ladataan…', pageText: 'Sivu {p}/{t} · {n} tuotetta',
      resultsText: '✓ {n} tulosta', countingText: '⏳ {s}s' },

    hu: { panelTitle: 'Smart Shopper', panelSubtitle: 'Ugyanaz a termék - más eladók ✓',
      tabAll: 'Összes', tabCheapest: 'Legolcsóbb', tabBestRated: 'Legjobbra értékelt',
      tabBestDiscount: 'Legjobb kedvezmény', tabBestSelling: 'Legkelendőbb',
      noResults: 'Nem található hasonló termék.', noReviews: 'Nincs értékelés',
      soldSuffix: 'eladva', viewAll: 'Összes megtekintése az AliExpress-en ↗',
      scrollForMore: 'Görgessen tovább', errorContact: 'Nem sikerül kapcsolatba lépni az AliExpress-szel.',
      refresh: 'Frissítés', minimize: 'Kicsinyítés', close: 'Bezárás',
      loading: 'Betöltés…', pageText: '{p}/{t}. oldal · {n} termék',
      resultsText: '✓ {n} találat', countingText: '⏳ {s}mp' },

    ro: { panelTitle: 'Smart Shopper', panelSubtitle: 'Același produs - alți vânzători ✓',
      tabAll: 'Toate', tabCheapest: 'Cele mai ieftine', tabBestRated: 'Cele mai bine evaluate',
      tabBestDiscount: 'Cea mai bună reducere', tabBestSelling: 'Cele mai vândute',
      noResults: 'Nu s-au găsit produse similare.', noReviews: 'Fără recenzii',
      soldSuffix: 'vândute', viewAll: 'Vezi tot pe AliExpress ↗',
      scrollForMore: 'Derulează pentru mai mult', errorContact: 'Nu se poate contacta AliExpress.',
      refresh: 'Reîmprospătează', minimize: 'Minimizează', close: 'Închide',
      loading: 'Se încarcă…', pageText: 'Pagina {p}/{t} · {n} produse',
      resultsText: '✓ {n} rezultate', countingText: '⏳ {s}s' },

    bg: { panelTitle: 'Smart Shopper', panelSubtitle: 'Същият продукт - други продавачи ✓',
      tabAll: 'Всички', tabCheapest: 'Най-евтини', tabBestRated: 'Най-добре оценени',
      tabBestDiscount: 'Най-добра отстъпка', tabBestSelling: 'Най-продавани',
      noResults: 'Не са намерени подобни продукти.', noReviews: 'Няма отзиви',
      soldSuffix: 'продадени', viewAll: 'Вижте всички в AliExpress ↗',
      scrollForMore: 'Превъртете за повече', errorContact: 'Не може да се свърже с AliExpress.',
      refresh: 'Опресни', minimize: 'Минимизирай', close: 'Затвори',
      loading: 'Зареждане…', pageText: 'Страница {p}/{t} · {n} продукта',
      resultsText: '✓ {n} резултата', countingText: '⏳ {s}с' },

    hr: { panelTitle: 'Smart Shopper', panelSubtitle: 'Isti proizvod - drugi prodavači ✓',
      tabAll: 'Sve', tabCheapest: 'Najjeftinije', tabBestRated: 'Najbolje ocijenjeno',
      tabBestDiscount: 'Najbolji popust', tabBestSelling: 'Najprodavanije',
      noResults: 'Nisu pronađeni slični proizvodi.', noReviews: 'Nema recenzija',
      soldSuffix: 'prodano', viewAll: 'Pogledaj sve na AliExpressu ↗',
      scrollForMore: 'Pomaknite za više', errorContact: 'Ne može se kontaktirati AliExpress.',
      refresh: 'Osvježi', minimize: 'Minimiziraj', close: 'Zatvori',
      loading: 'Učitavanje…', pageText: 'Stranica {p}/{t} · {n} proizvoda',
      resultsText: '✓ {n} rezultata', countingText: '⏳ {s}s' },

    sk: { panelTitle: 'Smart Shopper', panelSubtitle: 'Rovnaký produkt - iní predajcovia ✓',
      tabAll: 'Všetko', tabCheapest: 'Najlacnejšie', tabBestRated: 'Najlepšie hodnotené',
      tabBestDiscount: 'Najlepšia zľava', tabBestSelling: 'Najpredávanejšie',
      noResults: 'Nenašli sa podobné produkty.', noReviews: 'Žiadne recenzie',
      soldSuffix: 'predané', viewAll: 'Zobraziť všetko na AliExpress ↗',
      scrollForMore: 'Posuňte pre viac', errorContact: 'Nedá sa kontaktovať AliExpress.',
      refresh: 'Obnoviť', minimize: 'Minimalizovať', close: 'Zavrieť',
      loading: 'Načítava sa…', pageText: 'Strana {p}/{t} · {n} produktov',
      resultsText: '✓ {n} výsledkov', countingText: '⏳ {s}s' },

    sl: { panelTitle: 'Smart Shopper', panelSubtitle: 'Isti izdelek - drugi prodajalci ✓',
      tabAll: 'Vse', tabCheapest: 'Najcenejše', tabBestRated: 'Najbolje ocenjeno',
      tabBestDiscount: 'Najboljši popust', tabBestSelling: 'Najbolje prodajano',
      noResults: 'Ni podobnih izdelkov.', noReviews: 'Ni ocen',
      soldSuffix: 'prodano', viewAll: 'Poglej vse na AliExpress ↗',
      scrollForMore: 'Pomaknite za več', errorContact: 'Ni mogoče kontaktirati AliExpress.',
      refresh: 'Osveži', minimize: 'Minimiziraj', close: 'Zapri',
      loading: 'Nalaganje…', pageText: 'Stran {p}/{t} · {n} izdelkov',
      resultsText: '✓ {n} rezultatov', countingText: '⏳ {s}s' },

    lt: { panelTitle: 'Smart Shopper', panelSubtitle: 'Tas pats produktas - kiti pardavėjai ✓',
      tabAll: 'Visi', tabCheapest: 'Pigiausi', tabBestRated: 'Geriausiai įvertinti',
      tabBestDiscount: 'Geriausia nuolaida', tabBestSelling: 'Perkamiausi',
      noResults: 'Panašių produktų nerasta.', noReviews: 'Nėra atsiliepimų',
      soldSuffix: 'parduota', viewAll: 'Peržiūrėti viską „AliExpress“ ↗',
      scrollForMore: 'Slinkite daugiau', errorContact: 'Nepavyksta susisiekti su „AliExpress“.',
      refresh: 'Atnaujinti', minimize: 'Sumažinti', close: 'Uždaryti',
      loading: 'Įkeliama…', pageText: 'Psl. {p}/{t} · {n} produktų',
      resultsText: '✓ {n} rezultatų', countingText: '⏳ {s}s' },

    lv: { panelTitle: 'Smart Shopper', panelSubtitle: 'Tas pats produkts - citi pārdevēji ✓',
      tabAll: 'Visi', tabCheapest: 'Lētākie', tabBestRated: 'Vislabāk novērtētie',
      tabBestDiscount: 'Labākā atlaide', tabBestSelling: 'Pārdotākie',
      noResults: 'Līdzīgi produkti nav atrasti.', noReviews: 'Nav atsauksmju',
      soldSuffix: 'pārdots', viewAll: 'Skatīt visu AliExpress ↗',
      scrollForMore: 'Ritiniet vairāk', errorContact: 'Nevar sazināties ar AliExpress.',
      refresh: 'Atsvaidzināt', minimize: 'Minimizēt', close: 'Aizvērt',
      loading: 'Ielādē…', pageText: 'Lpp. {p}/{t} · {n} produkti',
      resultsText: '✓ {n} rezultāti', countingText: '⏳ {s}s' },

    et: { panelTitle: 'Smart Shopper', panelSubtitle: 'Sama toode - teised müüjad ✓',
      tabAll: 'Kõik', tabCheapest: 'Odavaimad', tabBestRated: 'Parimalt hinnatud',
      tabBestDiscount: 'Parim allahindlus', tabBestSelling: 'Enimmüüdud',
      noResults: 'Sarnaseid tooteid ei leitud.', noReviews: 'Arvustusi pole',
      soldSuffix: 'müüdud', viewAll: 'Vaata kõiki AliExpressis ↗',
      scrollForMore: 'Keri rohkem', errorContact: 'Ei saa AliExpressiga ühendust.',
      refresh: 'Värskenda', minimize: 'Minimeeri', close: 'Sulge',
      loading: 'Laadimine…', pageText: 'Lk {p}/{t} · {n} toodet',
      resultsText: '✓ {n} tulemust', countingText: '⏳ {s}s' }
  };

  /* ============================================
     كشف اللغة من عدة مصادر
     ============================================ */
  function detectLang() {
    // 1. Subdomain (fr.aliexpress.com, es.aliexpress.com, ...)
    const host = location.hostname || '';
    const sub = host.split('.')[0];
    const validSubs = ['fr','es','ru','pt','de','it','ar','ko','ja','th','vi','tr','pl','nl','he','id','ms','hi'];
    if (validSubs.includes(sub)) return sub;

    // 2. query param ?lang=XX
    try {
      const params = new URLSearchParams(location.search);
      const langParam = params.get('lang');
      if (langParam && TRANSLATIONS[langParam]) return langParam;
    } catch (e) {}

    // 3. HTML lang
    const htmlLang = (document.documentElement.lang || '').toLowerCase().split('-')[0];
    if (htmlLang && TRANSLATIONS[htmlLang]) return htmlLang;

    // 4. Cookie AliExpress
    try {
      const ck = document.cookie.match(/(?:^|;\s*)aep_usuc_f=([^;]+)/);
      if (ck) {
        const params = new URLSearchParams(decodeURIComponent(ck[1]));
        const bLocale = params.get('b_locale') || params.get('site');
        if (bLocale) {
          const code = bLocale.split('_')[0].toLowerCase();
          if (TRANSLATIONS[code]) return code;
        }
      }
    } catch (e) {}

    // 5. لغة المتصفح
    const navLang = (navigator.language || 'en').split('-')[0].toLowerCase();
    if (TRANSLATIONS[navLang]) return navLang;

    // 6. افتراضي
    return 'en';
  }

  const currentLang = detectLang();
  console.log('[Smart Shopper] Language detected:', currentLang);

  // اتجاه النص للغات RTL
  const RTL_LANGS = ['ar', 'he', 'ur', 'fa'];
  const isRTL = RTL_LANGS.includes(currentLang);

  window.SS_I18N = {
    lang: currentLang,
    isRTL: isRTL,
    t(key, vars) {
      const dict = TRANSLATIONS[currentLang] || TRANSLATIONS.en;
      let str = dict[key] || TRANSLATIONS.en[key] || key;
      if (vars) {
        for (const k in vars) {
          str = str.replace(new RegExp('\\{' + k + '\\}', 'g'), vars[k]);
        }
      }
      return str;
    }
  };

  // ضبط اتجاه الصفحة للغات RTL
  if (isRTL) {
    const style = document.createElement('style');
    style.textContent = '#ss-panel { direction: rtl; } #ss-panel .ss-title, #ss-panel .ss-sub { text-align: right; }';
    document.documentElement.appendChild(style);
  }
})();