const script = document.createElement("script");
script.src = chrome.runtime.getURL("page.js");
script.type = "module";
(document.head || document.documentElement).appendChild(script);
window.addEventListener("message", (event) => {
  var _a;
  if (event.source !== window) return;
  if ((_a = event.data) == null ? void 0 : _a.type) {
    chrome.runtime.sendMessage(event.data);
  }
});
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  window.postMessage(message, "*");
  return true;
});
console.log("[Content] Spotify Web Lyrics Plus content script loaded");
