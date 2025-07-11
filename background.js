chrome.runtime.onInstalled.addListener(() => {
  console.log("[Background] Spotify Web Lyrics Plus installed");
});
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log("[Background] Message received:", message);
  switch (message.type) {
    case "LYRICS_DATA_UPDATE":
      chrome.storage.local.set({
        lastLyricsData: message.data,
        lastUpdated: Date.now()
      });
      break;
    case "PROVIDER_CHANGE":
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]) {
          chrome.tabs.sendMessage(tabs[0].id, message);
        }
      });
      break;
    default:
      if (sender.tab) {
        chrome.tabs.sendMessage(sender.tab.id, message);
      }
      break;
  }
  return true;
});
chrome.action.onClicked.addListener((tab) => {
  chrome.tabs.sendMessage(tab.id, { type: "TOGGLE" });
});
console.log("[Background] Spotify Web Lyrics Plus background script loaded");
