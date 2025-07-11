// Content script for Spotify Web Player
let currentTrackId = null;
let pollingInterval = null;
let highlightTimer = null;
let currentSyncedLyrics = null;
let currentUnsyncedLyrics = null;
let currentLyricsContainer = null;
let lastTranslatedLang = null;
let translationPresent = false;
let isTranslating = false;
let isShowingSyncedLyrics = false;
let providerClickTimer = null;

// Initialize the content script
function init() {
  console.log("[Content] Spotify Web Lyrics Plus content script loaded");
  
  // Inject the popup styles and functionality
  injectPopupStyles();
  
  // Set up keyboard shortcut listener
  setupKeyboardShortcuts();
  
  // Add the Lyrics+ button to Spotify controls
  addLyricsButton();
  
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
      
    case "TOGGLE_POPUP":
      toggleLyricsPopup();
      sendResponse({success: true});
      break;
      
    default:
      sendResponse({success: false});
      break;
  }
  
  return true;
});

// Create the embedded lyrics popup
function createPopup() {
  removePopup();
  
  // Load saved state from localStorage
  const savedState = localStorage.getItem('lyricsPlusPopupState');
  let pos = null;
  if (savedState) {
    try {
      pos = JSON.parse(savedState);
    } catch {
      pos = null;
    }
  }
  
  const popup = document.createElement("div");
  popup.id = "lyrics-plus-popup";
  
  if (pos) {
    popup.style.left = `${pos.left}px`;
    popup.style.top = `${pos.top}px`;
    popup.style.width = `${pos.width}px`;
    popup.style.height = `${pos.height}px`;
    popup.style.right = "auto";
    popup.style.bottom = "auto";
  }
  
  // Create popup content
  popup.innerHTML = `
    <div class="header-wrapper">
      <div class="header">
        <h3>Lyrics+</h3>
        <div class="button-group">
          <div class="download-button" id="downloadBtn" title="Download lyrics">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 5v9"></path>
              <polyline points="8 13 12 17 16 13"></polyline>
              <rect x="4" y="19" width="16" height="2" rx="1"></rect>
            </svg>
            <div class="download-dropdown" id="downloadDropdown">
              <button id="downloadSynced">Synced</button>
              <button id="downloadUnsynced">Unsynced</button>
            </div>
          </div>
          <select class="font-size-select" id="fontSizeSelect" title="Change lyrics font size">
            <option value="16">16px</option>
            <option value="22" selected>22px</option>
            <option value="28">28px</option>
            <option value="32">32px</option>
            <option value="38">38px</option>
            <option value="44">44px</option>
          </select>
          <button class="header-buttons" id="translationToggle" title="Show/hide translation controls">🌐</button>
          <button class="header-buttons" id="playbackToggle" title="Show/hide playback controls">🎛️</button>
          <button class="header-buttons" id="offsetToggle" title="Show/hide timing offset">⚙️</button>
          <button class="close-btn" id="closeBtn" title="Close Lyrics+">×</button>
        </div>
      </div>
      <div class="tabs-container" id="providerTabs">
        <!-- Provider tabs will be populated -->
      </div>
    </div>
    
    <div class="controls-wrapper hidden" id="translationWrapper">
      <div class="translation-controls">
        <select id="languageSelect">
          <!-- Language options will be populated -->
        </select>
        <button id="translateBtn">Translate</button>
        <button id="removeTranslationBtn">Original</button>
      </div>
    </div>
    
    <div class="controls-wrapper visible" id="offsetWrapper">
      <div class="offset-controls">
        <div>
          Adjust lyrics timing (ms):<br>
          <span style="font-size: 11px; color: #aaa;">lower = appear later, higher = appear earlier</span>
        </div>
        <div class="offset-input-container">
          <input type="number" class="offset-input" id="offsetInput" min="-5000" max="5000" step="50" value="1000">
          <div class="offset-spinner">
            <button type="button" id="offsetUp">
              <svg viewBox="0 0 24 20" width="20" height="12" fill="rgba(255, 255, 255, 0.85)">
                <path d="M12 4L2 16H22L12 4Z" />
              </svg>
            </button>
            <button type="button" id="offsetDown">
              <svg viewBox="0 0 24 20" width="20" height="12" fill="rgba(255, 255, 255, 0.85)">
                <path d="M12 16L2 4H22L12 16Z" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
    
    <div class="lyrics-container" id="lyricsContainer">
      <p>Loading lyrics...</p>
    </div>
    
    <div class="playback-controls visible" id="playbackControls">
      <button class="control-button secondary" id="resetBtn" title="Restore Default Position and Size">↻</button>
      <button class="control-button" id="prevBtn" title="Previous Track">⏮</button>
      <button class="control-button" id="playPauseBtn" title="Play/Pause">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="white">
          <path d="M8 5v14l11-7z"/>
        </svg>
      </button>
      <button class="control-button" id="nextBtn" title="Next Track">⏭</button>
    </div>
    
    <div class="resizer" id="resizer"></div>
  `;
  
  document.body.appendChild(popup);
  
  // Set up event listeners for the popup
  setupPopupEventListeners(popup);
  
  // Make popup draggable and resizable
  makeDraggable(popup);
  makeResizable(popup);
  
  // Initialize popup content
  initializePopupContent(popup);
  
  // Start polling for track changes
  startTrackPolling();
  
  return popup;
}

// Remove the popup
function removePopup() {
  if (highlightTimer) {
    clearInterval(highlightTimer);
    highlightTimer = null;
  }
  
  if (pollingInterval) {
    clearInterval(pollingInterval);
    pollingInterval = null;
  }
  
  const existing = document.getElementById("lyrics-plus-popup");
  if (existing) {
    existing.remove();
  }
  
  // Reset global state
  currentSyncedLyrics = null;
  currentUnsyncedLyrics = null;
  currentLyricsContainer = null;
  lastTranslatedLang = null;
  translationPresent = false;
  isTranslating = false;
  isShowingSyncedLyrics = false;
}

