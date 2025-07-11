// Providers and lyrics fetching logic
// This file contains all the provider implementations from the userscript

const Utils = {
  normalize(str) {
    if (!str) return "";
    // Remove full-width/half-width, accents, etc.
    return str.normalize("NFKC")
      .replace(/[''""–]/g, "'")
      .replace(/[\u2018-\u201F]/g, "'")
      .replace(/[\u3000-\u303F]/g, "")
      .replace(/[^\w\s\-\.&!']/g, '')
      .replace(/\s{2,}/g, ' ')
      .trim();
  },
  removeExtraInfo(str) {
    return str.replace(/\(.*?\)|\[.*?]|\{.*?}/g, '').trim();
  },
  removeSongFeat(str) {
    // Remove "feat. ...", "ft. ...", etc.
    return str.replace(/\s*(?:feat\.?|ft\.?|featuring)\s+[^\-]+/i, '').trim();
  },
  containsHanCharacter(str) {
    return /[\u4e00-\u9fa5]/.test(str);
  },
  capitalize(str, lower = false) {
    if (!str) return '';
    return (lower ? str.toLowerCase() : str).replace(/(?:^|\s|["'([{])+\S/g, match => match.toUpperCase());
  },
  // (async) Convert Traditional to Simplified using openapi - fallback: identity
  async toSimplifiedChinese(str) {
    // This is a stub: since we don't have a real openapi, just return original string.
    // You can insert API for opencc or similar here if needed.
    return str;
  },
  parseLocalLyrics(plain) {
    if (!plain) return { unsynced: null, synced: null };
    const timeTagRegex = /\[(\d{1,2}):(\d{1,2})(?:\.(\d{1,3}))?\]/g;
    const synced = [];
    const unsynced = [];
    const lines = plain.split(/\r?\n/);
    for (const line of lines) {
      let matched = false;
      let lastIndex = 0;
      let text = line;
      const times = [];
      let m;
      while ((m = timeTagRegex.exec(line)) !== null) {
        matched = true;
        const min = parseInt(m[1], 10);
        const sec = parseInt(m[2], 10);
        const ms = m[3] ? parseInt(m[3].padEnd(3, '0'), 10) : 0;
        const time = min * 60000 + sec * 1000 + ms;
        times.push(time);
        lastIndex = m.index + m[0].length;
      }
      if (matched) {
        text = line.substring(lastIndex).trim();
        times.forEach(time => {
          synced.push({ time, text });
        });
      } else {
        if (line.trim().length > 0) {
          unsynced.push({ text: line.trim() });
        }
      }
    }
    synced.sort((a, b) => a.time - b.time);
    return {
      synced: synced.length > 0 ? synced : null,
      unsynced: unsynced.length > 0 ? unsynced : null
    };
  }
};

// LRCLIB Provider
async function fetchLRCLibLyrics(songInfo, tryWithoutAlbum = false) {
  const params = [
    `artist_name=${encodeURIComponent(songInfo.artist)}`,
    `track_name=${encodeURIComponent(songInfo.title)}`
  ];

  if (songInfo.album && !tryWithoutAlbum) {
    params.push(`album_name=${encodeURIComponent(songInfo.album)}`);
  }

  if (songInfo.duration && songInfo.duration >= 10000) {
    params.push(`duration=${Math.floor(songInfo.duration / 1000)}`);
  }

  const url = `https://lrclib.net/api/get?${params.join('&')}`;
  
  try {
    const response = await fetch(url, {
      headers: {
        "x-user-agent": "lyrics-plus-script"
      }
    });

    if (!response.ok) {
      return null;
    }

    return await response.json();
  } catch (e) {
    console.error("LRCLIB fetch error:", e);
    return null;
  }
}

const ProviderLRCLIB = {
  async findLyrics(info) {
    try {
      let data = await fetchLRCLibLyrics(info, false);
      if (!data || (!data.syncedLyrics && !data.plainLyrics)) {
        data = await fetchLRCLibLyrics(info, true);
      }
      if (!data) return { error: "No lyrics found for this track from LRCLIB" };
      return data;
    } catch (e) {
      return { error: e.message || "LRCLIB fetch failed" };
    }
  },
  getUnsynced(body) {
    if (body?.instrumental) return [{ text: "♪ Instrumental ♪" }];
    if (!body?.plainLyrics) return null;
    return Utils.parseLocalLyrics(body.plainLyrics).unsynced;
  },
  getSynced(body) {
    if (body?.instrumental) return [{ text: "♪ Instrumental ♪" }];
    if (!body?.syncedLyrics) return null;
    return Utils.parseLocalLyrics(body.syncedLyrics).synced;
  }
};

// Spotify Provider
const ProviderSpotify = {
  async findLyrics(info) {
    const token = localStorage.getItem("lyricsPlusSpotifyToken");
    console.log("[SpotifyLyrics+] Starting fetch:");
    console.log("[SpotifyLyrics+] TrackInfo:", info);

    if (!token) {
      console.warn("[SpotifyLyrics+] No Spotify user token found in localStorage.");
      return { error: "Double click on the Spotify provider to set up your token.\n" + "A fresh token is required every hour/upon page reload for security." };
    }

    if (!info.trackId) {
      console.warn("[SpotifyLyrics+] No trackId in song info:", info);
      return { error: "No lyrics found for this track from Spotify" };
    }

    const endpoint = `https://spclient.wg.spotify.com/color-lyrics/v2/track/${info.trackId}?format=json&vocalRemoval=false&market=from_token`;

    console.log("[SpotifyLyrics+] Using endpoint:", endpoint);

    try {
      console.log("[SpotifyLyrics+] Sending GET with token (first 12 chars):", token.slice(0,12)+"...");
      const res = await fetch(endpoint, {
        method: "GET",
        headers: {
          "app-platform": "WebPlayer",
          "User-Agent": navigator.userAgent,
          "Authorization": "Bearer " + token,
        },
      });

      console.log("[SpotifyLyrics+] API Response status:", res.status);

      if (!res.ok) {
        const text = await res.text();
        console.warn("[SpotifyLyrics+] Non-ok response:", res.status, text);

        if (res.status === 401) {
          return { error: "Double click on the Spotify provider and follow the instructions. Spotify requires a fresh token every hour/upon page reload for security." };
        }
        if (res.status === 404) {
          return { error: "No lyrics found for this track from Spotify" };
        }
        return { error: "No lyrics found for this track from Spotify" };
      }

      let data;
      try {
        data = await res.json();
        console.log("[SpotifyLyrics+] API Response JSON:", data);
      } catch (jsonErr) {
        const text = await res.text();
        console.error("[SpotifyLyrics+] Failed to parse JSON. Raw response:", text);
        return { error: "No lyrics found for this track from Spotify" };
      }

      // Adapt to your UI's expected data shape:
      if (!data || !data.lyrics || !data.lyrics.lines || !data.lyrics.lines.length) {
        console.warn("[SpotifyLyrics+] No lines in API response:", data);
        return { error: "No lyrics found for this track from Spotify" };
      }
      return data.lyrics;
    } catch (e) {
      console.error("[SpotifyLyrics+] Fetch error:", e);
      return { error: "No lyrics found for this track from Spotify" };
    }
  },

  getSynced(data) {
    console.log("[SpotifyLyrics+] getSynced called with:", data);
    if (Array.isArray(data.lines) && data.syncType === "LINE_SYNCED") {
      return data.lines.map(line => ({
        time: line.startTimeMs,
        text: line.words
      }));
    }
    return null;
  },

  getUnsynced(data) {
    console.log("[SpotifyLyrics+] getUnsynced called with:", data);
    // Accept both unsynced and fallback if lines exist
    if (Array.isArray(data.lines) && (data.syncType === "UNSYNCED" || data.syncType !== "LINE_SYNCED")) {
      return data.lines.map(line => ({ text: line.words }));
    }
    return null;
  },
};

// KPoe Provider
async function fetchKPoeLyrics(songInfo, sourceOrder = '', forceReload = false) {
  const albumParam = (songInfo.album && songInfo.album !== songInfo.title)
    ? `&album=${encodeURIComponent(songInfo.album)}`
    : '';
  const sourceParam = sourceOrder ? `&source=${encodeURIComponent(sourceOrder)}` : '';
  let forceReloadParam = forceReload ? `&forceReload=true` : '';
  let fetchOptions = {};
  if (forceReload) {
    fetchOptions = { cache: 'no-store' };
    forceReloadParam = `&forceReload=true`;
  }
  const url = `https://lyricsplus.prjktla.workers.dev/v2/lyrics/get?title=${encodeURIComponent(songInfo.title)}&artist=${encodeURIComponent(songInfo.artist)}${albumParam}&duration=${songInfo.duration}${sourceParam}${forceReloadParam}`;
  const response = await fetch(url, fetchOptions);
  if (!response.ok) return null;
  const data = await response.json();
  return data;
}

function parseKPoeFormat(data) {
  if (!Array.isArray(data.lyrics)) return null;
  const metadata = {
    ...data.metadata,
    source: `${data.metadata.source} (KPoe)`
  };
  return {
    type: data.type,
    data: data.lyrics.map(item => {
      const startTime = Number(item.time) || 0;
      const duration = Number(item.duration) || 0;
      const endTime = startTime + duration;
      const parsedSyllabus = (item.syllabus || []).map(syllable => ({
        text: syllable.text || '',
        time: Number(syllable.time) || 0,
        duration: Number(syllable.duration) || 0,
        isLineEnding: Boolean(syllable.isLineEnding),
        isBackground: Boolean(syllable.isBackground),
        element: syllable.element || {}
      }));
      return {
        text: item.text || '',
        startTime: startTime / 1000,
        duration: duration / 1000,
        endTime: endTime / 1000,
        syllabus: parsedSyllabus,
        element: item.element || {}
      };
    }),
    metadata
  };
}

const ProviderKPoe = {
  async findLyrics(info) {
    try {
      const artist = Utils.normalize(info.artist);
      const title = Utils.normalize(info.title);
      const album = Utils.normalize(info.album);
      const duration = Math.floor(info.duration / 1000);
      const songInfo = { artist, title, album, duration };
      const result = await fetchKPoeLyrics(songInfo);
      if (!result) return { error: "No lyrics found for this track from KPoe" };
      return parseKPoeFormat(result);
    } catch (e) {
      return { error: e.message || "KPoe fetch failed" };
    }
  },
  getUnsynced(body) {
    if (!body?.data || !Array.isArray(body.data)) return null;
    return body.data.map(line => ({
      text: line.text
    }));
  },
  getSynced(body) {
    if (!body?.data || !Array.isArray(body.data)) return null;
    return body.data.map(line => ({
      time: Math.round(line.startTime * 1000),
      text: line.text
    }));
  },
};

// Musixmatch Provider
async function fetchMusixmatchLyrics(songInfo) {
  const token = localStorage.getItem("lyricsPlusMusixmatchToken");
  if (!token) {
    return { error: "Double click on the Musixmatch provider to set up your token" };
  }

  // Step 1: Get track info
  const trackResponse = await fetch(
    `https://apic-desktop.musixmatch.com/ws/1.1/matcher.track.get?` +
      `q_track=${encodeURIComponent(songInfo.title)}&` +
      `q_artist=${encodeURIComponent(songInfo.artist)}&` +
      `format=json&usertoken=${encodeURIComponent(token)}&app_id=web-desktop-app-v1.0`,
    {
      headers: {
        'user-agent': navigator.userAgent,
        'referer': 'https://www.musixmatch.com/',
      },
      cache: 'no-store',
    }
  );
  if (!trackResponse.ok) return { error: "Track info request failed" };
  const trackBody = await trackResponse.json();
  const track = trackBody?.message?.body?.track;
  if (!track) return { error: "Track not found" };

  if (track.instrumental) {
    return { synced: [{ text: "♪ Instrumental ♪", time: 0 }] };
  }

  // Step 2: Fetch synced lyrics via subtitles.get
  const subtitleResponse = await fetch(
    `https://apic-desktop.musixmatch.com/ws/1.1/track.subtitles.get?` +
      `track_id=${track.track_id}&format=json&app_id=web-desktop-app-v1.0&usertoken=${encodeURIComponent(token)}`,
    {
      headers: {
        'user-agent': navigator.userAgent,
        'referer': 'https://www.musixmatch.com/',
      },
      cache: 'no-store',
    }
  );
  if (subtitleResponse.ok) {
    const subtitleBody = await subtitleResponse.json();
    const subtitleList = subtitleBody?.message?.body?.subtitle_list;
    if (subtitleList && subtitleList.length > 0) {
      const subtitleObj = subtitleList[0]?.subtitle;
      if (subtitleObj?.subtitle_body) {
        const synced = parseMusixmatchSyncedLyrics(subtitleObj.subtitle_body);
        if (synced.length > 0) return { synced };
      }
    }
  }

  // Step 3: fallback to unsynced lyrics
  const lyricsResponse = await fetch(
    `https://apic-desktop.musixmatch.com/ws/1.1/track.lyrics.get?` +
      `track_id=${track.track_id}&format=json&app_id=web-desktop-app-v1.0&usertoken=${encodeURIComponent(token)}`,
    {
      headers: {
        'user-agent': navigator.userAgent,
        'referer': 'https://www.musixmatch.com/',
      },
      cache: 'no-store',
    }
  );
  if (!lyricsResponse.ok) return { error: "Lyrics request failed" };
  const lyricsBody = await lyricsResponse.json();
  const unsyncedRaw = lyricsBody?.message?.body?.lyrics?.lyrics_body;
  if (unsyncedRaw) {
    const unsynced = unsyncedRaw.split("\n").map(line => ({ text: line }));
    return { unsynced };
  }

  return { error: "No lyrics found" };
}

function parseMusixmatchSyncedLyrics(subtitleBody) {
  // Split into lines
  const lines = subtitleBody.split(/\r?\n/);
  const synced = [];

  // Regex for [mm:ss.xx] or [mm:ss,xx]
  const timeRegex = /\[(\d{1,2}):(\d{2})([.,]\d{1,3})?\]/;

  for (const line of lines) {
    const match = line.match(timeRegex);
    if (match) {
      const min = parseInt(match[1], 10);
      const sec = parseInt(match[2], 10);
      const frac = match[3] ? parseFloat(match[3].replace(',', '.')) : 0;
      const timeMs = (min * 60 + sec + frac) * 1000;

      // Remove all timestamps (sometimes multiple) to get clean lyric text
      const text = line.replace(/\[(\d{1,2}):(\d{2})([.,]\d{1,3})?\]/g, '').trim();

      synced.push({ time: timeMs, text: text || '♪' });
    }
  }
  return synced;
}

// Extract synced lyrics from the fetchMusixmatchLyrics result
function musixmatchGetSynced(body) {
  if (!body || !body.synced) {
    console.log("No synced lyrics data found");
    return null;
  }
  console.log("Extracting synced lyrics, lines:", body.synced.length);
  return body.synced.map(line => ({
    text: line.text,
    time: Math.round(line.time ?? line.startTime ?? 0),
  }));
}

// Extract unsynced lyrics from the fetchMusixmatchLyrics result
function musixmatchGetUnsynced(body) {
  if (!body || !body.unsynced) {
    console.log("No unsynced lyrics data found");
    return null;
  }
  console.log("Extracting unsynced lyrics, lines:", body.unsynced.length);
  return body.unsynced.map(line => ({ text: line.text }));
}

const ProviderMusixmatch = {
  async findLyrics(info) {
    try {
      const data = await fetchMusixmatchLyrics(info);
      if (!data) {
        return { error: "No lyrics found for this track from Musixmatch" };
      }
      if (data.error) {
        // If the error is about missing token, show that instead
        if (data.error.includes("Double click on the Musixmatch provider")) {
          return { error: data.error };
        }
        return { error: "No lyrics found for this track from Musixmatch" };
      }
      return data;
    } catch (e) {
      return { error: e.message || "Musixmatch fetch failed" };
    }
  },
  getUnsynced: musixmatchGetUnsynced,
  getSynced: musixmatchGetSynced,
};

// Genius Provider
async function fetchGeniusLyrics(info) {
  console.log("[Genius] Starting fetchGeniusLyrics");

  const titles = new Set([
    info.title,
    Utils.removeExtraInfo(info.title),
    Utils.removeSongFeat(info.title),
    Utils.removeSongFeat(Utils.removeExtraInfo(info.title)),
  ]);
  console.log("[Genius] Titles to try:", Array.from(titles));

  function generateNthIndices(start = 1, step = 4, max = 25) {
    const arr = [];
    for (let i = start; i <= max; i += step) arr.push(i);
    return arr;
  }

  function cleanQuery(title) {
    return title
      .replace(/\b(remastered|explicit|deluxe|live|version|edit|remix|radio edit|radio|bonus track|bonus|special edition|expanded|edition)\b/gi, '')
      .replace(/\b(radio|spotify|lyrics|calendar|release|singles|top|annotated|playlist)\b/gi, '')
      .replace(/\b\d{4}\b/g, '')
      .replace(/[-–—]+$/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function normalize(str) {
    return str.toLowerCase().replace(/[^a-z0-9]/gi, '');
  }

  function normalizeArtists(artist) {
    return artist
      .toLowerCase()
      .split(/,|&|feat|ft|and|\band\b/gi)
      .map(s => s.trim())
      .filter(Boolean)
      .map(normalize);
  }

  function extractFeaturedArtistsFromTitle(title) {
    const matches = title.match(/\((?:feat\.?|ft\.?|with)\s+([^)]+)\)/i);
    if (!matches) return [];
    return matches[1].split(/,|&|and/).map(s => normalize(s.trim()));
  }

  function hasVersionKeywords(title) {
    // Covers single words and phrases (bonus track, deluxe edition, etc.)
    return /\b(remix|deluxe|version|edit|live|explicit|remastered|bonus track|bonus|edition|expanded|special edition)\b/i.test(title);
  }

  // True for translations, covers, etc (not original lyric pages!)
  const translationKeywords = [
    "translation", "übersetzung", "перевод", "çeviri", "traducción", "traduções", "traduction",
    "traductions", "traduzione", "traducciones-al-espanol", "fordítás", "fordítások", "tumaczenie",
    "tłumaczenie", "polskie tłumaczenie", "magyar fordítás", "turkce çeviri", "russian translations",
    "deutsche übersetzung", "genius users", "fan", "fans", "official translation", "genius russian translations",
    "genius deutsche übersetzungen", "genius türkçe çeviriler", "polskie tłumaczenia genius",
    "genius magyar fordítások", "genius traducciones al espanol", "genius traduzioni italiane",
    "genius traductions françaises", "genius turkce ceviriler",
  ];
  
  function containsTranslationKeyword(s) {
    if (!s) return false;
    const lower = s.toLowerCase();
    return translationKeywords.some(k => lower.includes(k));
  }
  
  function isTranslationPage(result) {
    return (
      containsTranslationKeyword(result.primary_artist?.name) ||
      containsTranslationKeyword(result.title) ||
      containsTranslationKeyword(result.url)
    );
  }
  
  function isSimpleOriginalUrl(url) {
    try {
      const path = new URL(url).pathname.toLowerCase();
      if (/^\/[a-z0-9-]+-lyrics$/.test(path)) return true;
      const parts = path.split('/').pop().split('-');
      if (parts.length >= 3 && parts.slice(-1)[0] === "lyrics") {
        if (parts.some(part => translationKeywords.some(k => part.includes(k)))) return false;
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  const includedNthIndices = generateNthIndices();
  console.log("[Genius] Included nth-of-type indices:", includedNthIndices);

  // Try up to 5 pages of results for each title variant
  const maxPages = 5;

  for (const title of titles) {
    const cleanTitle = cleanQuery(title);

    for (let page = 1; page <= maxPages; page++) {
      const query = encodeURIComponent(`${info.artist} ${cleanTitle}`);
      const searchUrl = `https://genius.com/api/search/multi?per_page=5&page=${page}&q=${query}`;

      console.log(`[Genius] Querying: ${info.artist} - ${cleanTitle} (page ${page})`);
      console.log(`[Genius] Search URL: ${searchUrl}`);

      try {
        const searchRes = await fetch(searchUrl, {
          headers: {
            Accept: "application/json",
            "User-Agent": navigator.userAgent,
          }
        });

        console.log("[Genius] Search response received");
        const searchJson = await searchRes.json();
        const hits = searchJson?.response?.sections?.flatMap(s => s.hits) || [];
        const songHits = hits.filter(h => h.type === "song");
        console.log(`[Genius] Found ${songHits.length} song hits`);

        for (const hit of songHits) {
          const result = hit.result;
          console.log(`- Candidate: Title="${result.title}", Artist="${result.primary_artist?.name}", URL=${result.url}`);
        }

        const targetArtists = new Set(normalizeArtists(info.artist));
        const targetTitleNorm = normalize(Utils.removeExtraInfo(info.title));
        const targetHasVersion = hasVersionKeywords(info.title);
        console.log("[Genius] Normalized target artist tokens:", Array.from(targetArtists));
        console.log("[Genius] Normalized target title:", targetTitleNorm);
        console.log("[Genius] Target title has version keywords:", targetHasVersion);

        let bestScore = -Infinity;
        let fallbackScore = -Infinity;
        let song = null;
        let fallbackSong = null;

        for (const hit of songHits) {
          const result = hit.result;
          // Only consider original (non-translation) Genius lyrics pages
          if (isTranslationPage(result) || !isSimpleOriginalUrl(result.url)) continue;

          const primary = normalizeArtists(result.primary_artist?.name || '');
          const featured = extractFeaturedArtistsFromTitle(result.title || '');
          const resultArtists = new Set([...primary, ...featured]);
          const resultTitleNorm = normalize(Utils.removeExtraInfo(result.title || ''));
          const resultHasVersion = hasVersionKeywords(result.title || '');

          console.log(`[Genius] → "${result.title}" primary artists:`, primary);
          console.log(`[Genius] → "${result.title}" featured from title:`, featured);

          // Artist overlap count
          let artistOverlapCount = 0;
          for (const a of targetArtists) {
            if (resultArtists.has(a)) artistOverlapCount++;
          }
          const totalArtists = targetArtists.size;
          const missingArtists = totalArtists - artistOverlapCount;

          let artistScore = 0;
          if (artistOverlapCount === 0) {
            artistScore = 0; // no artist overlap, reject later
          } else if (artistOverlapCount === totalArtists) {
            artistScore = 8; // perfect match
          } else if (artistOverlapCount >= totalArtists - 1) {
            artistScore = 7; // almost perfect
          } else if (artistOverlapCount >= 1) {
            // Partial match, soften penalty for missing artists due to incomplete metadata
            artistScore = 5 + artistOverlapCount; // partial boost
            artistScore -= missingArtists * 0.5;
          }

          for (const fa of featured) {
            if (targetArtists.has(fa) && !resultArtists.has(fa)) {
              artistScore += 1;
              console.log(`[Genius] Boosting artistScore: featured artist "${fa}" recovered from title`);
            }
          }

          if (artistScore < 3) {
            console.log(`[Genius] Candidate rejected due to low artist score (${artistScore})`);
            continue;
          }

          // Title scoring
          let titleScore = 0;
          if (resultTitleNorm === targetTitleNorm) {
            titleScore = 6;
          } else if (resultTitleNorm.includes(targetTitleNorm) || targetTitleNorm.includes(resultTitleNorm)) {
            titleScore = 4;
          } else {
            titleScore = 1;
          }

          // Version keywords adjustment
          if (targetHasVersion) {
            if (resultHasVersion) titleScore += 2;
            else titleScore -= 2;
          } else {
            if (!resultHasVersion) titleScore += 2;
            else titleScore -= 2;
          }

          let score = artistScore + titleScore;
          let penaltyLog = [];

          if (!resultTitleNorm.includes(targetTitleNorm)) {
            score -= 3;
            penaltyLog.push("-3 title not fully overlapping");
          }

          if (artistOverlapCount === 0) {
            score -= 5;
            penaltyLog.push("-5 no artist overlap");
          }

          console.log(`[Genius] Candidate "${result.title}":`);
          console.log(`  Artist Score: ${artistScore} (matched ${artistOverlapCount}/${totalArtists},${featured.map(f => targetArtists.has(f) && !resultArtists.has(f) ? ` +1 boost: ${f}` : '').filter(Boolean).join('')})`);
          console.log(`  Title Score: ${titleScore} (normed="${resultTitleNorm}" vs "${targetTitleNorm}", hasVer=${resultHasVersion})`);
          if (penaltyLog.length) {
            console.log(`  Penalties: ${penaltyLog.join(', ')}`);
          }
          console.log(`  Final Score: ${score}`);

          if (score > bestScore && (!targetHasVersion || resultHasVersion)) {
            bestScore = score;
            song = result;
            console.log(`[Genius] New best match: "${result.title}" with score ${bestScore}`);
          } else if (
            score > fallbackScore &&
            (!resultHasVersion || !targetHasVersion) &&
            score >= 6
          ) {
            fallbackScore = score;
            fallbackSong = result;
            console.log(`[Genius] New fallback candidate: "${result.title}" with score ${fallbackScore}`);
          }
        }

        if (!song && fallbackSong) {
          song = fallbackSong;
          bestScore = fallbackScore;
          console.log(`[Genius] Using fallback song: "${song.title}" with score ${bestScore}`);
        }

        if (bestScore < 6 || !song?.url) {
          console.log(`[Genius] Best match score too low (${bestScore}) or no URL found, skipping.`);
          continue;
        }

        console.log(`[Genius] Selected song URL: ${song.url}`);

        const htmlRes = await fetch(song.url, {
          headers: {
            Accept: "text/html",
            "User-Agent": navigator.userAgent,
          }
        });

        console.log("[Genius] Song page HTML received");
        const doc = new DOMParser().parseFromString(htmlRes.responseText, "text/html");

        const lyricsRoot = [...doc.querySelectorAll('div')].find(el =>
          [...el.classList].some(cls => cls.includes('Lyrics__Root'))
        );

        if (!lyricsRoot) {
          console.warn("[Genius] No .Lyrics__Root found");
          continue;
        }
        console.log("[Genius] .Lyrics__Root found");

        const containers = [...lyricsRoot.querySelectorAll('div')].filter(el =>
          [...el.classList].some(cls => cls.includes('Lyrics__Container'))
        );
        console.log(`[Genius] Found ${containers.length} .Lyrics__Container div(s)`);

        if (containers.length === 0) {
          console.warn("[Genius] No .Lyrics__Container found inside .Lyrics__Root");
          continue;
        }

        const relevantContainersSet = new Set();

        containers.forEach(container => {
          const parent = container.parentElement;
          const siblings = [...parent.children];
          const nthIndex = siblings.indexOf(container) + 1;

          if (includedNthIndices.includes(nthIndex)) {
            relevantContainersSet.add(container);
            console.log(`[Genius] Including container with nth-of-type ${nthIndex}`);
          }
        });

        containers.forEach(container => {
          if (relevantContainersSet.has(container)) return;

          const classList = [...container.classList].map(c => c.toLowerCase());
          const text = container.textContent.trim().toLowerCase();

          if (
            classList.some(cls =>
              cls.includes('header') ||
              cls.includes('readmore') ||
              cls.includes('annotation') ||
              cls.includes('credit') ||
              cls.includes('footer')
            ) ||
            !text || text.length < 10 ||
            text.includes('read more') || text.includes('lyrics') || text.includes('©')
          ) {
            return;
          }

          relevantContainersSet.add(container);
        });

        const relevantContainers = Array.from(relevantContainersSet);
        console.log(`[Genius] Using ${relevantContainers.length} relevant container(s)`);

        let lyrics = '';
        function walk(node) {
          for (const child of node.childNodes) {
            if (child.nodeType === Node.ELEMENT_NODE) {
              const classList = [...child.classList].map(c => c.toLowerCase());
              if (classList.some(cls =>
                cls.includes('header') ||
                cls.includes('readmore') ||
                cls.includes('annotation') ||
                cls.includes('credit') ||
                cls.includes('footer')
              )) continue;
            }

            if (child.nodeType === Node.TEXT_NODE) {
              lyrics += child.textContent;
            } else if (child.nodeName === "BR") {
              lyrics += "\n";
            } else if (child.nodeType === Node.ELEMENT_NODE) {
              walk(child);
              if (/div|p|section/i.test(child.nodeName)) lyrics += "\n";
            }
          }
        }

        relevantContainers.forEach(container => {
          walk(container);
          lyrics += "\n";
        });

        lyrics = lyrics.replace(/\n{2,}/g, "\n").trim();

        if (!lyrics) {
          console.warn("[Genius] Extracted lyrics are empty");
          continue;
        }

        console.log("[Genius] Lyrics successfully extracted");
        return { plainLyrics: lyrics };

      } catch (e) {
        console.error("[Genius] Fetch or parse error:", e);
        continue;
      }
    }
  }

  console.log("[Genius] Lyrics not found after trying all titles and pages");
  return { error: "Lyrics not found on Genius" };
}

function parseGeniusLyrics(raw) {
  if (!raw) return { unsynced: null };
  const lines = raw
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line && !/^(\[.*\])$/.test(line)); // skip pure section headers

  return {
    unsynced: lines.map(text => ({ text })),
  };
}

const ProviderGenius = {
  async findLyrics(info) {
    try {
      const data = await fetchGeniusLyrics(info);
      if (!data || data.error) return { error: "No lyrics found for this track from Genius" };
      return data;
    } catch (e) {
      return { error: e.message || "Genius fetch failed" };
    }
  },
  getUnsynced(body) {
    if (!body?.plainLyrics) return null;
    const lines = parseGeniusLyrics(body.plainLyrics).unsynced;
    const notTranscribedPatterns = [
      /lyrics for this song have yet to be transcribed/i,
      /we do not have the lyrics for/i,
      /be the first to add the lyrics/i,
      /please check back once the song has been released/i,
      /add lyrics on genius/i
    ];
    if (
      lines.length === 1 &&
      notTranscribedPatterns.some(rx => rx.test(lines[0].text))
    ) {
      return null;
    }
    return lines;
  },
  getSynced() {
    return null;
  },
};

// Provider mapping
const Providers = {
  "LRCLIB": ProviderLRCLIB,
  "Spotify": ProviderSpotify,
  "KPoe": ProviderKPoe,
  "Musixmatch": ProviderMusixmatch,
  "Genius": ProviderGenius
};

// Main function to fetch lyrics
async function fetchLyricsForTrack(trackInfo, providerName) {
  const provider = Providers[providerName];
  if (!provider) {
    return { error: "Unknown provider" };
  }

  try {
    const result = await provider.findLyrics(trackInfo);
    if (result.error) {
      return { error: result.error };
    }

    const synced = provider.getSynced(result);
    const unsynced = provider.getUnsynced(result);

    return {
      synced: synced,
      unsynced: unsynced
    };
  } catch (error) {
    return { error: error.message || "Failed to fetch lyrics" };
  }
}