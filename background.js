// Global state
let popupWindowId = null;
let currentTrackInfo = null;
let currentPosition = null;
let spotifyTabId = null;

// Import provider logic and utilities
importScripts('providers.js');

chrome.runtime.onInstalled.addListener(() => {
  console.log("[Background] Spotify Web Lyrics Plus installed");
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
          sendResponse(response);
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
        });
      }
      sendResponse({success: true});
      break;
      
    case "FETCH_LYRICS":
      fetchLyricsForTrack(message.trackInfo, message.provider)
        .then(result => sendResponse(result))
        .catch(error => sendResponse({error: error.message}));
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
        chrome.tabs.sendMessage(sender.tab.id, message);
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
    createPopupWindow();
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

console.log("[Background] Spotify Web Lyrics Plus background script loaded");
