// Content script for Spotify Web Player
let currentTrackId = null;
let pollingInterval = null;

// Initialize the content script
function init() {
  console.log("[Content] Spotify Web Lyrics Plus content script loaded");
  
  // Start polling for track changes
  startTrackPolling();
}

// Get current track ID
function getCurrentTrackId() {
  const contextLink = document.querySelector('a[data-testid="context-link"][data-context-item-type="track"][href*="uri=spotify%3Atrack%3A"]');
  if (contextLink) {
    const href = contextLink.getAttribute('href');
    if (href) {
      const match = decodeURIComponent(href).match(/spotify:track:([a-zA-Z0-9]{22})/);
      if (match) return match[1];
    }
  }
  return null;
}

// Get current track information
function getCurrentTrackInfo() {
  const titleEl = document.querySelector('[data-testid="context-item-info-title"]');
  const artistEl = document.querySelector('[data-testid="context-item-info-subtitles"]');
  const durationEl = document.querySelector('[data-testid="playback-duration"]');
  const trackId = getCurrentTrackId();
  
  if (!titleEl || !artistEl) return null;
  
  const title = titleEl.textContent?.trim() || "";
  const artist = artistEl.textContent?.trim() || "";
  const duration = durationEl ? timeStringToMs(durationEl.textContent || "") : 0;
  
  return {
    id: `${title}-${artist}`,
    title,
    artist,
    album: "",
    duration,
    uri: "",
    trackId
  };
}

// Convert time string to milliseconds
function timeStringToMs(str) {
  const parts = str.split(":").map((p) => parseInt(p, 10));
  if (parts.length === 2) return (parts[0] * 60 + parts[1]) * 1000;
  if (parts.length === 3) return (parts[0] * 3600 + parts[1] * 60 + parts[2]) * 1000;
  return 0;
}

// Get current playback position and state
function getCurrentPosition() {
  const positionEl = document.querySelector('[data-testid="playback-position"]');
  const durationEl = document.querySelector('[data-testid="playback-duration"]');
  
  const currentTime = positionEl ? timeStringToMs(positionEl.textContent || "0:00") / 1000 : 0;
  const duration = durationEl ? timeStringToMs(durationEl.textContent || "0:00") / 1000 : 0;
  
  // Check if Spotify is playing
  const isPlaying = isSpotifyPlaying();
  
  return {
    currentTime,
    duration,
    isPlaying
  };
}

// Check if Spotify is currently playing
function isSpotifyPlaying() {
  const playPauseBtn = document.querySelector('[data-testid="control-button-playpause"]');
  
  if (playPauseBtn) {
    const label = (playPauseBtn.getAttribute('aria-label') || '').toLowerCase();
    
    // If label contains "pause", music is playing
    if (label.includes('pause')) return true;
    // If label contains "play", music is paused
    if (label.includes('play')) return false;
  }
  
  // Fallback: check audio element
  const audio = document.querySelector('audio');
  if (audio) return !audio.paused;
  
  return false;
}

// Send Spotify playback commands
function sendSpotifyCommand(command) {
  const selectors = {
    playpause: [
      '[data-testid="control-button-playpause"]',
      '[aria-label*="Play"]',
      '[aria-label*="Pause"]'
    ],
    next: [
      '[data-testid="control-button-skip-forward"]',
      '[aria-label*="Next"]'
    ],
    previous: [
      '[data-testid="control-button-skip-back"]',
      '[aria-label*="Previous"]'
    ]
  };
  
  let btn = null;
  for (const sel of selectors[command] || []) {
    btn = document.querySelector(sel);
    if (btn && btn.offsetParent !== null) break;
  }
  
  if (btn) {
    btn.click();
  } else {
    console.warn(`[Content] Could not find button for command: ${command}`);
  }
}

// Start polling for track changes
function startTrackPolling() {
  if (pollingInterval) clearInterval(pollingInterval);
  
  pollingInterval = setInterval(() => {
    const trackInfo = getCurrentTrackInfo();
    const position = getCurrentPosition();
    
    if (trackInfo && trackInfo.id !== currentTrackId) {
      currentTrackId = trackInfo.id;
      
      // Send track info to background script
      chrome.runtime.sendMessage({
        type: "TRACK_INFO_UPDATE",
        trackInfo: trackInfo,
        position: position
      });
    }
  }, 1000);
}

// Stop polling
function stopTrackPolling() {
  if (pollingInterval) {
    clearInterval(pollingInterval);
    pollingInterval = null;
  }
}

// Handle messages from background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {
    case "GET_TRACK_INFO":
      const trackInfo = getCurrentTrackInfo();
      const position = getCurrentPosition();
      sendResponse({
        trackInfo: trackInfo,
        position: position
      });
      break;
      
    case "GET_POSITION":
      const currentPosition = getCurrentPosition();
      sendResponse(currentPosition);
      break;
      
    case "SPOTIFY_COMMAND":
      sendSpotifyCommand(message.command);
      sendResponse({success: true});
      break;
      
    default:
      sendResponse({success: false});
      break;
  }
  
  return true;
});

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