// Translation languages
const TRANSLATION_LANGUAGES = {
  en: 'English', es: 'Spanish', fr: 'French', de: 'German', it: 'Italian',
  pt: 'Portuguese', ru: 'Russian', ja: 'Japanese', ko: 'Korean', zh: 'Chinese',
  ar: 'Arabic', hi: 'Hindi', tr: 'Turkish', af: 'Afrikaans', sq: 'Albanian',
  am: 'Amharic', hy: 'Armenian', az: 'Azerbaijani', eu: 'Basque', be: 'Belarusian',
  bn: 'Bengali', bs: 'Bosnian', bg: 'Bulgarian', ca: 'Catalan', ceb: 'Cebuano',
  co: 'Corsican', hr: 'Croatian', cs: 'Czech', da: 'Danish', nl: 'Dutch',
  eo: 'Esperanto', et: 'Estonian', fi: 'Finnish', fy: 'Frisian', gl: 'Galician',
  ka: 'Georgian', el: 'Greek', gu: 'Gujarati', ht: 'Haitian Creole', ha: 'Hausa',
  haw: 'Hawaiian', he: 'Hebrew', hmn: 'Hmong', hu: 'Hungarian', is: 'Icelandic',
  ig: 'Igbo', id: 'Indonesian', ga: 'Irish', jv: 'Javanese', kn: 'Kannada',
  kk: 'Kazakh', km: 'Khmer', rw: 'Kinyarwanda', ku: 'Kurdish', ky: 'Kyrgyz',
  lo: 'Lao', la: 'Latin', lv: 'Latvian', lt: 'Lithuanian', lb: 'Luxembourgish',
  mk: 'Macedonian', mg: 'Malagasy', ms: 'Malay', ml: 'Malayalam', mt: 'Maltese',
  mi: 'Maori', mr: 'Marathi', mn: 'Mongolian', my: 'Myanmar (Burmese)',
  ne: 'Nepali', no: 'Norwegian', ny: 'Nyanja (Chichewa)', or: 'Odia (Oriya)',
  ps: 'Pashto', fa: 'Persian', pl: 'Polish', pa: 'Punjabi', ro: 'Romanian',
  sm: 'Samoan', gd: 'Scots Gaelic', sr: 'Serbian', st: 'Sesotho', sn: 'Shona',
  sd: 'Sindhi', si: 'Sinhala', sk: 'Slovak', sl: 'Slovenian', so: 'Somali',
  su: 'Sundanese', sw: 'Swahili', sv: 'Swedish', tl: 'Tagalog (Filipino)',
  tg: 'Tajik', ta: 'Tamil', tt: 'Tatar', te: 'Telugu', th: 'Thai', tk: 'Turkmen',
  uk: 'Ukrainian', ur: 'Urdu', ug: 'Uyghur', uz: 'Uzbek', vi: 'Vietnamese',
  cy: 'Welsh', xh: 'Xhosa', yi: 'Yiddish', yo: 'Yoruba', zu: 'Zulu'
};

// Provider configuration
const Providers = {
  list: ["LRCLIB", "Spotify", "KPoe", "Musixmatch", "Genius"],
  current: "LRCLIB",
  map: {
    "LRCLIB": "LRCLIB",
    "Spotify": "Spotify", 
    "KPoe": "KPoe",
    "Musixmatch": "Musixmatch",
    "Genius": "Genius"
  },
  getCurrent() { return this.current; },
  setCurrent(name) { 
    if (this.list.includes(name)) {
      this.current = name;
    }
  }
};

// Utility functions
function getSavedTranslationLang() {
  return localStorage.getItem('lyricsPlusTranslationLang') || 'en';
}

function saveTranslationLang(lang) {
  localStorage.setItem('lyricsPlusTranslationLang', lang);
}

function getAnticipationOffset() {
  return Number(localStorage.getItem("lyricsPlusAnticipationOffset") || 1000);
}

function setAnticipationOffset(val) {
  localStorage.setItem("lyricsPlusAnticipationOffset", val);
}

