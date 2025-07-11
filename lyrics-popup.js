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

// Global state
let currentTrackId = null;
let currentSyncedLyrics = null;
let currentUnsyncedLyrics = null;
let currentLyricsContainer = null;
let highlightTimer = null;
let pollingInterval = null;
let isTranslating = false;
let translationPresent = false;
let lastTranslatedLang = null;
let isShowingSyncedLyrics = false;
let providerClickTimer = null;

// Provider configuration
const Providers = {
  list: ["LRCLIB", "Spotify", "KPoe", "Musixmatch", "Genius"],
  current: "LRCLIB",
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

function timeStringToMs(str) {
  const parts = str.split(":").map((p) => parseInt(p));
  if (parts.length === 2) return (parts[0] * 60 + parts[1]) * 1000;
  if (parts.length === 3) return (parts[0] * 3600 + parts[1] * 60 + parts[2]) * 1000;
  return 0;
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
    // Get current position from background script
    chrome.runtime.sendMessage({type: "GET_POSITION"}, (response) => {
      if (!response) return;
      
      const { currentTime, isPlaying } = response;
      const currentTimeMs = currentTime * 1000;
      const anticipatedMs = currentTimeMs + getAnticipationOffset();
      
      // Update scrollbar visibility based on playback state
      if (isShowingSyncedLyrics) {
        if (isPlaying) {
          container.style.overflowY = "auto";
          container.style.pointerEvents = "none";
          container.classList.add('hide-scrollbar');
        } else {
          container.style.overflowY = "auto";
          container.style.pointerEvents = "";
          container.classList.remove('hide-scrollbar');
        }
      } else {
        container.style.overflowY = "auto";
        container.style.pointerEvents = "";
        container.classList.remove('hide-scrollbar');
      }
      
      let activeIndex = -1;
      for (let i = 0; i < lyrics.length; i++) {
        if (anticipatedMs >= (lyrics[i].time ?? lyrics[i].startTime)) {
          activeIndex = i;
        } else {
          break;
        }
      }
      
      pElements.forEach((p, idx) => {
        if (idx === activeIndex) {
          p.classList.add('active');
        } else {
          p.classList.remove('active');
        }
      });
      
      // Auto-scroll to active line when playing
      const activeP = pElements[activeIndex];
      if (activeP && isPlaying) {
        activeP.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    });
  }, 50);
}

// UI Management
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

function updatePlayPauseIcon(button) {
  chrome.runtime.sendMessage({type: "GET_POSITION"}, (response) => {
    if (!response) return;
    
    const { isPlaying } = response;
    const playSVG = `<svg viewBox="0 0 24 24" width="20" height="20" fill="white"><path d="M8 5v14l11-7z"/></svg>`;
    const pauseSVG = `<svg viewBox="0 0 24 24" width="20" height="20" fill="white"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>`;
    
    button.innerHTML = isPlaying ? pauseSVG : playSVG;
  });
}

function sendSpotifyCommand(command) {
  chrome.runtime.sendMessage({
    type: "SPOTIFY_COMMAND",
    command: command
  });
}

// Lyrics providers and fetching
async function fetchLyrics(trackInfo, providerName) {
  // Request lyrics from background script
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({
      type: "FETCH_LYRICS",
      trackInfo: trackInfo,
      provider: providerName
    }, (response) => {
      resolve(response);
    });
  });
}

async function autodetectProviderAndLoad(trackInfo) {
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
        updateTabs(document.getElementById('providerTabs'));
        await updateLyricsContent(trackInfo, name, result);
        return;
      }
    }
  }
  
  // No lyrics found
  Providers.current = null;
  updateTabs(document.getElementById('providerTabs'), true);
  const lyricsContainer = document.getElementById('lyricsContainer');
  lyricsContainer.textContent = "No lyrics were found for this track from any of the available providers";
  currentSyncedLyrics = null;
  currentUnsyncedLyrics = null;
}

