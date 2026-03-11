// Runs on https://www.linkedin.com/in/* pages
// Listens for messages from the popup and returns scraped profile data

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getProfileText') {
    try {
      // Grab the main content area text (same as manual Cmd+A, Cmd+C)
      const main = document.querySelector('main') || document.body;
      const text = main.innerText;

      // Also try to fast-extract the name directly from the DOM
      // LinkedIn's name is always in the first h1 on a profile page
      const nameEl = document.querySelector('h1');
      const name = nameEl ? nameEl.innerText.trim() : '';

      sendResponse({
        ok: true,
        text: text.slice(0, 12000),
        name,
        url: window.location.href,
      });
    } catch (e) {
      sendResponse({ ok: false, error: e.message });
    }
  }
  return true; // Keep message channel open for async sendResponse
});