function makeSafeFilename(str) {
  return str.replace(/[\/\\:\*\?"<>\|]/g, '').replace(/\s+/g, ' ').trim();
}

// Translation functions
async function translateText(text, targetLang) {
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${targetLang}&dt=t&q=${encodeURIComponent(text)}`;
  try {
    const response = await fetch(url);
    const data = await response.json();
    return data[0][0][0];
  } catch (error) {
    console.error('Translation failed:', error);
    return '[Translation Error]';
  }
}

// Download functions
function downloadSyncedLyrics(syncedLyrics, trackInfo, providerName) {
  if (!syncedLyrics || !syncedLyrics.length) return;
  
  let lines = syncedLyrics.map(line => {
    let ms = Number(line.time) || 0;
    let min = String(Math.floor(ms / 60000)).padStart(2, '0');
    let sec = String(Math.floor((ms % 60000) / 1000)).padStart(2, '0');
    let hundredths = String(Math.floor((ms % 1000) / 10)).padStart(2, '0');
    return `[${min}:${sec}.${hundredths}] ${line.text}`;
  }).join('\n');
  
  let title = makeSafeFilename(trackInfo?.title || "lyrics");
  let artist = makeSafeFilename(trackInfo?.artist || "unknown");
  let filename = `${artist} - ${title}.lrc`;
  
  let blob = new Blob([lines], { type: "application/octet-stream" });
  let a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

function downloadUnsyncedLyrics(unsyncedLyrics, trackInfo, providerName) {
  if (!unsyncedLyrics || !unsyncedLyrics.length) return;
  
  let lines = unsyncedLyrics.map(line => line.text).join('\n');
  let title = makeSafeFilename(trackInfo?.title || "lyrics");
  let artist = makeSafeFilename(trackInfo?.artist || "unknown");
  let filename = `${artist} - ${title}.txt`;
  
  let blob = new Blob([lines], { type: "text/plain" });
  let a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

// Set up event listeners for the popup
function setupPopupEventListeners(popup) {
  // Close button
  popup.querySelector('#closeBtn').onclick = () => {
    savePopupState(popup);
    removePopup();
  };
  
  // Control toggles
  popup.querySelector('#translationToggle').onclick = () => {
    const wrapper = popup.querySelector('#translationWrapper');
    const isHidden = wrapper.classList.contains('hidden');
    
    if (isHidden) {
      wrapper.classList.remove('hidden');
      wrapper.classList.add('visible');
    } else {
      wrapper.classList.remove('visible');
      wrapper.classList.add('hidden');
    }
    
    localStorage.setItem('lyricsPlusTranslatorVisible', JSON.stringify(isHidden));
  };
  
  popup.querySelector('#offsetToggle').onclick = () => {
    const wrapper = popup.querySelector('#offsetWrapper');
    const isHidden = wrapper.classList.contains('hidden');
    
    if (isHidden) {
      wrapper.classList.remove('hidden');
      wrapper.classList.add('visible');
    } else {
      wrapper.classList.remove('visible');
      wrapper.classList.add('hidden');
    }
    
    localStorage.setItem('lyricsPlusOffsetVisible', JSON.stringify(isHidden));
  };
  
  popup.querySelector('#playbackToggle').onclick = () => {
    const wrapper = popup.querySelector('#playbackControls');
    const isHidden = wrapper.classList.contains('hidden');
    
    if (isHidden) {
      wrapper.classList.remove('hidden');
      wrapper.classList.add('visible');
    } else {
      wrapper.classList.remove('visible');
      wrapper.classList.add('hidden');
    }
    
    localStorage.setItem('lyricsPlusControlsVisible', JSON.stringify(isHidden));
  };
  
  // Translation controls
  popup.querySelector('#languageSelect').onchange = (e) => {
    saveTranslationLang(e.target.value);
    removeTranslatedLyrics();
    lastTranslatedLang = null;
  };
  
  popup.querySelector('#translateBtn').onclick = () => translateLyricsInPopup(popup);
  popup.querySelector('#removeTranslationBtn').onclick = () => {
    removeTranslatedLyrics();
    lastTranslatedLang = null;
  };
  
  // Offset controls
  const offsetInput = popup.querySelector('#offsetInput');
  const saveAndApplyOffset = () => {
    let val = parseInt(offsetInput.value, 10) || 0;
    if (val > 5000) val = 5000;
    if (val < -5000) val = -5000;
    offsetInput.value = val;
    setAnticipationOffset(val);
    
    if (currentSyncedLyrics && currentLyricsContainer) {
      highlightSyncedLyrics(currentSyncedLyrics, currentLyricsContainer);
    }
  };
  
  popup.querySelector('#offsetUp').onclick = () => {
    let val = parseInt(offsetInput.value, 10) || 0;
    val += 50;
    if (val > 5000) val = 5000;
    offsetInput.value = val;
    saveAndApplyOffset();
  };
  
  popup.querySelector('#offsetDown').onclick = () => {
    let val = parseInt(offsetInput.value, 10) || 0;
    val -= 50;
    if (val < -5000) val = -5000;
    offsetInput.value = val;
    saveAndApplyOffset();
  };
  
  offsetInput.onchange = saveAndApplyOffset;
  offsetInput.onkeydown = (e) => {
    if (e.key === "Enter") {
      saveAndApplyOffset();
      offsetInput.blur();
    }
  };
  
  // Font size
  popup.querySelector('#fontSizeSelect').onchange = (e) => {
    const size = e.target.value;
    localStorage.setItem("lyricsPlusFontSize", size);
    popup.querySelector('.lyrics-container').style.fontSize = size + "px";
  };
  
  // Download controls
  const downloadBtn = popup.querySelector('#downloadBtn');
  const downloadDropdown = popup.querySelector('#downloadDropdown');
  
  downloadBtn.onclick = () => {
    const hasSynced = !!currentSyncedLyrics;
    const hasUnsynced = !!currentUnsyncedLyrics;
    
    popup.querySelector('#downloadSynced').style.display = hasSynced ? '' : 'none';
    popup.querySelector('#downloadUnsynced').style.display = hasUnsynced ? '' : 'none';
    
    if (hasSynced || hasUnsynced) {
      downloadDropdown.style.display = 'flex';
      setTimeout(() => {
        const hide = (ev) => {
          if (!downloadDropdown.contains(ev.target) && ev.target !== downloadBtn) {
            downloadDropdown.style.display = 'none';
            document.removeEventListener('mousedown', hide);
          }
        };
        document.addEventListener('mousedown', hide);
      }, 1);
    }
  };
  
  popup.querySelector('#downloadSynced').onclick = () => {
    downloadDropdown.style.display = 'none';
    if (currentSyncedLyrics) {
      const trackInfo = getCurrentTrackInfo();
      downloadSyncedLyrics(currentSyncedLyrics, trackInfo, Providers.current);
    }
  };
  
  popup.querySelector('#downloadUnsynced').onclick = () => {
    downloadDropdown.style.display = 'none';
    if (currentUnsyncedLyrics) {
      const trackInfo = getCurrentTrackInfo();
      downloadUnsyncedLyrics(currentUnsyncedLyrics, trackInfo, Providers.current);
    }
  };
  
  // Playback controls
  popup.querySelector('#resetBtn').onclick = () => {
    // Reset window size and position
    const isMobile = window.innerWidth <= 600;
    if (isMobile) {
      Object.assign(popup.style, {
        position: "fixed",
        left: "3vw",
        right: "1vw",
        top: "auto",
        bottom: "146px",
        width: "200vw",
        height: "90vh",
        zIndex: 100000
      });
    } else {
      Object.assign(popup.style, {
        position: "fixed",
        bottom: "87px",
        right: "0px",
        left: "auto",
        top: "auto",
        width: "370px",
        height: "79.5vh",
        zIndex: 100000
      });
    }
    savePopupState(popup);
  };
  
  popup.querySelector('#prevBtn').onclick = () => sendSpotifyCommand('previous');
  popup.querySelector('#nextBtn').onclick = () => sendSpotifyCommand('next');
  
  const playPauseBtn = popup.querySelector('#playPauseBtn');
  playPauseBtn.onclick = () => {
    sendSpotifyCommand('playpause');
    setTimeout(() => updatePlayPauseIcon(playPauseBtn), 100);
  };
  
  // Update play/pause icon periodically
  setInterval(() => updatePlayPauseIcon(playPauseBtn), 1000);
}

// Initialize popup content
function initializePopupContent(popup) {
  // Populate language selector
  const languageSelect = popup.querySelector('#languageSelect');
  for (const [code, name] of Object.entries(TRANSLATION_LANGUAGES)) {
    const option = document.createElement('option');
    option.value = code;
    option.textContent = name;
    languageSelect.appendChild(option);
  }
  languageSelect.value = getSavedTranslationLang();
  
  // Populate provider tabs
  const providerTabs = popup.querySelector('#providerTabs');
  Providers.list.forEach(name => {
    const button = document.createElement('button');
    button.textContent = name;
    button.className = 'provider-tab';
    if (name === Providers.current) {
      button.classList.add('active');
    }
    
    button.onclick = async (e) => {
      if (providerClickTimer) return;
      
      providerClickTimer = setTimeout(async () => {
        Providers.setCurrent(name);
        updateTabs(providerTabs);
        
        // Get current track info and update lyrics
        const trackInfo = getCurrentTrackInfo();
        if (trackInfo) {
          await updateLyricsContent(popup, trackInfo, name);
        }
        
        providerClickTimer = null;
      }, 250);
    };
    
    button.ondblclick = (e) => {
      e.preventDefault();
      if (providerClickTimer) {
        clearTimeout(providerClickTimer);
        providerClickTimer = null;
      }
      
      // Show token setup for Musixmatch and Spotify
      if (name === "Musixmatch") {
        showMusixmatchTokenModal();
      } else if (name === "Spotify") {
        showSpotifyTokenModal();
      }
    };
    
    providerTabs.appendChild(button);
  });
  
  // Load saved preferences
  loadPreferences(popup);
  
  // Get current track and load lyrics
  const trackInfo = getCurrentTrackInfo();
  if (trackInfo) {
    currentTrackId = trackInfo.id;
    autodetectProviderAndLoad(popup, trackInfo);
  }
}

// Load saved preferences
function loadPreferences(popup) {
  // Load saved font size
  const savedFontSize = localStorage.getItem("lyricsPlusFontSize") || "22";
  popup.querySelector('#fontSizeSelect').value = savedFontSize;
  popup.querySelector('.lyrics-container').style.fontSize = savedFontSize + "px";
  
  // Load saved offset
  const savedOffset = getAnticipationOffset();
  popup.querySelector('#offsetInput').value = savedOffset;
  
  // Load saved visibility states
  const translatorVisible = JSON.parse(localStorage.getItem('lyricsPlusTranslatorVisible') || 'false');
  const offsetVisible = JSON.parse(localStorage.getItem('lyricsPlusOffsetVisible') || 'true');
  const controlsVisible = JSON.parse(localStorage.getItem('lyricsPlusControlsVisible') || 'true');
  
  if (translatorVisible) {
    popup.querySelector('#translationWrapper').classList.add('visible');
    popup.querySelector('#translationWrapper').classList.remove('hidden');
  }
  
  if (!offsetVisible) {
    popup.querySelector('#offsetWrapper').classList.add('hidden');
    popup.querySelector('#offsetWrapper').classList.remove('visible');
  }
  
  if (!controlsVisible) {
    popup.querySelector('#playbackControls').classList.add('hidden');
    popup.querySelector('#playbackControls').classList.remove('visible');
  }
}

// Save popup state
function savePopupState(popup) {
  const rect = popup.getBoundingClientRect();
  localStorage.setItem('lyricsPlusPopupState', JSON.stringify({
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height
  }));
}

// Make popup draggable
function makeDraggable(popup) {
  const handle = popup.querySelector('.header-wrapper');
  let isDragging = false;
  let startX, startY;
  let origX, origY;
  
  handle.addEventListener("mousedown", (e) => {
    isDragging = true;
    startX = e.clientX;
    startY = e.clientY;
    const rect = popup.getBoundingClientRect();
    origX = rect.left;
    origY = rect.top;
    document.body.style.userSelect = "none";
  });
  
  window.addEventListener("mousemove", (e) => {
    if (!isDragging) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    let newX = origX + dx;
    let newY = origY + dy;
    const maxX = window.innerWidth - popup.offsetWidth;
    const maxY = window.innerHeight - popup.offsetHeight;
    newX = Math.min(Math.max(0, newX), maxX);
    newY = Math.min(Math.max(0, newY), maxY);
    popup.style.left = `${newX}px`;
    popup.style.top = `${newY}px`;
    popup.style.right = "auto";
    popup.style.bottom = "auto";
    popup.style.position = "fixed";
  });
  
  window.addEventListener("mouseup", () => {
    if (isDragging) {
      isDragging = false;
      document.body.style.userSelect = "";
      savePopupState(popup);
    }
  });
}

// Make popup resizable
function makeResizable(popup) {
  const resizer = popup.querySelector('.resizer');
  let isResizing = false;
  let startX, startY;
  let startWidth, startHeight;
  
  resizer.addEventListener("mousedown", (e) => {
    e.preventDefault();
    isResizing = true;
    window.lyricsPlusPopupIsResizing = true;
    startX = e.clientX;
    startY = e.clientY;
    startWidth = popup.offsetWidth;
    startHeight = popup.offsetHeight;
    document.body.style.userSelect = "none";
  });
  
  window.addEventListener("mousemove", (e) => {
    if (!isResizing) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    let newWidth = startWidth + dx;
    let newHeight = startHeight + dy;
    newWidth = Math.max(newWidth, 200);
    newHeight = Math.max(newHeight, 100);
    newWidth = Math.min(newWidth, window.innerWidth - popup.getBoundingClientRect().left);
    newHeight = Math.min(newHeight, window.innerHeight - popup.getBoundingClientRect().top);
    popup.style.width = newWidth + "px";
    popup.style.height = newHeight + "px";
  });
  
  window.addEventListener("mouseup", () => {
    if (isResizing) {
      isResizing = false;
      document.body.style.userSelect = "";
      savePopupState(popup);
      window.lyricsPlusPopupIsResizing = false;
    }
  });
}

// Update tabs display
function updateTabs(tabsContainer, noneSelected) {
  [...tabsContainer.children].forEach(btn => {
    if (noneSelected || !Providers.current) {
      btn.classList.remove('active');
    } else {
      if (btn.textContent === Providers.current) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    }
  });
}

// Update play/pause icon
function updatePlayPauseIcon(button) {
  const isPlaying = isSpotifyPlaying();
  const playSVG = `<svg viewBox="0 0 24 24" width="20" height="20" fill="white"><path d="M8 5v14l11-7z"/></svg>`;
  const pauseSVG = `<svg viewBox="0 0 24 24" width="20" height="20" fill="white"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>`;
  
  button.innerHTML = isPlaying ? pauseSVG : playSVG;
}

// Lyrics highlighting
function highlightSyncedLyrics(lyrics, container) {
  if (!lyrics || lyrics.length === 0) return;
  
  const pElements = [...container.querySelectorAll("p")];
  if (pElements.length === 0) return;
  
  if (highlightTimer) {
    clearInterval(highlightTimer);
    highlightTimer = null;
  }
  
  highlightTimer = setInterval(() => {
    // Skip all style/size changes while popup is being resized
    if (window.lyricsPlusPopupIsResizing) return;
    
    const posEl = document.querySelector('[data-testid="playback-position"]');
    const isPlaying = isSpotifyPlaying();
    
    if (isShowingSyncedLyrics) {
      if (isPlaying) {
        container.style.overflowY = "auto";
        container.style.pointerEvents = "none";
        container.style.scrollbarWidth = "none";
        container.style.msOverflowStyle = "none";
        container.classList.add('hide-scrollbar');
      } else {
        container.style.overflowY = "auto";
        container.style.pointerEvents = "";
        container.classList.remove('hide-scrollbar');
        container.style.scrollbarWidth = "";
        container.style.msOverflowStyle = "";
      }
    } else {
      container.style.overflowY = "auto";
      container.style.pointerEvents = "";
      container.classList.remove('hide-scrollbar');
      container.style.scrollbarWidth = "";
      container.style.msOverflowStyle = "";
    }
    
    if (!posEl) return;
    
    const curPosMs = timeStringToMs(posEl.textContent);
    const anticipatedMs = curPosMs + getAnticipationOffset();
    
    let activeIndex = -1;
    for (let i = 0; i < lyrics.length; i++) {
      if (anticipatedMs >= (lyrics[i].time ?? lyrics[i].startTime)) {
        activeIndex = i;
      } else {
        break;
      }
    }
    
    if (activeIndex === -1) {
      pElements.forEach(p => {
        p.classList.remove('active');
      });
      return;
    }
    
    pElements.forEach((p, idx) => {
      if (idx === activeIndex) {
        p.classList.add('active');
      } else {
        p.classList.remove('active');
      }
    });
    
    // Always auto-center while playing
    const activeP = pElements[activeIndex];
    if (activeP && isPlaying) {
      activeP.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, 50);
}

// Fetch lyrics from background script
async function fetchLyrics(trackInfo, providerName) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({
      type: "FETCH_LYRICS",
      trackInfo: trackInfo,
      provider: providerName
    }, (response) => {
      if (chrome.runtime.lastError) {
        console.error("[Content] Runtime error:", chrome.runtime.lastError);
        resolve({error: "Failed to communicate with background script"});
      } else {
        resolve(response || {error: "No response from background script"});
      }
    });
  });
}

// Auto-detect provider and load lyrics
async function autodetectProviderAndLoad(popup, trackInfo) {
  const detectionOrder = [
    { name: "LRCLIB", type: "getSynced" },
    { name: "Spotify", type: "getSynced" },
    { name: "KPoe", type: "getSynced" },
    { name: "Musixmatch", type: "getSynced" },
    { name: "LRCLIB", type: "getUnsynced" },
    { name: "Spotify", type: "getUnsynced" },
    { name: "KPoe", type: "getUnsynced" },
    { name: "Musixmatch", type: "getUnsynced" },
    { name: "Genius", type: "getUnsynced" }
  ];
  
  for (const { name, type } of detectionOrder) {
    const result = await fetchLyrics(trackInfo, name);
    if (result && !result.error) {
      let lyrics = result[type === "getSynced" ? "synced" : "unsynced"];
      if (lyrics && lyrics.length > 0) {
        Providers.setCurrent(name);
        updateTabs(popup.querySelector('#providerTabs'));
        await updateLyricsContent(popup, trackInfo, name, result);
        return;
      }
    }
  }
  
  // No lyrics found
  Providers.current = null;
  updateTabs(popup.querySelector('#providerTabs'), true);
  const lyricsContainer = popup.querySelector('.lyrics-container');
  lyricsContainer.textContent = "No lyrics were found for this track from any of the available providers";
  currentSyncedLyrics = null;
  currentUnsyncedLyrics = null;
}

// Update lyrics content
async function updateLyricsContent(popup, trackInfo, providerName, result) {
  const lyricsContainer = popup.querySelector('.lyrics-container');
  if (!lyricsContainer) return;
  
  currentLyricsContainer = lyricsContainer;
  currentSyncedLyrics = null;
  currentUnsyncedLyrics = null;
  
  if (!result) {
    result = await fetchLyrics(trackInfo, providerName);
  }
  
  if (result.error) {
    lyricsContainer.textContent = result.error;
    return;
  }
  
  const synced = result.synced;
  const unsynced = result.unsynced;
  
  lyricsContainer.innerHTML = "";
  currentSyncedLyrics = (synced && synced.length > 0) ? synced : null;
  currentUnsyncedLyrics = (unsynced && unsynced.length > 0) ? unsynced : null;
  
  if (currentSyncedLyrics) {
    isShowingSyncedLyrics = true;
    currentSyncedLyrics.forEach(({ text }) => {
      const p = document.createElement("p");
      p.textContent = text;
      lyricsContainer.appendChild(p);
    });
    highlightSyncedLyrics(currentSyncedLyrics, lyricsContainer);
  } else if (currentUnsyncedLyrics) {
    isShowingSyncedLyrics = false;
    currentUnsyncedLyrics.forEach(({ text }) => {
      const p = document.createElement("p");
      p.textContent = text;
      lyricsContainer.appendChild(p);
    });
  } else {
    isShowingSyncedLyrics = false;
    lyricsContainer.textContent = `No lyrics found for this track from ${providerName}`;
  }
}

// Translation functions
function removeTranslatedLyrics() {
  const popup = document.getElementById('lyrics-plus-popup');
  if (!popup) return;
  
  const lyricsContainer = popup.querySelector('.lyrics-container');
  const translatedEls = lyricsContainer.querySelectorAll('[data-translated="true"]');
  translatedEls.forEach(el => el.remove());
  translationPresent = false;
  lastTranslatedLang = null;
}

async function translateLyricsInPopup(popup) {
  if (isTranslating) return;
  
  const lyricsContainer = popup.querySelector('.lyrics-container');
  const targetLang = getSavedTranslationLang();
  
  if (translationPresent && lastTranslatedLang === targetLang) return;
  
  isTranslating = true;
  const translateBtn = popup.querySelector('#translateBtn');
  translateBtn.disabled = true;
  
  removeTranslatedLyrics();
  
  const pEls = Array.from(lyricsContainer.querySelectorAll('p'));
  const linesToTranslate = pEls.filter(el => 
    el.textContent.trim() && el.textContent.trim() !== "♪"
  );
  
  await Promise.all(linesToTranslate.map(async (p) => {
    const originalText = p.textContent.trim();
    const translatedText = await translateText(originalText, targetLang);
    const translationDiv = document.createElement('div');
    translationDiv.textContent = translatedText;
    translationDiv.style.color = 'gray';
    translationDiv.setAttribute('data-translated', 'true');
    p.parentNode.insertBefore(translationDiv, p.nextSibling);
  }));
  
  lastTranslatedLang = targetLang;
  translationPresent = true;
  translateBtn.disabled = false;
  isTranslating = false;
}

// Token setup modals
function showMusixmatchTokenModal() {
  const old = document.getElementById("lyrics-plus-musixmatch-modal");
  if (old) old.remove();
  
  const modal = document.createElement("div");
  modal.id = "lyrics-plus-musixmatch-modal";
  modal.className = "lyrics-plus-modal";
  
  const box = document.createElement("div");
  box.className = "lyrics-plus-modal-box";
  box.innerHTML = `
    <button class="lyrics-plus-modal-close" title="Close">&times;</button>
    <div class="lyrics-plus-modal-title">Set your Musixmatch User Token</div>
    <div style="font-size:14px;line-height:1.6;margin-bottom:12px">
      <b>How to retrieve your token:</b><br>
      1. Go to <a href="https://www.musixmatch.com/" target="_blank">Musixmatch</a> and click on Login.<br>
      2. Select [Community] as your product.<br>
      3. Open DevTools (Press F12 or Right click and Inspect). <br>
      4. Go to the Network tab &gt; Click on the www.musixmatch.com domain &gt; Cookies.<br>
      5. Right-click on the content of the musixmatchUserToken and select Copy value.<br>
      6. Go to <a href="https://jsonformatter.curiousconcept.com/" target="_blank">JSON Formatter</a> &gt; Paste the content &gt; Click Process.<br>
      7. Copy the value of web-desktop-app-v1.0 &gt; Paste the token below and press Save.<br>
      <span style="color:#e57373;"><b>WARNING:</b> Keep your token private! Do not share it with others.</span>
    </div>
  `;
  
  const input = document.createElement("input");
  input.type = "text";
  input.placeholder = "Enter your Musixmatch user token here";
  input.value = localStorage.getItem("lyricsPlusMusixmatchToken") || "";
  box.appendChild(input);
  
  const footer = document.createElement("div");
  footer.className = "modal-footer";
  
  const btnSave = document.createElement("button");
  btnSave.textContent = "Save";
  btnSave.className = "lyrics-btn";
  btnSave.onclick = () => {
    localStorage.setItem("lyricsPlusMusixmatchToken", input.value.trim());
    modal.remove();
  };
  
  const btnCancel = document.createElement("button");
  btnCancel.textContent = "Cancel";
  btnCancel.className = "lyrics-btn";
  btnCancel.onclick = () => modal.remove();
  
  footer.appendChild(btnSave);
  footer.appendChild(btnCancel);
  box.appendChild(footer);
  
  box.querySelector('.lyrics-plus-modal-close').onclick = () => modal.remove();
  
  modal.appendChild(box);
  document.body.appendChild(modal);
  
  input.focus();
}

function showSpotifyTokenModal() {
  const old = document.getElementById("lyrics-plus-spotify-modal");
  if (old) old.remove();
  
  const modal = document.createElement("div");
  modal.id = "lyrics-plus-spotify-modal";
  modal.className = "lyrics-plus-modal";
  
  const box = document.createElement("div");
  box.className = "lyrics-plus-modal-box";
  box.innerHTML = `
    <button class="lyrics-plus-modal-close" title="Close">&times;</button>
    <div class="lyrics-plus-modal-title">Set your Spotify User Token</div>
    <div style="font-size:14px;line-height:1.6;margin-bottom:12px">
      <b>How to retrieve your token:</b><br>
      1. Go to <a href="https://open.spotify.com/" target="_blank">Spotify Web Player</a> and log in. Play a song.<br>
      2. Open DevTools (Press F12 or Right click and Inspect).<br>
      3. Go to the Network tab and search for "spclient".<br>
      4. You may have to wait a little for it to load.<br>
      5. Click on one of the spclient domains and go to the Headers section.<br>
      6. Under Response Headers, locate the authorization request header.<br>
      7. If there isn't one, try a different spclient domain.<br>
      8. Right-click on the content of the authorization request header and select Copy value.<br>
      9. Paste the token below and press Save.<br>
      <span style="color:#e57373;"><b>WARNING:</b> Keep your token private! Do not share it with others.</span>
    </div>
  `;
  
  const input = document.createElement("input");
  input.type = "text";
  input.placeholder = "Enter your Spotify user token here";
  input.value = localStorage.getItem("lyricsPlusSpotifyToken") || "";
  box.appendChild(input);
  
  const footer = document.createElement("div");
  footer.className = "modal-footer";
  
  const btnSave = document.createElement("button");
  btnSave.textContent = "Save";
  btnSave.className = "lyrics-btn";
  btnSave.onclick = () => {
    localStorage.setItem("lyricsPlusSpotifyToken", input.value.trim());
    modal.remove();
  };
  
  const btnCancel = document.createElement("button");
  btnCancel.textContent = "Cancel";
  btnCancel.className = "lyrics-btn";
  btnCancel.onclick = () => modal.remove();
  
  footer.appendChild(btnSave);
  footer.appendChild(btnCancel);
  box.appendChild(footer);
  
  box.querySelector('.lyrics-plus-modal-close').onclick = () => modal.remove();
  
  modal.appendChild(box);
  document.body.appendChild(modal);
  
  input.focus();
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
      
      // Update lyrics in popup if it exists
      const popup = document.getElementById('lyrics-plus-popup');
      if (popup) {
        popup.querySelector('.lyrics-container').textContent = "Loading lyrics...";
        autodetectProviderAndLoad(popup, trackInfo);
      }
    }
  }, 1000);
}

// Watch for DOM changes to re-add button
const observer = new MutationObserver(() => {
  addLyricsButton();
});

observer.observe(document.body, { childList: true, subtree: true });

// Watch for page changes
const appRoot = document.querySelector('#main');
if (appRoot) {
  const pageObserver = new MutationObserver(() => {
    addLyricsButton();
  });
  pageObserver.observe(appRoot, { childList: true, subtree: true });
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

// Inject styles for the popup
function injectPopupStyles() {
  if (document.getElementById('lyrics-plus-styles')) return;
  
  const style = document.createElement('style');
  style.id = 'lyrics-plus-styles';
  style.textContent = `
    .hide-scrollbar::-webkit-scrollbar { display: none; }
    .hide-scrollbar { scrollbar-width: none !important; ms-overflow-style: none !important; }
    
    #lyrics-plus-popup {
      position: fixed;
      bottom: 87px;
      right: 0px;
      width: 370px;
      height: 79.5vh;
      min-width: 370px;
      min-height: 240px;
      background-color: #121212;
      color: white;
      border-radius: 12px;
      box-shadow: 0 0 20px rgba(0, 0, 0, 0.9);
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      z-index: 100000;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      padding: 0;
      user-select: none;
    }
    
    #lyrics-plus-popup .header-wrapper {
      padding: 12px;
      border-bottom: 1px solid #333;
      background-color: #121212;
      z-index: 10;
      cursor: move;
      user-select: none;
    }
    
    #lyrics-plus-popup .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    
    #lyrics-plus-popup .header h3 {
      margin: 0;
      font-weight: 600;
      color: #1db954;
      font-size: 1.35em;
    }
    
    #lyrics-plus-popup .button-group {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    
    #lyrics-plus-popup .header-buttons {
      background: none;
      border: none;
      color: white;
      cursor: pointer;
      font-size: 14px;
      padding: 4px 8px;
      border-radius: 4px;
      transition: background 0.2s;
    }
    
    #lyrics-plus-popup .header-buttons:hover {
      background: #333;
    }
    
    #lyrics-plus-popup .close-btn {
      background: none;
      border: none;
      color: white;
      cursor: pointer;
      font-size: 18px;
      font-weight: bold;
      padding: 0 6px;
      border-radius: 4px;
      transition: background 0.2s;
    }
    
    #lyrics-plus-popup .close-btn:hover {
      background: #333;
    }
    
    #lyrics-plus-popup .tabs-container {
      display: flex;
      gap: 8px;
      margin-top: 12px;
    }
    
    #lyrics-plus-popup .provider-tab {
      flex: 1;
      padding: 6px;
      border-radius: 6px;
      border: none;
      cursor: pointer;
      background: #333;
      color: white;
      font-weight: 600;
      transition: background 0.2s;
    }
    
    #lyrics-plus-popup .provider-tab.active {
      background: #1db954;
    }
    
    #lyrics-plus-popup .provider-tab:hover {
      background: #444;
    }
    
    #lyrics-plus-popup .provider-tab.active:hover {
      background: #1db954;
    }
    
    #lyrics-plus-popup .controls-wrapper {
      background: #121212;
      border-bottom: 1px solid #333;
      transition: max-height 0.3s, padding 0.3s;
      overflow: hidden;
    }
    
    #lyrics-plus-popup .controls-wrapper.hidden {
      max-height: 0;
      padding: 0 12px;
      pointer-events: none;
    }
    
    #lyrics-plus-popup .controls-wrapper.visible {
      max-height: 100px;
      padding: 8px 12px;
      pointer-events: auto;
    }
    
    #lyrics-plus-popup .translation-controls {
      display: flex;
      align-items: center;
      gap: 8px;
      width: 100%;
    }
    
    #lyrics-plus-popup .translation-controls select,
    #lyrics-plus-popup .translation-controls button {
      flex: 1;
      height: 28px;
      background: #333;
      color: white;
      border: none;
      border-radius: 5px;
      font-size: 13px;
      cursor: pointer;
      transition: background 0.2s;
    }
    
    #lyrics-plus-popup .translation-controls button {
      background: #1db954;
    }
    
    #lyrics-plus-popup .translation-controls button:hover {
      background: #1ed760;
    }
    
    #lyrics-plus-popup .offset-controls {
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-size: 15px;
      width: 100%;
    }
    
    #lyrics-plus-popup .offset-input-container {
      position: relative;
      display: inline-block;
      margin-left: 16px;
    }
    
    #lyrics-plus-popup .offset-input {
      width: 68px;
      height: 28px;
      background: #222;
      color: white;
      border: 1px solid #444;
      border-radius: 6px;
      padding: 2px 24px 2px 6px;
      font-size: 14px;
      box-sizing: border-box;
    }
    
    #lyrics-plus-popup .offset-spinner {
      position: absolute;
      right: 0;
      top: 0;
      height: 28px;
      width: 24px;
      display: flex;
      flex-direction: column;
      z-index: 2;
    }
    
    #lyrics-plus-popup .offset-spinner button {
      background: #333;
      border: none;
      width: 24px;
      height: 14px;
      cursor: pointer;
      padding: 0;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    
    #lyrics-plus-popup .offset-spinner button:hover {
      background: #444;
    }
    
    #lyrics-plus-popup .offset-spinner button:first-child {
      border-radius: 2px 2px 0 0;
    }
    
    #lyrics-plus-popup .offset-spinner button:last-child {
      border-radius: 0 0 2px 2px;
    }
    
    #lyrics-plus-popup .lyrics-container {
      flex: 1;
      overflow-y: auto;
      overflow-x: hidden;
      padding: 12px;
      white-space: pre-wrap;
      font-size: 22px;
      line-height: 1.5;
      background: #121212;
      user-select: text;
      text-align: center;
    }
    
    #lyrics-plus-popup .lyrics-container p {
      margin: 0 0 6px 0;
      transition: transform 0.18s, color 0.15s, filter 0.13s, opacity 0.13s;
      color: white;
      font-weight: 400;
      filter: blur(0.7px);
      opacity: 0.8;
      transform: scale(1.0);
    }
    
    #lyrics-plus-popup .lyrics-container p.active {
      color: #1db954;
      font-weight: 700;
      filter: none;
      opacity: 1;
      transform: scale(1.05);
    }
    
    #lyrics-plus-popup .playback-controls {
      display: flex;
      justify-content: center;
      align-items: center;
      gap: 12px;
      padding: 8px 12px;
      border-top: 1px solid #333;
      background: #121212;
      transition: max-height 0.3s;
      overflow: hidden;
    }
    
    #lyrics-plus-popup .playback-controls.hidden {
      max-height: 0;
      opacity: 0;
      pointer-events: none;
    }
    
    #lyrics-plus-popup .playback-controls.visible {
      max-height: 80px;
      opacity: 1;
      pointer-events: auto;
    }
    
    #lyrics-plus-popup .control-button {
      cursor: pointer;
      background: #1db954;
      border: none;
      border-radius: 50%;
      width: 32px;
      height: 32px;
      color: white;
      font-weight: bold;
      font-size: 18px;
      display: flex;
      justify-content: center;
      align-items: center;
      padding: 0;
      transition: background 0.2s;
    }
    
    #lyrics-plus-popup .control-button:hover {
      background: #1ed760;
    }
    
    #lyrics-plus-popup .control-button.secondary {
      background: #555;
    }
    
    #lyrics-plus-popup .control-button.secondary:hover {
      background: #666;
    }
    
    #lyrics-plus-popup .download-button {
      position: relative;
      background: none;
      color: white;
      border: none;
      width: 28px;
      height: 28px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: color 0.2s;
    }
    
    #lyrics-plus-popup .download-button:hover {
      color: #1db954;
    }
    
    #lyrics-plus-popup .download-dropdown {
      position: absolute;
      top: 110%;
      left: 0;
      min-width: 90px;
      background: #121212;
      border: 1px solid #444;
      border-radius: 8px;
      box-shadow: 0 2px 12px rgba(0, 0, 0, 0.6);
      z-index: 9999;
      display: none;
      flex-direction: column;
      padding: 4px;
    }
    
    #lyrics-plus-popup .download-dropdown button {
      background: #121212;
      color: white;
      border: none;
      padding: 8px 10px;
      cursor: pointer;
      text-align: left;
      font-size: 14px;
      border-radius: 5px;
      transition: background 0.2s;
    }
    
    #lyrics-plus-popup .download-dropdown button:hover {
      background: #333;
    }
    
    #lyrics-plus-popup .font-size-select {
      margin-right: 6px;
      cursor: pointer;
      background: #121212;
      border: none;
      color: white;
      font-size: 14px;
      border-radius: 4px;
      padding: 4px 8px;
    }
    
    #lyrics-plus-popup .font-size-select:hover {
      background: #333;
    }
    
    #lyrics-plus-popup .resizer {
      width: 16px;
      height: 16px;
      position: absolute;
      right: 4px;
      bottom: 4px;
      cursor: nwse-resize;
      background-color: rgba(255, 255, 255, 0.1);
      border-top: 1.5px solid rgba(255, 255, 255, 0.15);
      border-left: 1.5px solid rgba(255, 255, 255, 0.15);
      box-sizing: border-box;
      z-index: 20;
      clip-path: polygon(100% 0, 0 100%, 100% 100%);
    }
    
    /* Modal styles */
    .lyrics-plus-modal {
      position: fixed;
      left: 0;
      top: 0;
      width: 100vw;
      height: 100vh;
      background: rgba(0,0,0,0.7);
      z-index: 100001;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    
    .lyrics-plus-modal-box {
      background: #181818;
      color: #fff;
      border-radius: 14px;
      padding: 30px 28px 22px 28px;
      min-width: 350px;
      max-width: 90vw;
      box-shadow: 0 2px 24px rgba(0, 0, 0, 0.7);
      font-family: inherit;
      position: relative;
      box-sizing: border-box;
    }
    
    .lyrics-plus-modal-title {
      color: #1db954;
      font-size: 1.35em;
      font-weight: 700;
      margin-bottom: 13px;
      text-align: center;
      letter-spacing: 0.3px;
    }
    
    .lyrics-plus-modal .modal-footer {
      display: flex;
      justify-content: flex-end;
      gap: 25px;
      margin-top: 18px;
      padding: 0;
    }
    
    .lyrics-plus-modal .lyrics-btn {
      background: #222;
      color: #fff;
      border: none;
      border-radius: 20px;
      padding: 8px 0;
      font-size: 15px;
      font-weight: 600;
      cursor: pointer;
      box-shadow: 0 1px 4px rgba(0, 0, 0, 0.2);
      transition: background 0.13s, color 0.13s;
      outline: none;
      min-width: 90px;
      width: 90px;
      text-align: center;
      flex: 0 0 90px;
      margin: 0;
    }
    
    .lyrics-plus-modal .lyrics-btn:hover {
      background: #1db954;
      color: #181818;
    }
    
    .lyrics-plus-modal-close {
      background: #222;
      color: #fff;
      border: none;
      border-radius: 14px;
      font-size: 1.25em;
      font-weight: 700;
      width: 36px;
      height: 36px;
      padding: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      position: absolute;
      top: 10px;
      right: 10px;
      cursor: pointer;
      transition: background 0.13s, color 0.13s;
      z-index: 1;
      line-height: 1;
      margin: 0;
    }
    
    .lyrics-plus-modal-close:hover {
      background: #1db954;
      color: #181818;
    }
    
    .lyrics-plus-modal a {
      color: #1db954;
      text-decoration: none;
      transition: color 0.12s;
      font-weight: 600;
    }
    
    .lyrics-plus-modal a:hover {
      color: #fff;
      text-decoration: underline;
    }
    
    .lyrics-plus-modal input[type="text"] {
      background: #222;
      color: #fff;
      border: 1px solid #333;
      border-radius: 5px;
      width: 100%;
      padding: 8px 10px;
      margin: 14px 0 8px 0;
      font-size: 1em;
      box-sizing: border-box;
      display: block;
    }
    
    .lyrics-plus-modal input[type="text"]:focus {
      outline: none;
      border-color: #1db954;
    }
    
    #lyrics-plus-btn {
      background-color: #1db954;
      border: none;
      border-radius: 20px;
      color: white;
      cursor: pointer;
      font-weight: 600;
      font-size: 14px;
      padding: 6px 12px;
      margin-left: 8px;
      user-select: none;
      transition: background 0.2s;
    }
    
    #lyrics-plus-btn:hover {
      background-color: #1ed760;
    }
  `;
  document.head.appendChild(style);
}

// Set up keyboard shortcuts
function setupKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    // 'L' key to toggle lyrics popup
    if (e.key === 'l' || e.key === 'L') {
      // Don't trigger if user is typing in an input field
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) {
        return;
      }
      
      e.preventDefault();
      toggleLyricsPopup();
    }
  });
}

// Add Lyrics+ button to Spotify controls
function addLyricsButton(maxRetries = 10) {
  let attempts = 0;
  const tryAdd = () => {
    const controls = document.querySelector('[data-testid="control-button-skip-forward"]')?.parentElement;
    if (!controls) {
      if (attempts < maxRetries) {
        attempts++;
        setTimeout(tryAdd, 1000);
      } else {
        console.warn("Lyrics+ button: Failed to find controls after max retries.");
      }
      return;
    }
    
    if (document.getElementById("lyrics-plus-btn")) return;
    
    const btn = document.createElement("button");
    btn.id = "lyrics-plus-btn";
    btn.title = "Show Lyrics+ (Press L)";
    btn.textContent = "Lyrics+";
    btn.onclick = toggleLyricsPopup;
    
    controls.appendChild(btn);
  };
  
  tryAdd();
}

// Toggle lyrics popup
function toggleLyricsPopup() {
  const existingPopup = document.getElementById("lyrics-plus-popup");
  if (existingPopup) {
    removePopup();
  } else {
    createPopup();
  }
}
