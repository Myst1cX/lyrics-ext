class PopupManager {
  constructor() {
    this.lastData = null;
    this.initializeUI();
    this.loadStoredData();
    this.setupEventListeners();
  }
  initializeUI() {
    this.updateProviderTabs(["LRCLIB", "Spotify", "KPoe", "Musixmatch", "Genius"], null);
    this.updateStatus("Connecting to Spotify...");
  }
  loadStoredData() {
    chrome.storage.local.get(["lastLyricsData", "lastUpdated"], (result) => {
      if (result.lastLyricsData) {
        const data = result.lastLyricsData;
        const timeSinceUpdate = Date.now() - (result.lastUpdated || 0);
        if (timeSinceUpdate < 3e4) {
          this.updateUI(data);
        }
      }
    });
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, { type: "GET_SONGS" });
      }
    });
  }
  setupEventListeners() {
    var _a, _b, _c, _d;
    (_a = document.getElementById("provider-tabs")) == null ? void 0 : _a.addEventListener("click", (e) => {
      var _a2;
      const button = e.target;
      if (button.classList.contains("provider-tab")) {
        const provider = (_a2 = button.textContent) == null ? void 0 : _a2.trim();
        if (provider) {
          this.selectProvider(provider);
        }
      }
    });
    (_b = document.getElementById("spotify-token-btn")) == null ? void 0 : _b.addEventListener("click", () => {
      this.showTokenDialog("Spotify");
    });
    (_c = document.getElementById("musixmatch-token-btn")) == null ? void 0 : _c.addEventListener("click", () => {
      this.showTokenDialog("Musixmatch");
    });
    (_d = document.getElementById("options-btn")) == null ? void 0 : _d.addEventListener("click", () => {
      chrome.runtime.openOptionsPage();
    });
  }
  updateUI(data) {
    this.lastData = data;
    if (data.trackInfo) {
      const titleEl = document.getElementById("track-title");
      const artistEl = document.getElementById("track-artist");
      if (titleEl) titleEl.textContent = data.trackInfo.title;
      if (artistEl) artistEl.textContent = data.trackInfo.artist;
    }
    this.updateProviderTabs(data.providers, data.currentProvider);
    if (data.error) {
      this.updateStatus(data.error, true);
    } else if (data.currentProvider) {
      this.updateStatus(`Using ${data.currentProvider}`);
    } else {
      this.updateStatus("No lyrics found");
    }
  }
  updateProviderTabs(providers, currentProvider) {
    const container = document.getElementById("provider-tabs");
    if (!container) return;
    container.innerHTML = "";
    providers.forEach((provider) => {
      const button = document.createElement("button");
      button.className = "provider-tab";
      button.textContent = provider;
      if (provider === currentProvider) {
        button.classList.add("active");
      }
      container.appendChild(button);
    });
  }
  updateStatus(message, isError = false) {
    const statusEl = document.getElementById("status");
    if (!statusEl) return;
    statusEl.textContent = message;
    statusEl.className = isError ? "status error" : "status";
  }
  selectProvider(provider) {
    var _a;
    this.updateProviderTabs(
      ((_a = this.lastData) == null ? void 0 : _a.providers) || [],
      provider
    );
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, {
          type: "PROVIDER_CHANGE",
          provider
        });
      }
    });
    this.updateStatus(`Switching to ${provider}...`);
  }
  showTokenDialog(provider) {
    const storageKey = provider === "Spotify" ? "spotifyUserToken" : "musixmatchUserToken";
    const current = localStorage.getItem(storageKey) || "";
    const token = prompt(`Enter your ${provider} token:`, current);
    if (token !== null) {
      localStorage.setItem(storageKey, token);
      this.updateStatus(`${provider} token saved`);
    }
  }
}
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "LYRICS_DATA_UPDATE") {
    popupManager.updateUI(message.data);
  }
  return true;
});
const popupManager = new PopupManager();
console.log("[Popup] Spotify Web Lyrics Plus popup loaded");
