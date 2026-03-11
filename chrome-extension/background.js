chrome.runtime.onInstalled.addListener(() => {
  // Open options page on first install so user can enter API keys
  chrome.runtime.openOptionsPage();
});
