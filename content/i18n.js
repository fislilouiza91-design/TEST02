/* ============================================
   Smart Shopper - i18n Module
   Lightweight translation system
   ============================================ */

(function () {
  'use strict';

  const TRANSLATIONS = {
    fr: {
      panelTitle: 'Smart Shopper',
      panelSubtitle: 'Même produit - autres vendeurs ✓',
      tabAll: '🛍️ Tous',
      tabCheapest: '💰 Moins cher',
      tabBestRated: '⭐ Mieux noté',
      tabBestDiscount: '🔥 Meilleure remise',
      tabBestSelling: '📈 Plus vendu',
      noResults: 'Aucun produit similaire trouvé.',
      noReviews: 'Aucun avis',
      soldSuffix: 'vendus',
      viewAll: 'Voir tout sur AliExpress ↗',
      scrollForMore: 'Défilez pour plus',
      errorContact: 'Impossible de contacter AliExpress. Réessayez.',
      refresh: 'Actualiser',
      minimize: 'Réduire',
      close: 'Fermer'
    },
    en: {
      panelTitle: 'Smart Shopper',
      panelSubtitle: 'Same product - other sellers ✓',
      tabAll: '🛍️ All',
      tabCheapest: '💰 Cheapest',
      tabBestRated: '⭐ Best rated',
      tabBestDiscount: '🔥 Best discount',
      tabBestSelling: '📈 Best selling',
      noResults: 'No similar products found.',
      noReviews: 'No reviews',
      soldSuffix: 'sold',
      viewAll: 'View all on AliExpress ↗',
      scrollForMore: 'Scroll for more',
      errorContact: 'Cannot contact AliExpress. Try again.',
      refresh: 'Refresh',
      minimize: 'Minimize',
      close: 'Close'
    }
  };

  /**
   * كشف اللغة الحالية من المتصفح
   */
  function detectLang() {
    const lang = (navigator.language || 'fr').split('-')[0].toLowerCase();
    return TRANSLATIONS[lang] ? lang : 'fr';
  }

  /**
   * كائن الترجمة الذي يُستخدم في content.js
   */
  window.SS_I18N = {
    lang: detectLang(),
    t(key) {
      const dict = TRANSLATIONS[this.lang] || TRANSLATIONS.fr;
      return dict[key] || TRANSLATIONS.fr[key] || key;
    }
  };

  console.log('[Smart Shopper] i18n loaded:', window.SS_I18N.lang);
})();