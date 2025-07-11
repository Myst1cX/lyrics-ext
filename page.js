function getWords(str) {
  const result = [];
  const words = str.split(
    new RegExp("(\\p{sc=Han}|\\p{sc=Katakana}|\\p{sc=Hiragana}|\\p{sc=Hang}|\\p{gc=Punctuation})|\\s+", "gu")
  );
  let tempWord = "";
  words.forEach((word = " ") => {
    if (word) {
      if (tempWord && /("|')$/.test(tempWord) && word !== " ") {
        tempWord += word;
      } else if (/(,|\.|\?|:|;|'|，|。|？|：|；|")/.test(word) && tempWord !== " ") {
        tempWord += word;
      } else {
        if (tempWord) result.push(tempWord);
        tempWord = word;
      }
    }
  });
  if (tempWord) result.push(tempWord);
  return result;
}
function drawParagraph(ctx, str = "", options) {
  let actualWidth = 0;
  const maxWidth = ctx.canvas.width - options.left - options.right;
  const words = getWords(str);
  const lines = [];
  const measures = [];
  let tempLine = "";
  let textMeasures = ctx.measureText("");
  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    const line = tempLine + word;
    const mea = ctx.measureText(line);
    const isSpace = /\s/.test(word);
    if (mea.width > maxWidth && tempLine && !isSpace) {
      actualWidth = Math.max(actualWidth, textMeasures.width);
      lines.push(tempLine);
      measures.push(textMeasures);
      tempLine = word;
    } else {
      tempLine = line;
      if (!isSpace) {
        textMeasures = mea;
      }
    }
  }
  if (tempLine !== "") {
    actualWidth = Math.max(actualWidth, textMeasures.width);
    lines.push(tempLine);
    measures.push(ctx.measureText(tempLine));
  }
  const ascent = measures.length ? measures[0].actualBoundingBoxAscent : 0;
  const body = measures.length ? options.lineHeight * (measures.length - 1) : 0;
  const descent = measures.length ? measures[measures.length - 1].actualBoundingBoxDescent : 0;
  const actualHeight = ascent + body + descent;
  let startX = 0;
  let startY = 0;
  let translateX = 0;
  let translateY = 0;
  if (options.hCenter) {
    startX = (ctx.canvas.width - actualWidth) / 2;
  } else {
    startX = options.left + translateX;
  }
  if (options.vCenter) {
    startY = (ctx.canvas.height - actualHeight) / 2 + ascent;
  } else if (options.top) {
    startY = options.top + ascent;
  } else if (options.bottom) {
    startY = options.bottom - descent - body;
  }
  if (typeof options.translateX === "function") {
    translateX = options.translateX(actualWidth);
  }
  if (typeof options.translateX === "number") {
    translateX = options.translateX;
  }
  if (typeof options.translateY === "function") {
    translateY = options.translateY(actualHeight);
  }
  if (typeof options.translateY === "number") {
    translateY = options.translateY;
  }
  if (!options.measure) {
    lines.forEach((str2, index) => {
      const x = options.hCenter ? (ctx.canvas.width - measures[index].width) / 2 : startX;
      ctx.fillText(str2, x, startY + index * options.lineHeight + translateY);
    });
  }
  return {
    width: actualWidth,
    height: actualHeight,
    left: startX + translateX,
    right: ctx.canvas.width - options.left - actualWidth + translateX,
    top: startY - ascent + translateY,
    bottom: startY + body + descent + translateY
  };
}
function drawMask(ctx) {
  ctx.save();
  ctx.fillStyle = "#000000b0";
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.restore();
}
function drawBackground(ctx, image) {
  ctx.canvas.width = ctx.canvas.width;
  ctx.drawImage(image, 0, 0, ctx.canvas.width, ctx.canvas.height);
}
function drawText(ctx, text, options) {
  const { color = "white", backgroundImage } = options;
  drawBackground(ctx, backgroundImage);
  drawMask(ctx);
  ctx.save();
  const fontSize = 32;
  ctx.fillStyle = color;
  ctx.font = `bold ${fontSize}px ${options.fontFamily}, sans-serif`;
  drawParagraph(ctx, text, {
    vCenter: true,
    hCenter: true,
    left: 0,
    right: 0,
    lineHeight: fontSize
  });
  ctx.restore();
}
let renderState;
function isEqualState(state1, state2) {
  if (!state1 || !state2) return false;
  return Object.keys(state1).reduce((p, c) => {
    return p && state1[c] === state2[c];
  }, true);
}
let offscreenCanvas;
let offscreenCtx;
let gradient1;
let gradient2;
function initOffscreenCtx(ctx) {
  if (!offscreenCtx) {
    offscreenCanvas = document.createElement("canvas");
    offscreenCtx = offscreenCanvas.getContext("2d");
    gradient1 = offscreenCtx.createLinearGradient(0, 0, 0, ctx.canvas.height);
    gradient1.addColorStop(0.08, "transparent");
    gradient1.addColorStop(0.15, "white");
    gradient1.addColorStop(0.85, "white");
    gradient1.addColorStop(0.92, "transparent");
    gradient2 = offscreenCtx.createLinearGradient(0, 0, 0, ctx.canvas.height);
    gradient2.addColorStop(0, "white");
    gradient2.addColorStop(0.7, "white");
    gradient2.addColorStop(0.925, "transparent");
  }
  offscreenCtx.canvas.width = ctx.canvas.width;
  offscreenCtx.canvas.height = ctx.canvas.height;
  return { offscreenCtx, gradient1, gradient2 };
}
function renderLyrics(ctx, lyrics, currentTime, options) {
  var _a, _b, _c, _d;
  const focusLineFontSize = options.focusLineFontSize;
  const focusLineHeight = focusLineFontSize * 1.2;
  const focusLineMargin = focusLineFontSize * 1;
  const otherLineFontSize = focusLineFontSize * 1;
  const otherLineHeight = otherLineFontSize * 1.2;
  const otherLineMargin = otherLineFontSize * 1;
  const otherLineOpacity = 0.35;
  const marginWidth = ctx.canvas.width * 0.075;
  const animateDuration = options.smooth ? 300 : 0;
  const hCenter = options.align === "center";
  const fontFamily = `${options.fontFamily}, sans-serif`;
  let currentIndex = -1;
  let progress = 1;
  lyrics.forEach((line, index) => {
    const startTime = line.time || line.startTime || 0;
    if (currentTime > startTime - animateDuration) {
      currentIndex = index;
      if (currentTime < startTime) {
        progress = (currentTime - startTime + animateDuration) / animateDuration;
      }
    }
  });
  const nextState = { ...options, currentIndex, lyrics, progress };
  if (isEqualState(nextState, renderState)) return;
  renderState = nextState;
  drawBackground(ctx, options.backgroundImage);
  drawMask(ctx);
  ctx.save();
  const { offscreenCtx: offscreenCtx2, gradient1: gradient12 } = initOffscreenCtx(ctx);
  offscreenCtx2.save();
  const fFontSize = otherLineFontSize + progress * (focusLineFontSize - otherLineFontSize);
  const fLineHeight = otherLineHeight + progress * (focusLineHeight - otherLineHeight);
  const fLineOpacity = otherLineOpacity + progress * (1 - otherLineOpacity);
  const otherRight = ctx.canvas.width - marginWidth - otherLineFontSize / focusLineFontSize * (ctx.canvas.width - 2 * marginWidth);
  const progressRight = marginWidth + (1 - progress) * (otherRight - marginWidth);
  offscreenCtx2.fillStyle = `rgba(255, 255, 255, ${fLineOpacity})`;
  offscreenCtx2.font = `bold ${fFontSize}px ${fontFamily}`;
  const prevLineFocusHeight = currentIndex > 0 ? drawParagraph(offscreenCtx2, ((_a = lyrics[currentIndex - 1]) == null ? void 0 : _a.text) || "", {
    vCenter: true,
    hCenter,
    left: marginWidth,
    right: marginWidth,
    lineHeight: focusLineFontSize,
    measure: true
  }).height : 0;
  const pos = drawParagraph(offscreenCtx2, ((_b = lyrics[currentIndex]) == null ? void 0 : _b.text) || "", {
    vCenter: true,
    hCenter,
    left: marginWidth,
    right: progressRight,
    lineHeight: fLineHeight,
    translateY: (selfHeight) => ((prevLineFocusHeight + selfHeight) / 2 + focusLineMargin) * (1 - progress)
  });
  let lastBeforePos = pos;
  for (let i = 0; i < currentIndex; i++) {
    if (i === 0) {
      const prevProgressLineFontSize = otherLineFontSize + (1 - progress) * (focusLineFontSize - otherLineFontSize);
      const prevProgressLineOpacity = otherLineOpacity + (1 - progress) * (1 - otherLineOpacity);
      offscreenCtx2.fillStyle = `rgba(255, 255, 255, ${prevProgressLineOpacity})`;
      offscreenCtx2.font = `bold ${prevProgressLineFontSize}px ${fontFamily}`;
    } else {
      offscreenCtx2.fillStyle = `rgba(255, 255, 255, ${otherLineOpacity})`;
      offscreenCtx2.font = `bold ${otherLineFontSize}px ${fontFamily}`;
    }
    lastBeforePos = drawParagraph(offscreenCtx2, ((_c = lyrics[currentIndex - 1 - i]) == null ? void 0 : _c.text) || "", {
      hCenter,
      bottom: i === 0 ? lastBeforePos.top - focusLineMargin : lastBeforePos.top - otherLineMargin,
      left: marginWidth,
      right: i === 0 ? marginWidth + progress * (otherRight - marginWidth) : otherRight,
      lineHeight: i === 0 ? otherLineHeight + (1 - progress) * (focusLineHeight - otherLineHeight) : otherLineHeight
    });
    if (lastBeforePos.top < 0) break;
  }
  offscreenCtx2.fillStyle = `rgba(255, 255, 255, ${otherLineOpacity})`;
  offscreenCtx2.font = `bold ${otherLineFontSize}px ${fontFamily}`;
  let lastAfterPos = pos;
  for (let i = currentIndex + 1; i < lyrics.length; i++) {
    lastAfterPos = drawParagraph(offscreenCtx2, ((_d = lyrics[i]) == null ? void 0 : _d.text) || "", {
      hCenter,
      top: i === currentIndex + 1 ? lastAfterPos.bottom + focusLineMargin : lastAfterPos.bottom + otherLineMargin,
      left: marginWidth,
      right: otherRight,
      lineHeight: otherLineHeight
    });
    if (lastAfterPos.bottom > ctx.canvas.height) break;
  }
  offscreenCtx2.globalCompositeOperation = "source-in";
  offscreenCtx2.fillStyle = gradient12;
  offscreenCtx2.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  offscreenCtx2.restore();
  ctx.drawImage(offscreenCtx2.canvas, 0, 0);
  ctx.restore();
}
function renderHighlight(ctx, lyrics, options) {
  const DURATION = 2e4;
  const animateDuration = options.smooth ? 500 : 0;
  const marginWidth = ctx.canvas.width * 0.075;
  const fontFamily = `${options.fontFamily}, sans-serif`;
  const time = performance.now();
  const currentIndex = Math.floor(time / DURATION) % lyrics.length;
  const diff = time % DURATION;
  const progress = Math.min((diff < DURATION / 2 ? diff : DURATION - diff) / animateDuration, 1);
  const opacity = progress;
  drawBackground(ctx, options.backgroundImage);
  drawMask(ctx);
  ctx.save();
  const { offscreenCtx: offscreenCtx2, gradient2: gradient22 } = initOffscreenCtx(ctx);
  offscreenCtx2.save();
  offscreenCtx2.fillStyle = `rgba(255, 255, 255, ${opacity})`;
  offscreenCtx2.font = `bold ${options.focusLineFontSize}px ${fontFamily}`;
  drawParagraph(offscreenCtx2, lyrics[currentIndex], {
    hCenter: options.align === "center",
    lineHeight: options.focusLineFontSize * 1.3,
    top: marginWidth,
    left: marginWidth,
    right: marginWidth
  });
  offscreenCtx2.globalCompositeOperation = "source-in";
  offscreenCtx2.fillStyle = gradient22;
  offscreenCtx2.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  offscreenCtx2.restore();
  ctx.drawImage(offscreenCtx2.canvas, 0, 0);
  ctx.restore();
}
let lyricCtx;
let coverCanvas;
let coverHDCanvas;
let lyricVideoIsOpen = false;
function createCanvas(width, height) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}
function createCoverCanvas() {
  const canvas = createCanvas(640, 640);
  const ctx = canvas.getContext("2d");
  const gradient = ctx.createLinearGradient(0, 0, 640, 640);
  gradient.addColorStop(0, "#1db954");
  gradient.addColorStop(1, "#191414");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 640, 640);
  return canvas;
}
function createLyricCanvas() {
  const canvas = createCanvas(800, 600);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, 800, 600);
  return canvas;
}
function initializeElements() {
  coverCanvas = createCoverCanvas();
  coverHDCanvas = createCoverCanvas();
  const lyricCanvas = createLyricCanvas();
  lyricCtx = lyricCanvas.getContext("2d");
  updateAlbumArtwork();
}
function updateAlbumArtwork() {
  const albumArtImg = document.querySelector('[data-testid="now-playing-widget"] img');
  if (albumArtImg && albumArtImg.src) {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      [coverCanvas, coverHDCanvas].forEach((canvas) => {
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      });
    };
    img.onerror = () => {
      console.log("[Element] Failed to load album artwork");
    };
    img.src = albumArtImg.src;
  }
}
async function getCurrentAudio() {
  const audioElement = document.querySelector("audio");
  if (audioElement) {
    return {
      currentTime: audioElement.currentTime,
      duration: audioElement.duration || 0,
      currentSrc: audioElement.src || "",
      paused: audioElement.paused
    };
  }
  const positionEl = document.querySelector('[data-testid="playback-position"]');
  const durationEl = document.querySelector('[data-testid="playback-duration"]');
  const parseTime = (timeStr) => {
    const parts = timeStr.split(":").map((p) => parseInt(p, 10));
    if (parts.length === 2) {
      return parts[0] * 60 + parts[1];
    }
    return 0;
  };
  const currentTime = positionEl ? parseTime(positionEl.textContent || "0:00") : 0;
  const duration = durationEl ? parseTime(durationEl.textContent || "0:00") : 0;
  const playPauseBtn = document.querySelector('[data-testid="control-button-playpause"]');
  const isPaused = playPauseBtn ? (playPauseBtn.getAttribute("aria-label") || "").toLowerCase().includes("play") : true;
  return {
    currentTime,
    duration,
    currentSrc: duration > 0 ? "spotify-track" : "",
    paused: isPaused
  };
}
function setLyricVideoOpen(isOpen) {
  lyricVideoIsOpen = isOpen;
  if (isOpen) {
    startAlbumArtworkObserver();
  } else {
    stopAlbumArtworkObserver();
  }
}
let albumArtworkObserver = null;
function startAlbumArtworkObserver() {
  if (albumArtworkObserver) return;
  albumArtworkObserver = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.type === "attributes" && mutation.attributeName === "src") {
        updateAlbumArtwork();
      }
    });
  });
  const albumArtImg = document.querySelector('[data-testid="now-playing-widget"] img');
  if (albumArtImg) {
    albumArtworkObserver.observe(albumArtImg, { attributes: true });
  }
}
function stopAlbumArtworkObserver() {
  if (albumArtworkObserver) {
    albumArtworkObserver.disconnect();
    albumArtworkObserver = null;
  }
}
if (typeof window !== "undefined") {
  initializeElements();
}
const Utils$3 = {
  normalize(str) {
    if (!str) return "";
    return str.normalize("NFKC").replace(/[''""–]/g, "'").replace(/[\u2018-\u201F]/g, "'").replace(/[\u3000-\u303F]/g, "").replace(/[^\w\s\-\.&!']/g, "").replace(/\s{2,}/g, " ").trim();
  },
  removeExtraInfo(str) {
    return str.replace(/\(.*?\)|\[.*?]|\{.*?}/g, "").trim();
  },
  removeSongFeat(str) {
    return str.replace(/\s*(?:feat\.?|ft\.?|featuring)\s+[^\-]+/i, "").trim();
  }
};
async function fetchLRCLIBLyrics(info) {
  const cleanTitle = Utils$3.removeExtraInfo(Utils$3.removeSongFeat(Utils$3.normalize(info.title)));
  const cleanArtist = Utils$3.removeExtraInfo(Utils$3.removeSongFeat(Utils$3.normalize(info.artist)));
  const searchURL = `https://lrclib.net/api/search?q=${encodeURIComponent(cleanTitle)} ${encodeURIComponent(cleanArtist)}`;
  const response = await fetch(searchURL);
  if (!response.ok) throw new Error("Cannot find track");
  const results = await response.json();
  if (!results || !results.length) throw new Error("No lyrics found");
  return results[0];
}
function lrclibGetSynced(result) {
  if (!result || !result.syncedLyrics) return null;
  const lines = result.syncedLyrics.split(/\r?\n/).map((line) => line.trim());
  const lyrics = lines.map((line) => {
    const match = line.match(/^\[(\d{2}):(\d{2})(?:\.(\d{2,3}))?]\s*(.*)$/);
    if (!match) return null;
    const min = Number(match[1]);
    const sec = Number(match[2]);
    const ms = match[3] ? Number(match[3].padEnd(3, "0")) : 0;
    return {
      text: match[4] || "",
      time: min * 6e4 + sec * 1e3 + ms,
      startTime: min * 6e4 + sec * 1e3 + ms
    };
  }).filter(Boolean);
  return lyrics.length ? lyrics : null;
}
function lrclibGetUnsynced(result) {
  if (!result || !result.plainLyrics) return null;
  const lines = result.plainLyrics.split(/\r?\n/).map((line) => line.trim());
  const lyrics = lines.filter((line) => line.length > 0).map((line) => ({ text: line }));
  return lyrics.length ? lyrics : null;
}
const LRCLIBProvider = {
  name: "LRCLIB",
  async findLyrics(info) {
    try {
      const data = await fetchLRCLIBLyrics(info);
      if (!data) {
        return { error: "No lyrics found for this track from LRCLIB" };
      }
      return data;
    } catch (e) {
      return { error: e.message || "LRCLIB fetch failed" };
    }
  },
  getSynced: lrclibGetSynced,
  getUnsynced: lrclibGetUnsynced
};
async function fetchSpotifyLyrics(info) {
  const savedToken = localStorage.getItem("spotifyUserToken");
  if (!savedToken) {
    throw new Error("Double click on the Spotify provider to set your user token");
  }
  if (!info.trackId) {
    throw new Error("Track ID not available");
  }
  const url = `https://spclient.wg.spotify.com/color-lyrics/v2/track/${info.trackId}`;
  const response = await fetch(url, {
    headers: {
      "Authorization": `Bearer ${savedToken}`,
      "Accept": "application/json"
    }
  });
  if (!response.ok) {
    if (response.status === 401) {
      throw new Error("Invalid Spotify token. Please update your token by double-clicking the Spotify provider.");
    }
    throw new Error(`Spotify API error: ${response.status}`);
  }
  const data = await response.json();
  if (!data || !data.lyrics) {
    throw new Error("No lyrics found");
  }
  return data;
}
function spotifyGetSynced(result) {
  if (!result || !result.lyrics || !result.lyrics.lines) return null;
  const lines = result.lyrics.lines;
  if (!lines.length) return null;
  const firstLine = lines[0];
  if (!firstLine.startTimeMs || firstLine.startTimeMs === "0") {
    return null;
  }
  const lyrics = lines.map((line) => {
    const startTime = parseInt(line.startTimeMs, 10);
    if (isNaN(startTime)) return null;
    return {
      text: line.words || "",
      time: startTime,
      startTime
    };
  }).filter(Boolean);
  return lyrics.length ? lyrics : null;
}
function spotifyGetUnsynced(result) {
  if (!result || !result.lyrics || !result.lyrics.lines) return null;
  const lines = result.lyrics.lines;
  if (!lines.length) return null;
  const lyrics = lines.map((line) => ({
    text: line.words || ""
  })).filter((line) => line.text.trim().length > 0);
  return lyrics.length ? lyrics : null;
}
const SpotifyProvider = {
  name: "Spotify",
  async findLyrics(info) {
    try {
      const data = await fetchSpotifyLyrics(info);
      if (!data) {
        return { error: "No lyrics found for this track from Spotify" };
      }
      return data;
    } catch (e) {
      return { error: e.message || "Spotify fetch failed" };
    }
  },
  getSynced: spotifyGetSynced,
  getUnsynced: spotifyGetUnsynced
};
const Utils$2 = {
  normalize(str) {
    if (!str) return "";
    return str.normalize("NFKC").replace(/[''""–]/g, "'").replace(/[\u2018-\u201F]/g, "'").replace(/[\u3000-\u303F]/g, "").replace(/[^\w\s\-\.&!']/g, "").replace(/\s{2,}/g, " ").trim();
  },
  removeExtraInfo(str) {
    return str.replace(/\(.*?\)|\[.*?]|\{.*?}/g, "").trim();
  },
  removeSongFeat(str) {
    return str.replace(/\s*(?:feat\.?|ft\.?|featuring)\s+[^\-]+/i, "").trim();
  }
};
async function fetchKPoeLyrics(info) {
  const cleanTitle = Utils$2.removeExtraInfo(Utils$2.removeSongFeat(Utils$2.normalize(info.title)));
  const cleanArtist = Utils$2.removeExtraInfo(Utils$2.removeSongFeat(Utils$2.normalize(info.artist)));
  const searchURL = `https://kr.imelon.co/melon/search?query=${encodeURIComponent(cleanTitle)} ${encodeURIComponent(cleanArtist)}`;
  const response = await fetch(searchURL);
  if (!response.ok) throw new Error("Cannot find track");
  const data = await response.json();
  if (!data || !data.songs || !data.songs.length) {
    throw new Error("No lyrics found");
  }
  const song = data.songs[0];
  if (!song.lyricsId) {
    throw new Error("No lyrics available");
  }
  const lyricsURL = `https://kr.imelon.co/melon/lyrics/${song.lyricsId}`;
  const lyricsResponse = await fetch(lyricsURL);
  if (!lyricsResponse.ok) {
    throw new Error("Cannot fetch lyrics");
  }
  const lyricsData = await lyricsResponse.json();
  return lyricsData;
}
function kpoeGetSynced(result) {
  if (!result || !result.lyrics || !result.lyrics.syncedLyrics) return null;
  const lines = result.lyrics.syncedLyrics.split(/\r?\n/).map((line) => line.trim());
  const lyrics = lines.map((line) => {
    const match = line.match(/^\[(\d{2}):(\d{2})(?:\.(\d{2,3}))?]\s*(.*)$/);
    if (!match) return null;
    const min = Number(match[1]);
    const sec = Number(match[2]);
    const ms = match[3] ? Number(match[3].padEnd(3, "0")) : 0;
    return {
      text: match[4] || "",
      time: min * 6e4 + sec * 1e3 + ms,
      startTime: min * 6e4 + sec * 1e3 + ms
    };
  }).filter(Boolean);
  return lyrics.length ? lyrics : null;
}
function kpoeGetUnsynced(result) {
  if (!result || !result.lyrics) return null;
  let lyricsText = result.lyrics.unsyncedLyrics;
  if (!lyricsText && result.lyrics.syncedLyrics) {
    const lines2 = result.lyrics.syncedLyrics.split(/\r?\n/).map((line) => line.trim());
    const extractedLines = lines2.map((line) => {
      const match = line.match(/^\[(\d{2}):(\d{2})(?:\.(\d{2,3}))?]\s*(.*)$/);
      return match ? match[4] : line;
    }).filter((line) => line.length > 0);
    lyricsText = extractedLines.join("\n");
  }
  if (!lyricsText) return null;
  const lines = lyricsText.split(/\r?\n/).map((line) => line.trim());
  const lyrics = lines.filter((line) => line.length > 0).map((line) => ({ text: line }));
  return lyrics.length ? lyrics : null;
}
const KPoeProvider = {
  name: "KPoe",
  async findLyrics(info) {
    try {
      const data = await fetchKPoeLyrics(info);
      if (!data) {
        return { error: "No lyrics found for this track from KPoe" };
      }
      return data;
    } catch (e) {
      return { error: e.message || "KPoe fetch failed" };
    }
  },
  getSynced: kpoeGetSynced,
  getUnsynced: kpoeGetUnsynced
};
const Utils$1 = {
  normalize(str) {
    if (!str) return "";
    return str.normalize("NFKC").replace(/[''""–]/g, "'").replace(/[\u2018-\u201F]/g, "'").replace(/[\u3000-\u303F]/g, "").replace(/[^\w\s\-\.&!']/g, "").replace(/\s{2,}/g, " ").trim();
  },
  removeExtraInfo(str) {
    return str.replace(/\(.*?\)|\[.*?]|\{.*?}/g, "").trim();
  },
  removeSongFeat(str) {
    return str.replace(/\s*(?:feat\.?|ft\.?|featuring)\s+[^\-]+/i, "").trim();
  }
};
async function fetchMusixmatchLyrics(info) {
  const savedToken = localStorage.getItem("musixmatchUserToken");
  if (!savedToken) {
    throw new Error("Double click on the Musixmatch provider to set your user token");
  }
  const cleanTitle = Utils$1.removeExtraInfo(Utils$1.removeSongFeat(Utils$1.normalize(info.title)));
  const cleanArtist = Utils$1.removeExtraInfo(Utils$1.removeSongFeat(Utils$1.normalize(info.artist)));
  const searchURL = `https://apic-desktop.musixmatch.com/ws/1.1/macro.subtitles.get?format=json&namespace=lyrics_richsynced&subtitle_format=mxm&app_id=web-desktop-app-v1.0&usertoken=${savedToken}&q_track=${encodeURIComponent(cleanTitle)}&q_artist=${encodeURIComponent(cleanArtist)}`;
  const response = await fetch(searchURL);
  if (!response.ok) {
    if (response.status === 401) {
      throw new Error("Invalid Musixmatch token. Please update your token by double-clicking the Musixmatch provider.");
    }
    throw new Error(`Musixmatch API error: ${response.status}`);
  }
  const data = await response.json();
  if (!data || !data.message || !data.message.body) {
    throw new Error("No lyrics found");
  }
  return data.message.body;
}
function musixmatchGetSynced(result) {
  if (!result || !result.macro_calls) return null;
  const lyricsCall = result.macro_calls["track.lyrics.get"];
  if (!lyricsCall || !lyricsCall.message || !lyricsCall.message.body) return null;
  const lyricsBody = lyricsCall.message.body.lyrics;
  if (!lyricsBody || !lyricsBody.lyrics_body) return null;
  const lyricsText = lyricsBody.lyrics_body;
  if (!lyricsText.includes("[")) return null;
  const lines = lyricsText.split(/\r?\n/).map((line) => line.trim());
  const lyrics = lines.map((line) => {
    const match = line.match(/^\[(\d{2}):(\d{2})(?:\.(\d{2,3}))?]\s*(.*)$/);
    if (!match) return null;
    const min = Number(match[1]);
    const sec = Number(match[2]);
    const ms = match[3] ? Number(match[3].padEnd(3, "0")) : 0;
    return {
      text: match[4] || "",
      time: min * 6e4 + sec * 1e3 + ms,
      startTime: min * 6e4 + sec * 1e3 + ms
    };
  }).filter(Boolean);
  return lyrics.length ? lyrics : null;
}
function musixmatchGetUnsynced(result) {
  if (!result || !result.macro_calls) return null;
  const lyricsCall = result.macro_calls["track.lyrics.get"];
  if (!lyricsCall || !lyricsCall.message || !lyricsCall.message.body) return null;
  const lyricsBody = lyricsCall.message.body.lyrics;
  if (!lyricsBody || !lyricsBody.lyrics_body) return null;
  const lyricsText = lyricsBody.lyrics_body;
  let cleanLyrics = lyricsText;
  if (lyricsText.includes("[")) {
    const lines2 = lyricsText.split(/\r?\n/).map((line) => line.trim());
    cleanLyrics = lines2.map((line) => {
      const match = line.match(/^\[(\d{2}):(\d{2})(?:\.(\d{2,3}))?]\s*(.*)$/);
      return match ? match[4] : line;
    }).filter((line) => line.length > 0).join("\n");
  }
  if (!cleanLyrics) return null;
  const lines = cleanLyrics.split(/\r?\n/).map((line) => line.trim());
  const lyrics = lines.filter((line) => line.length > 0).map((line) => ({ text: line }));
  return lyrics.length ? lyrics : null;
}
const MusixmatchProvider = {
  name: "Musixmatch",
  async findLyrics(info) {
    try {
      const data = await fetchMusixmatchLyrics(info);
      if (!data) {
        return { error: "No lyrics found for this track from Musixmatch" };
      }
      return data;
    } catch (e) {
      return { error: e.message || "Musixmatch fetch failed" };
    }
  },
  getSynced: musixmatchGetSynced,
  getUnsynced: musixmatchGetUnsynced
};
const Utils = {
  normalize(str) {
    if (!str) return "";
    return str.normalize("NFKC").replace(/[''""–]/g, "'").replace(/[\u2018-\u201F]/g, "'").replace(/[\u3000-\u303F]/g, "").replace(/[^\w\s\-\.&!']/g, "").replace(/\s{2,}/g, " ").trim();
  },
  removeExtraInfo(str) {
    return str.replace(/\(.*?\)|\[.*?]|\{.*?}/g, "").trim();
  },
  removeSongFeat(str) {
    return str.replace(/\s*(?:feat\.?|ft\.?|featuring)\s+[^\-]+/i, "").trim();
  }
};
function cleanQuery(title) {
  return title.replace(/\b(remastered|explicit|deluxe|live|version|edit|remix|radio edit|radio|bonus track|bonus|special edition|expanded|edition)\b/gi, "").replace(/\b(radio|spotify|lyrics|calendar|release|singles|top|annotated|playlist)\b/gi, "").replace(/\b\d{4}\b/g, "").replace(/[-–—]+$/g, "").replace(/\s+/g, " ").trim();
}
function normalize(str) {
  return str.toLowerCase().replace(/[^a-z0-9]/gi, "");
}
function normalizeArtists(artist) {
  return artist.toLowerCase().split(/,|&|feat|ft|and|\band\b/gi).map((s) => s.trim()).filter(Boolean).map(normalize);
}
function extractFeaturedArtistsFromTitle(title) {
  const matches = title.match(/\((?:feat\.?|ft\.?|with)\s+([^)]+)\)/i);
  if (!matches) return [];
  return matches[1].split(/,|&|and/).map((s) => normalize(s.trim()));
}
const translationKeywords = [
  "translation",
  "übersetzung",
  "перевод",
  "çeviri",
  "traducción",
  "traduções",
  "traduction",
  "traductions",
  "traduzione",
  "traducciones-al-espanol",
  "fordítás",
  "fordítások",
  "tumaczenie",
  "tłumaczenie",
  "polskie tłumaczenie",
  "magyar fordítás",
  "turkce çeviri",
  "russian translations",
  "deutsche übersetzung",
  "genius users",
  "fan",
  "fans",
  "official translation",
  "genius russian translations",
  "genius deutsche übersetzungen",
  "genius türkçe çeviriler",
  "polskie tłumaczenia genius",
  "genius magyar fordítások",
  "genius traducciones al espanol",
  "genius traduzioni italiane",
  "genius traductions françaises",
  "genius turkce ceviriler"
];
function containsTranslationKeyword(s) {
  if (!s) return false;
  const lower = s.toLowerCase();
  return translationKeywords.some((k) => lower.includes(k));
}
function isTranslationPage(result) {
  var _a;
  return containsTranslationKeyword((_a = result.primary_artist) == null ? void 0 : _a.name) || containsTranslationKeyword(result.title) || containsTranslationKeyword(result.url);
}
async function fetchGeniusLyrics(info) {
  var _a, _b, _c;
  console.log("[Genius] Starting fetchGeniusLyrics");
  const titles = /* @__PURE__ */ new Set([
    info.title,
    Utils.removeExtraInfo(info.title),
    Utils.removeSongFeat(info.title),
    Utils.removeSongFeat(Utils.removeExtraInfo(info.title))
  ]);
  const maxPages = 5;
  for (const title of titles) {
    const cleanTitle = cleanQuery(title);
    for (let page = 1; page <= maxPages; page++) {
      const query = encodeURIComponent(`${info.artist} ${cleanTitle}`);
      const url = `https://genius.com/api/search/multi?per_page=20&page=${page}&q=${query}`;
      try {
        const response = await fetch(url);
        if (!response.ok) continue;
        const data = await response.json();
        const results = ((_c = (_b = (_a = data.response) == null ? void 0 : _a.sections) == null ? void 0 : _b.find((s) => s.type === "song")) == null ? void 0 : _c.hits) || [];
        if (!results.length) continue;
        const normalizedInputTitle = normalize(cleanTitle);
        const normalizedInputArtists = normalizeArtists(info.artist);
        const featuredArtists = extractFeaturedArtistsFromTitle(info.title);
        const scoredResults = results.map((hit) => {
          var _a2;
          const result = hit.result;
          if (!result || isTranslationPage(result)) return null;
          const normalizedResultTitle = normalize(result.title || "");
          const normalizedResultArtists = normalizeArtists(((_a2 = result.primary_artist) == null ? void 0 : _a2.name) || "");
          let score = 0;
          if (normalizedResultTitle === normalizedInputTitle) {
            score += 10;
          } else if (normalizedResultTitle.includes(normalizedInputTitle) || normalizedInputTitle.includes(normalizedResultTitle)) {
            score += 8;
          } else if (normalizedResultTitle.startsWith(normalizedInputTitle) || normalizedInputTitle.startsWith(normalizedResultTitle)) {
            score += 6;
          }
          const artistOverlap = normalizedInputArtists.filter((a) => normalizedResultArtists.includes(a));
          if (artistOverlap.length > 0) {
            score += artistOverlap.length * 5;
          }
          if (featuredArtists.length > 0) {
            const featOverlap = featuredArtists.filter((a) => normalizedResultArtists.includes(a));
            if (featOverlap.length > 0) {
              score += featOverlap.length * 3;
            }
          }
          return { result, score };
        }).filter(Boolean).sort((a, b) => b.score - a.score);
        for (const { result } of scoredResults.slice(0, 3)) {
          try {
            const lyricsUrl = `https://genius.com${result.path}`;
            const lyricsResponse = await fetch(lyricsUrl);
            if (!lyricsResponse.ok) continue;
            const html = await lyricsResponse.text();
            const lyricsMatch = html.match(/<div[^>]*data-lyrics-container="true"[^>]*>([\s\S]*?)<\/div>/);
            if (!lyricsMatch) continue;
            let lyricsHtml = lyricsMatch[1];
            lyricsHtml = lyricsHtml.replace(/<br[^>]*>/gi, "\n").replace(/<[^>]*>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim();
            if (lyricsHtml) {
              return { lyrics: lyricsHtml, url: lyricsUrl };
            }
          } catch (e) {
            console.log("[Genius] Error fetching lyrics:", e);
            continue;
          }
        }
      } catch (e) {
        console.log("[Genius] Search error:", e);
        continue;
      }
    }
  }
  throw new Error("No lyrics found on Genius");
}
function geniusGetSynced(result) {
  return null;
}
function geniusGetUnsynced(result) {
  if (!result || !result.lyrics) return null;
  const lines = result.lyrics.split(/\r?\n/).map((line) => line.trim());
  const lyrics = lines.filter((line) => line.length > 0).map((line) => ({ text: line }));
  return lyrics.length ? lyrics : null;
}
const GeniusProvider = {
  name: "Genius",
  async findLyrics(info) {
    try {
      const data = await fetchGeniusLyrics(info);
      if (!data) {
        return { error: "No lyrics found for this track from Genius" };
      }
      return data;
    } catch (e) {
      return { error: e.message || "Genius fetch failed" };
    }
  },
  getSynced: geniusGetSynced,
  getUnsynced: geniusGetUnsynced
};
class ProviderManagerImpl {
  constructor() {
    this.currentProvider = null;
    this.autoDetectionOrder = [
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
    this.providers = /* @__PURE__ */ new Map();
    this.initializeProviders();
  }
  initializeProviders() {
    const providerList = [
      LRCLIBProvider,
      SpotifyProvider,
      KPoeProvider,
      MusixmatchProvider,
      GeniusProvider
    ];
    providerList.forEach((provider) => {
      this.providers.set(provider.name, provider);
    });
    this.currentProvider = "LRCLIB";
  }
  getCurrent() {
    if (!this.currentProvider) return null;
    return this.providers.get(this.currentProvider) || null;
  }
  setCurrent(name) {
    if (this.providers.has(name)) {
      this.currentProvider = name;
    }
  }
  getProviderList() {
    return Array.from(this.providers.keys());
  }
  /**
   * Auto-detect the best provider for the given track
   * Uses the same logic as the userscript - tries providers in order until one succeeds
   */
  async autoDetectAndLoad(info) {
    console.log("[ProviderManager] Auto-detecting provider for:", info.title, "by", info.artist);
    for (const { name, type } of this.autoDetectionOrder) {
      const provider = this.providers.get(name);
      if (!provider) continue;
      try {
        console.log(`[ProviderManager] Trying ${name} (${type})`);
        const result = await provider.findLyrics(info);
        if (result && !result.error) {
          let lyrics = null;
          if (type === "getSynced") {
            lyrics = provider.getSynced(result);
          } else {
            lyrics = provider.getUnsynced(result);
          }
          if (lyrics && lyrics.length > 0) {
            console.log(`[ProviderManager] Successfully found lyrics with ${name} (${type})`);
            this.setCurrent(name);
            return {
              provider: name,
              synced: type === "getSynced" ? lyrics : null,
              unsynced: type === "getUnsynced" ? lyrics : null,
              trackInfo: info
            };
          }
        }
      } catch (error) {
        console.log(`[ProviderManager] ${name} failed:`, error);
        continue;
      }
    }
    console.log("[ProviderManager] No lyrics found from any provider");
    this.currentProvider = null;
    return null;
  }
  /**
   * Get lyrics from a specific provider
   */
  async getSpecificProvider(name, info) {
    const provider = this.providers.get(name);
    if (!provider) return null;
    try {
      const result = await provider.findLyrics(info);
      if (result && !result.error) {
        const synced = provider.getSynced(result);
        const unsynced = provider.getUnsynced(result);
        if (synced && synced.length > 0 || unsynced && unsynced.length > 0) {
          return {
            provider: name,
            synced,
            unsynced,
            trackInfo: info
          };
        }
      }
    } catch (error) {
      console.log(`[ProviderManager] ${name} failed:`, error);
    }
    return null;
  }
}
const providerManager = new ProviderManagerImpl();
function getCurrentTrackId() {
  const contextLink = document.querySelector('a[data-testid="context-link"][data-context-item-type="track"][href*="uri=spotify%3Atrack%3A"]');
  if (contextLink) {
    const href = contextLink.getAttribute("href");
    if (href) {
      const match = decodeURIComponent(href).match(/spotify:track:([a-zA-Z0-9]{22})/);
      if (match) return match[1];
    }
  }
  return null;
}
function getCurrentTrackInfo() {
  var _a, _b;
  const titleEl = document.querySelector('[data-testid="context-item-info-title"]');
  const artistEl = document.querySelector('[data-testid="context-item-info-subtitles"]');
  const durationEl = document.querySelector('[data-testid="playback-duration"]');
  const trackId = getCurrentTrackId();
  if (!titleEl || !artistEl) return null;
  const title = ((_a = titleEl.textContent) == null ? void 0 : _a.trim()) || "";
  const artist = ((_b = artistEl.textContent) == null ? void 0 : _b.trim()) || "";
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
function timeStringToMs(str) {
  const parts = str.split(":").map((p) => parseInt(p, 10));
  if (parts.length === 2) return (parts[0] * 60 + parts[1]) * 1e3;
  if (parts.length === 3) return (parts[0] * 3600 + parts[1] * 60 + parts[2]) * 1e3;
  return 0;
}
const PAUSE_WORDS = [
  "pause",
  "pausa",
  "pausar",
  "pause",
  "pauzë",
  "pauzoj",
  "pausar",
  "pauzou",
  "pauzar",
  "pausar",
  "pauziranje",
  "пауза",
  "пауза",
  "пауза",
  "пауза",
  "пауза",
  "пауза",
  "пауза",
  "пауза",
  "пауза",
  "пауза",
  "пауза",
  "пауза",
  "暂停",
  "暂停",
  "暂停",
  "暂停",
  "暂停",
  "暂停",
  "暂停",
  "暂停",
  "暂停",
  "일시정지",
  "일시정지",
  "일시정지",
  "일시정지",
  "일시정지",
  "일시정지",
  "일시정지",
  "توقف",
  "توقف",
  "توقف",
  "توقف",
  "توقف",
  "توقف",
  "توقف",
  "توقف",
  "休止",
  "休止",
  "休止",
  "休止",
  "休止",
  "休止",
  "休止",
  "休止"
];
const PLAY_WORDS = [
  "play",
  "reproducir",
  "jouer",
  "spela",
  "tocar",
  "reproducir",
  "afspelen",
  "reproducir",
  "riproduci",
  "játszás",
  "spill",
  "graj",
  "play",
  "hrať",
  "spielen",
  "воспроизвести",
  "воспроизвести",
  "воспроизвести",
  "воспроизвести",
  "播放",
  "播放",
  "播放",
  "播放",
  "播放",
  "播放",
  "播放",
  "播放",
  "재생",
  "재생",
  "재생",
  "재생",
  "재생",
  "재생",
  "재생",
  "재생",
  "تشغيل",
  "تشغيل",
  "تشغيل",
  "تشغيل",
  "تشغيل",
  "تشغيل",
  "تشغيل",
  "再生",
  "再生",
  "再生",
  "再生",
  "再生",
  "再生",
  "再生",
  "再생"
];
function labelMeansPause(label) {
  return PAUSE_WORDS.some((word) => label.includes(word));
}
function labelMeansPlay(label) {
  return PLAY_WORDS.some((word) => label.includes(word));
}
function isSpotifyPlaying() {
  let playPauseBtn = document.querySelector('[data-testid="control-button-playpause"]');
  if (!playPauseBtn) {
    playPauseBtn = document.querySelector("[aria-label]");
  }
  function isVisible(el) {
    if (!el) return false;
    const style = window.getComputedStyle(el);
    return el.offsetParent !== null && style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0";
  }
  if (playPauseBtn && isVisible(playPauseBtn)) {
    const label = (playPauseBtn.getAttribute("aria-label") || "").toLowerCase();
    if (labelMeansPause(label)) return true;
    if (labelMeansPlay(label)) return false;
  }
  const audio = document.querySelector("audio");
  if (audio) return !audio.paused;
  return false;
}
class SharedData {
  constructor() {
    this._trackInfo = null;
    this._lyricsData = null;
    this._lyrics = [];
    this._highlightLyrics = [];
    this._error = null;
    this._abortController = new AbortController();
    this._pollingInterval = null;
  }
  get lyrics() {
    return this._lyrics;
  }
  get highlightLyrics() {
    return this._highlightLyrics;
  }
  get error() {
    return this._error;
  }
  get trackInfo() {
    return this._trackInfo;
  }
  get lyricsData() {
    return this._lyricsData;
  }
  get currentProvider() {
    return providerManager.currentProvider;
  }
  _cancelRequest() {
    this._abortController.abort();
    this._abortController = new AbortController();
  }
  _resetLyrics() {
    this._lyrics = [];
    this._error = null;
    this._lyricsData = null;
    this._cancelRequest();
  }
  resetData() {
    this._resetLyrics();
    this._trackInfo = null;
    this._highlightLyrics = [];
  }
  /**
   * Auto-detect provider and load lyrics for current track
   */
  async autoDetectAndLoadLyrics() {
    const trackInfo = getCurrentTrackInfo();
    if (!trackInfo) {
      this.resetData();
      return;
    }
    if (this._trackInfo && this._trackInfo.id === trackInfo.id) {
      return;
    }
    console.log("[SharedData] Track changed, loading lyrics for:", trackInfo.title, "by", trackInfo.artist);
    this._trackInfo = trackInfo;
    this._resetLyrics();
    try {
      const lyricsData = await providerManager.autoDetectAndLoad(trackInfo);
      if (lyricsData) {
        this._lyricsData = lyricsData;
        if (lyricsData.synced && lyricsData.synced.length > 0) {
          this._lyrics = lyricsData.synced;
        } else if (lyricsData.unsynced && lyricsData.unsynced.length > 0) {
          this._lyrics = lyricsData.unsynced;
        } else {
          this._lyrics = null;
        }
        console.log(`[SharedData] Loaded lyrics from ${lyricsData.provider}`);
      } else {
        this._lyrics = null;
        console.log("[SharedData] No lyrics found");
      }
    } catch (error) {
      if (error instanceof Error && error.name !== "AbortError") {
        this._error = error;
        console.error("[SharedData] Error loading lyrics:", error);
      }
    }
    this.sendToContentScript();
  }
  /**
   * Load lyrics from a specific provider
   */
  async loadFromProvider(providerName) {
    if (!this._trackInfo) return;
    this._resetLyrics();
    try {
      const lyricsData = await providerManager.getSpecificProvider(providerName, this._trackInfo);
      if (lyricsData) {
        this._lyricsData = lyricsData;
        providerManager.setCurrent(providerName);
        if (lyricsData.synced && lyricsData.synced.length > 0) {
          this._lyrics = lyricsData.synced;
        } else if (lyricsData.unsynced && lyricsData.unsynced.length > 0) {
          this._lyrics = lyricsData.unsynced;
        } else {
          this._lyrics = null;
        }
        console.log(`[SharedData] Loaded lyrics from ${lyricsData.provider}`);
      } else {
        this._lyrics = null;
        this._error = new Error(`No lyrics found from ${providerName}`);
      }
    } catch (error) {
      if (error instanceof Error && error.name !== "AbortError") {
        this._error = error;
        console.error(`[SharedData] Error loading lyrics from ${providerName}:`, error);
      }
    }
    this.sendToContentScript();
  }
  /**
   * Start polling for track changes
   */
  startPolling() {
    if (this._pollingInterval) return;
    this._pollingInterval = setInterval(() => {
      this.autoDetectAndLoadLyrics();
    }, 1e3);
    this.autoDetectAndLoadLyrics();
  }
  /**
   * Stop polling for track changes
   */
  stopPolling() {
    if (this._pollingInterval) {
      clearInterval(this._pollingInterval);
      this._pollingInterval = null;
    }
  }
  /**
   * Send track and lyrics data to content script (for popup communication)
   */
  sendToContentScript() {
    var _a;
    const providers = providerManager.getProviderList();
    const currentProvider = providerManager.currentProvider;
    const message = {
      type: "LYRICS_DATA_UPDATE",
      data: {
        trackInfo: this._trackInfo,
        lyricsData: this._lyricsData,
        providers,
        currentProvider,
        error: ((_a = this._error) == null ? void 0 : _a.message) || null
      }
    };
    window.postMessage(message, "*");
  }
  /**
   * Get available providers
   */
  getProviders() {
    return providerManager.getProviderList();
  }
  /**
   * Check if lyrics are synced (have timing information)
   */
  isSynced() {
    return this._lyrics !== null && this._lyrics.length > 0 && this._lyrics[0].time !== void 0 && this._lyrics[0].time !== null;
  }
  /**
   * Get current playback position for highlighting
   */
  getCurrentLyricIndex() {
    if (!this._lyrics || !this.isSynced()) return -1;
    const positionEl = document.querySelector('[data-testid="playback-position"]');
    if (!positionEl) return -1;
    const currentTime = this._parseTimeString(positionEl.textContent || "0:00");
    const anticipationOffset = Number(localStorage.getItem("lyricsPlusAnticipationOffset") || 1e3);
    const anticipatedTime = currentTime + anticipationOffset;
    let activeIndex = -1;
    for (let i = 0; i < this._lyrics.length; i++) {
      const lyricTime = this._lyrics[i].time || this._lyrics[i].startTime || 0;
      if (anticipatedTime >= lyricTime) {
        activeIndex = i;
      } else {
        break;
      }
    }
    return activeIndex;
  }
  _parseTimeString(timeString) {
    const parts = timeString.split(":").map((p) => parseInt(p, 10));
    if (parts.length === 2) {
      return (parts[0] * 60 + parts[1]) * 1e3;
    }
    if (parts.length === 3) {
      return (parts[0] * 3600 + parts[1] * 60 + parts[2]) * 1e3;
    }
    return 0;
  }
}
const sharedData = new SharedData();
const defaultOptions = {
  "font-family": "Arial",
  "font-size": "32",
  "lyrics-align": "center",
  "only-cover": "off",
  "hd-cover": "off",
  "clean-lyrics": "on",
  "lyrics-transform": "Original",
  "use-unreviewed-lyrics": "off",
  "lyrics-server": "LRCLIB",
  "cid": "spotify-web-lyrics-plus"
};
const defaultI18nMap = {
  pageTipError: "Error loading lyrics",
  pageTipNoLyrics: "No lyrics found",
  pageTipLoading: "Loading lyrics...",
  pageTipWaiting: "Waiting for track..."
};
class OptionsManager {
  constructor() {
    this.options = { ...defaultOptions };
    this.i18nMap = { ...defaultI18nMap };
    this.loadOptions();
  }
  loadOptions() {
    try {
      const stored = localStorage.getItem("spotify-lyrics-plus-options");
      if (stored) {
        const parsed = JSON.parse(stored);
        this.options = { ...defaultOptions, ...parsed };
      }
    } catch (e) {
      console.error("Failed to load options:", e);
    }
  }
  saveOptions() {
    try {
      localStorage.setItem("spotify-lyrics-plus-options", JSON.stringify(this.options));
    } catch (e) {
      console.error("Failed to save options:", e);
    }
  }
  get() {
    return {
      ...this.options,
      i18nMap: this.i18nMap
    };
  }
  set(key, value) {
    this.options[key] = value;
    this.saveOptions();
  }
  getOption(key) {
    return this.options[key];
  }
  setI18nMap(map) {
    this.i18nMap = { ...this.i18nMap, ...map };
  }
  reset() {
    this.options = { ...defaultOptions };
    this.saveOptions();
  }
}
const optionsManager = new OptionsManager();
const optionsPromise = Promise.resolve(optionsManager.get());
const Event = {
  TOGGLE: "TOGGLE",
  GET_SONGS: "GET_SONGS",
  SELECT_SONG: "SELECT_SONG",
  CONFIRMED_SONG: "CONFIRMED_SONG",
  PROVIDER_CHANGE: "PROVIDER_CHANGE"
};
const tick = async (options) => {
  const audio = await getCurrentAudio();
  const i18nMap = options.i18nMap;
  const isOnlyCover = options["only-cover"] === "on";
  const isHDCover = options["hd-cover"] === "on";
  const isSmoothScroll = true;
  const { error, lyrics, highlightLyrics } = sharedData;
  const backgroundImage = isOnlyCover || isHDCover ? coverHDCanvas : coverCanvas;
  const textOptions = {
    backgroundImage,
    fontFamily: options["font-family"]
  };
  const renderOptions = {
    backgroundImage,
    focusLineFontSize: Number(options["font-size"]),
    align: options["lyrics-align"],
    smooth: isSmoothScroll,
    fontFamily: options["font-family"]
  };
  if (isOnlyCover) {
    drawBackground(lyricCtx, backgroundImage);
  } else {
    if (error) {
      drawText(lyricCtx, `${i18nMap.pageTipError}: ${error.message}`, {
        color: "red",
        ...textOptions
      });
    } else if (!lyrics && !highlightLyrics) {
      drawText(lyricCtx, i18nMap.pageTipNoLyrics, textOptions);
    } else if (audio.duration && (lyrics == null ? void 0 : lyrics.length)) {
      const currentTimeMs = audio.currentTime * 1e3;
      renderLyrics(lyricCtx, lyrics, currentTimeMs, renderOptions);
    } else if (!audio.duration || (lyrics == null ? void 0 : lyrics.length) === 0 || (highlightLyrics == null ? void 0 : highlightLyrics.length) === 0) {
      drawText(
        lyricCtx,
        audio.currentSrc ? i18nMap.pageTipLoading : i18nMap.pageTipWaiting,
        textOptions
      );
    } else if (!lyrics && (highlightLyrics == null ? void 0 : highlightLyrics.length)) {
      renderHighlight(lyricCtx, highlightLyrics, renderOptions);
    }
  }
  if (!isOnlyCover && isSmoothScroll && lyricVideoIsOpen && ((lyrics == null ? void 0 : lyrics.length) || (highlightLyrics == null ? void 0 : highlightLyrics.length))) {
    requestAnimationFrame(() => tick(options));
  } else {
    setTimeout(() => tick(options), 80);
  }
};
window.addEventListener("message", async ({ data }) => {
  if (!(data == null ? void 0 : data.type)) return;
  switch (data.type) {
    case Event.TOGGLE:
      setLyricVideoOpen(!lyricVideoIsOpen);
      if (lyricVideoIsOpen) {
        console.log("[Page] Lyrics view opened");
        sharedData.startPolling();
      } else {
        console.log("[Page] Lyrics view closed");
        sharedData.stopPolling();
      }
      break;
    case Event.GET_SONGS:
      return sharedData.sendToContentScript();
    case Event.SELECT_SONG:
      if (data.provider) {
        console.log("[Page] Switching to provider:", data.provider);
        await sharedData.loadFromProvider(data.provider);
      }
      break;
    case Event.PROVIDER_CHANGE:
      if (data.provider) {
        console.log("[Page] Provider changed to:", data.provider);
        await sharedData.loadFromProvider(data.provider);
      }
      break;
    case Event.CONFIRMED_SONG:
      return;
    default:
      return;
  }
});
function initializeLyricsButton() {
  if (document.querySelector("#spotify-lyrics-plus-btn")) return;
  const controlsContainer = document.querySelector('[data-testid="player-controls"]');
  if (!controlsContainer) return;
  const button = document.createElement("button");
  button.id = "spotify-lyrics-plus-btn";
  button.innerHTML = "🎵";
  button.title = "Spotify Lyrics Plus";
  button.style.cssText = `
    background: none;
    border: none;
    color: #b3b3b3;
    font-size: 18px;
    cursor: pointer;
    padding: 8px;
    margin: 0 4px;
    border-radius: 4px;
    transition: color 0.2s;
  `;
  button.addEventListener("mouseenter", () => {
    button.style.color = "#ffffff";
  });
  button.addEventListener("mouseleave", () => {
    button.style.color = lyricVideoIsOpen ? "#1db954" : "#b3b3b3";
  });
  button.addEventListener("click", () => {
    setLyricVideoIsOpen(!lyricVideoIsOpen);
    button.style.color = lyricVideoIsOpen ? "#1db954" : "#b3b3b3";
    window.postMessage({ type: Event.TOGGLE }, "*");
  });
  controlsContainer.appendChild(button);
}
function startUIObserver() {
  const observer = new MutationObserver(() => {
    initializeLyricsButton();
  });
  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
  initializeLyricsButton();
}
async function initialize() {
  console.log("[Page] Initializing Spotify Web Lyrics Plus");
  startUIObserver();
  const options = await optionsPromise;
  tick(options);
  console.log("[Page] Available providers:", providerManager.getProviderList());
  console.log("[Page] Initialization complete");
}
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initialize);
} else {
  initialize();
}
window.spotifyLyricsPlus = {
  sharedData,
  providerManager,
  setLyricVideoOpen,
  getCurrentTrackInfo,
  isSpotifyPlaying
};