async function updateLyricsContent(trackInfo, providerName, result) {
  const lyricsContainer = document.getElementById('lyricsContainer');
  if (!lyricsContainer) return;
  
  currentLyricsContainer = lyricsContainer;
  currentSyncedLyrics = null;
  currentUnsyncedLyrics = null;
  
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
  const lyricsContainer = document.getElementById('lyricsContainer');
  const translatedEls = lyricsContainer.querySelectorAll('[data-translated="true"]');
  translatedEls.forEach(el => el.remove());
  translationPresent = false;
  lastTranslatedLang = null;
}

async function translateLyricsInPopup() {
  if (isTranslating) return;
  
  const lyricsContainer = document.getElementById('lyricsContainer');
  const targetLang = getSavedTranslationLang();
  
  if (translationPresent && lastTranslatedLang === targetLang) return;
  
  isTranslating = true;
  const translateBtn = document.getElementById('translateBtn');
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

// Initialize the popup
function initializePopup() {
  // Populate language selector
  const languageSelect = document.getElementById('languageSelect');
  for (const [code, name] of Object.entries(TRANSLATION_LANGUAGES)) {
    const option = document.createElement('option');
    option.value = code;
    option.textContent = name;
    languageSelect.appendChild(option);
  }
  languageSelect.value = getSavedTranslationLang();
  
  // Populate provider tabs
  const providerTabs = document.getElementById('providerTabs');
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
        chrome.runtime.sendMessage({type: "GET_TRACK_INFO"}, async (response) => {
          if (response && response.trackInfo) {
            const result = await fetchLyrics(response.trackInfo, name);
            await updateLyricsContent(response.trackInfo, name, result);
          }
        });
        
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
      if (name === "Musixmatch" || name === "Spotify") {
        chrome.runtime.sendMessage({
          type: "SHOW_TOKEN_SETUP",
          provider: name
        });
      }
    };
    
    providerTabs.appendChild(button);
  });
  
  // Set up event listeners
  setupEventListeners();
  
  // Load saved preferences
  loadPreferences();
  
  // Start polling for track changes
  startPolling();
}

