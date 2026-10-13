/* ============================================
   Smart Shopper - Popup Script
   ============================================ */

document.addEventListener('DOMContentLoaded', async () => {
  const statusDot = document.getElementById('status-dot');
  const statusText = document.getElementById('status-text');

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.url && /aliexpress\.(com|us)/.test(tab.url)) {
      statusDot.classList.add('active');
      statusText.textContent = '✅ Actif sur cette page';
    } else {
      statusDot.classList.add('inactive');
      statusText.textContent = '⚠️ Ouvrez une page AliExpress';
    }
  } catch (e) {
    statusText.textContent = 'Erreur de vérification';
  }

  document.getElementById('btn-open-aliexpress').addEventListener('click', () => {
    chrome.tabs.create({ url: 'https://www.aliexpress.com/' });
  });
});