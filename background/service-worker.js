/* ============================================
   Smart Shopper - Background Service Worker
   Minimal - fetching done in content script
   ============================================ */

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg) return;
  if (msg.type === 'PING') {
    sendResponse({ ok: true });
  }
  return true;
});

console.log('[Smart Shopper BG] Service worker ready.');