function setupEventListeners() {
  // Close button
  document.getElementById('closeBtn').onclick = () => {
    chrome.runtime.sendMessage({type: "CLOSE_POPUP"});
  };
  
  // Control toggles
  document.getElementById('translationToggle').onclick = () => {
    const wrapper = document.getElementById('translationWrapper');
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
  
  document.getElementById('offsetToggle').onclick = () => {
    const wrapper = document.getElementById('offsetWrapper');
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
  
  document.getElementById('playbackToggle').onclick = () => {
    const wrapper = document.getElementById('playbackControls');
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
  document.getElementById('languageSelect').onchange = (e) => {
    saveTranslationLang(e.target.value);
    removeTranslatedLyrics();
    lastTranslatedLang = null;
  };
  
  document.getElementById('translateBtn').onclick = translateLyricsInPopup;
  document.getElementById('removeTranslationBtn').onclick = () => {
    removeTranslatedLyrics();
    lastTranslatedLang = null;
  };
  
  // Offset controls
  const offsetInput = document.getElementById('offsetInput');
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
  
  document.getElementById('offsetUp').onclick = () => {
    let val = parseInt(offsetInput.value, 10) || 0;
    val += 50;
    if (val > 5000) val = 5000;
    offsetInput.value = val;
    saveAndApplyOffset();
  };
  
  document.getElementById('offsetDown').onclick = () => {
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
  document.getElementById('fontSizeSelect').onchange = (e) => {
    const size = e.target.value;
    localStorage.setItem("lyricsPlusFontSize", size);
    document.getElementById('lyricsContainer').style.fontSize = size + "px";
  };
  
  // Download controls
  const downloadBtn = document.getElementById('downloadBtn');
  const downloadDropdown = document.getElementById('downloadDropdown');
  
  downloadBtn.onclick = () => {
    const hasSynced = !!currentSyncedLyrics;
    const hasUnsynced = !!currentUnsyncedLyrics;
    
    document.getElementById('downloadSynced').style.display = hasSynced ? '' : 'none';
    document.getElementById('downloadUnsynced').style.display = hasUnsynced ? '' : 'none';
    
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
  
  document.getElementById('downloadSynced').onclick = () => {
    downloadDropdown.style.display = 'none';
    if (currentSyncedLyrics) {
      chrome.runtime.sendMessage({type: "GET_TRACK_INFO"}, (response) => {
        if (response && response.trackInfo) {
          downloadSyncedLyrics(currentSyncedLyrics, response.trackInfo, Providers.current);
        }
      });
    }
  };
  
  document.getElementById('downloadUnsynced').onclick = () => {
    downloadDropdown.style.display = 'none';
    if (currentUnsyncedLyrics) {
      chrome.runtime.sendMessage({type: "GET_TRACK_INFO"}, (response) => {
        if (response && response.trackInfo) {
          downloadUnsyncedLyrics(currentUnsyncedLyrics, response.trackInfo, Providers.current);
        }
      });
    }
  };
  
  // Playback controls
  document.getElementById('resetBtn').onclick = () => {
    // Reset window size and position
    chrome.runtime.sendMessage({type: "RESET_WINDOW"});
  };
  
  document.getElementById('prevBtn').onclick = () => sendSpotifyCommand('previous');
  document.getElementById('nextBtn').onclick = () => sendSpotifyCommand('next');
  
  const playPauseBtn = document.getElementById('playPauseBtn');
  playPauseBtn.onclick = () => {
    sendSpotifyCommand('playpause');
    setTimeout(() => updatePlayPauseIcon(playPauseBtn), 100);
  };
  
  // Update play/pause icon periodically
  setInterval(() => updatePlayPauseIcon(playPauseBtn), 1000);
}

function loadPreferences() {
  // Load saved font size
  const savedFontSize = localStorage.getItem("lyricsPlusFontSize") || "22";
  document.getElementById('fontSizeSelect').value = savedFontSize;
  document.getElementById('lyricsContainer').style.fontSize = savedFontSize + "px";
  
  // Load saved offset
  const savedOffset = getAnticipationOffset();
  document.getElementById('offsetInput').value = savedOffset;
  
  // Load saved visibility states
  const translatorVisible = JSON.parse(localStorage.getItem('lyricsPlusTranslatorVisible') || 'false');
  const offsetVisible = JSON.parse(localStorage.getItem('lyricsPlusOffsetVisible') || 'true');
  const controlsVisible = JSON.parse(localStorage.getItem('lyricsPlusControlsVisible') || 'true');
  
  if (translatorVisible) {
    document.getElementById('translationWrapper').classList.add('visible');
    document.getElementById('translationWrapper').classList.remove('hidden');
  }
  
  if (!offsetVisible) {
    document.getElementById('offsetWrapper').classList.add('hidden');
    document.getElementById('offsetWrapper').classList.remove('visible');
  }
  
  if (!controlsVisible) {
    document.getElementById('playbackControls').classList.add('hidden');
    document.getElementById('playbackControls').classList.remove('visible');
  }
}

function startPolling() {
  if (pollingInterval) clearInterval(pollingInterval);
  
  pollingInterval = setInterval(() => {
    chrome.runtime.sendMessage({type: "GET_TRACK_INFO"}, async (response) => {
      if (response && response.trackInfo) {
        const trackInfo = response.trackInfo;
        
        if (trackInfo.id !== currentTrackId) {
          currentTrackId = trackInfo.id;
          document.getElementById('lyricsContainer').textContent = "Loading lyrics...";
          await autodetectProviderAndLoad(trackInfo);
        }
      }
    });
  }, 1000);
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', initializePopup);