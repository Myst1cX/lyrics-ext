// Global state
let popupWindowId = null;
let currentTrackInfo = null;
let currentPosition = null;
let spotifyTabId = null;

// Import provider logic and utilities
try {
  importScripts('providers.js');
} catch (e) {
  console.error("[Background] Failed to import providers.js:", e);
}

chrome.runtime.onInstalled.addListener(() => {
  console.log("[Background] Spotify Web Lyrics Plus installed");
  
  // Set up default storage
  chrome.storage.local.set({
    lyricsPlusAnticipationOffset: 1000,
    lyricsPlusFontSize: 22,
    lyricsPlusTranslationLang: 'en'
  });
});

// Handle popup window creation
async function createPopupWindow() {
  if (popupWindowId) {
    // Window already exists, focus it
    try {
      await chrome.windows.update(popupWindowId, { focused: true });
      return;
    } catch (e) {
      // Window doesn't exist anymore, create new one
      popupWindowId = null;
    }
  }
  
  try {
    // Create new popup window
    const window = await chrome.windows.create({
      url: 'lyrics-popup.html',
      type: 'popup',
      width: 400,
      height: 600,
      focused: true
    });
    
    popupWindowId = window.id;
    
    // Listen for window close
    chrome.windows.onRemoved.addListener((windowId) => {
      if (windowId === popupWindowId) {
        popupWindowId = null;
      }
    });
  } catch (e) {
    console.error("[Background] Failed to create popup window:", e);
  }
}

// Handle messages
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log("[Background] Message received:", message);
  
  switch (message.type) {
    case "OPEN_POPUP":
      createPopupWindow();
      sendResponse({success: true});
      break;
      
    case "CLOSE_POPUP":
      if (popupWindowId) {
        chrome.windows.remove(popupWindowId);
        popupWindowId = null;
      }
      sendResponse({success: true});
      break;
      
    case "TRACK_INFO_UPDATE":
      currentTrackInfo = message.trackInfo;
      currentPosition = message.position;
      spotifyTabId = sender.tab?.id;
      sendResponse({success: true});
      break;
      
    case "GET_TRACK_INFO":
      sendResponse({
        trackInfo: currentTrackInfo,
        position: currentPosition
      });
      break;
      
    case "GET_POSITION":
      if (spotifyTabId) {
        chrome.tabs.sendMessage(spotifyTabId, {type: "GET_POSITION"}, (response) => {
          sendResponse(response || {currentTime: 0, isPlaying: false});
        });
      } else {
        sendResponse({currentTime: 0, isPlaying: false});
      }
      break;
      
    case "SPOTIFY_COMMAND":
      if (spotifyTabId) {
        chrome.tabs.sendMessage(spotifyTabId, {
          type: "SPOTIFY_COMMAND",
          command: message.command
        }, (response) => {
          sendResponse(response || {success: false});
        });
      } else {
        sendResponse({success: false, error: "No Spotify tab found"});
      }
      break;
      
    case "FETCH_LYRICS":
      if (typeof fetchLyricsForTrack === 'function') {
        fetchLyricsForTrack(message.trackInfo, message.provider)
          .then(result => sendResponse(result))
          .catch(error => sendResponse({error: error.message}));
      } else {
        sendResponse({error: "Providers not loaded"});
      }
      break;
      
    case "SHOW_TOKEN_SETUP":
      if (message.provider === "Musixmatch") {
        showMusixmatchTokenSetup();
      } else if (message.provider === "Spotify") {
        showSpotifyTokenSetup();
      }
      sendResponse({success: true});
      break;
      
    case "RESET_WINDOW":
      if (popupWindowId) {
        chrome.windows.update(popupWindowId, {
          width: 400,
          height: 600,
          left: Math.round((screen.availWidth - 400) / 2),
          top: Math.round((screen.availHeight - 600) / 2)
        });
      }
      sendResponse({success: true});
      break;
      
    case "LYRICS_DATA_UPDATE":
      chrome.storage.local.set({
        lastLyricsData: message.data,
        lastUpdated: Date.now()
      });
      sendResponse({success: true});
      break;
      
    default:
      if (sender.tab) {
        chrome.tabs.sendMessage(sender.tab.id, message, (response) => {
          sendResponse(response);
        });
      } else {
        sendResponse({success: false, error: "Unknown message type"});
      }
      break;
  }
  
  return true; // Keep message channel open for async responses
});

// Handle extension icon click
chrome.action.onClicked.addListener((tab) => {
  createPopupWindow();
});

// Handle keyboard commands
chrome.commands.onCommand.addListener((command) => {
  if (command === "toggle-lyrics") {
    // Send message to content script to toggle popup
    chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
      if (tabs[0] && tabs[0].url.includes('open.spotify.com')) {
        chrome.tabs.sendMessage(tabs[0].id, {type: "TOGGLE_POPUP"});
      }
    });
  }
});

// Token setup functions
function showMusixmatchTokenSetup() {
  const url = chrome.runtime.getURL('token-setup.html') + '?provider=musixmatch';
  chrome.tabs.create({url: url});
}

function showSpotifyTokenSetup() {
  const url = chrome.runtime.getURL('token-setup.html') + '?provider=spotify';
  chrome.tabs.create({url: url});
}

// Find active Spotify tab
async function findSpotifyTab() {
  try {
    const tabs = await chrome.tabs.query({url: "https://open.spotify.com/*"});
    return tabs.length > 0 ? tabs[0] : null;
  } catch (e) {
    console.error("[Background] Failed to find Spotify tab:", e);
    return null;
  }
}

// Initialize
async function initialize() {
  console.log("[Background] Initializing...");
  
  // Try to find existing Spotify tab
  const spotifyTab = await findSpotifyTab();
  if (spotifyTab) {
    spotifyTabId = spotifyTab.id;
    console.log("[Background] Found Spotify tab:", spotifyTabId);
  }
}

// Initialize on startup
initialize();

console.log("[Background] Spotify Web Lyrics Plus background script loaded");
