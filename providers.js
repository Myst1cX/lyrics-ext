// Providers and lyrics fetching logic
// This file contains all the provider implementations from the userscript

const Utils = {
  normalize(str) {
    if (!str) return "";
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
    return str.replace(/\s*(?:feat\.?|ft\.?|featuring)\s+[^\-]+/i, '').trim();
  },
  containsHanCharacter(str) {
    return /[\u4e00-\u9fa5]/.test(str);
  },
  capitalize(str, lower = false) {
    if (!str) return '';
    return (lower ? str.toLowerCase() : str).replace(/(?:^|\s|["'([{])+\S/g, match => match.toUpperCase());
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
    
    if (!token) {
      return { error: "Double click on the Spotify provider to set up your token.\nA fresh token is required every hour/upon page reload for security." };
    }

    if (!info.trackId) {
      return { error: "No lyrics found for this track from Spotify" };
    }

    const endpoint = `https://spclient.wg.spotify.com/color-lyrics/v2/track/${info.trackId}?format=json&vocalRemoval=false&market=from_token`;

    try {
      const res = await fetch(endpoint, {
        method: "GET",
        headers: {
          "app-platform": "WebPlayer",
          "User-Agent": navigator.userAgent,
          "Authorization": "Bearer " + token,
        },
      });

      if (!res.ok) {
        if (res.status === 401) {
          return { error: "Double click on the Spotify provider and follow the instructions. Spotify requires a fresh token every hour/upon page reload for security." };
        }
        if (res.status === 404) {
          return { error: "No lyrics found for this track from Spotify" };
        }
        return { error: "No lyrics found for this track from Spotify" };
      }

      const data = await res.json();
      
      if (!data || !data.lyrics || !data.lyrics.lines || !data.lyrics.lines.length) {
        return { error: "No lyrics found for this track from Spotify" };
      }
      
      return data.lyrics;
    } catch (e) {
      return { error: "No lyrics found for this track from Spotify" };
    }
  },

  getSynced(data) {
    if (Array.isArray(data.lines) && data.syncType === "LINE_SYNCED") {
      return data.lines.map(line => ({
        time: line.startTimeMs,
        text: line.words
      }));
    }
    return null;
  },

  getUnsynced(data) {
    if (Array.isArray(data.lines) && (data.syncType === "UNSYNCED" || data.syncType !== "LINE_SYNCED")) {
      return data.lines.map(line => ({ text: line.words }));
    }
    return null;
  }
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
      
      return {
        text: item.text || '',
        startTime: startTime / 1000,
        duration: duration / 1000,
        endTime: endTime / 1000,
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
  }
};

// Musixmatch Provider
async function fetchMusixmatchLyrics(songInfo) {
  const token = localStorage.getItem("lyricsPlusMusixmatchToken");
  if (!token) {
    return { error: "Double click on the Musixmatch provider to set up your token" };
  }

  // Get track info
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

  // Try synced lyrics first
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

  // Fallback to unsynced lyrics
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
  const lines = subtitleBody.split(/\r?\n/);
  const synced = [];
  const timeRegex = /\[(\d{1,2}):(\d{2})([.,]\d{1,3})?\]/;

  for (const line of lines) {
    const match = line.match(timeRegex);
    if (match) {
      const min = parseInt(match[1], 10);
      const sec = parseInt(match[2], 10);
      const frac = match[3] ? parseFloat(match[3].replace(',', '.')) : 0;
      const timeMs = (min * 60 + sec + frac) * 1000;
      
      const text = line.replace(/\[(\d{1,2}):(\d{2})([.,]\d{1,3})?\]/g, '').trim();
      synced.push({ time: timeMs, text: text || '♪' });
    }
  }
  
  return synced;
}

const ProviderMusixmatch = {
  async findLyrics(info) {
    try {
      const data = await fetchMusixmatchLyrics(info);
      if (!data) {
        return { error: "No lyrics found for this track from Musixmatch" };
      }
      if (data.error) {
        return { error: data.error };
      }
      return data;
    } catch (e) {
      return { error: e.message || "Musixmatch fetch failed" };
    }
  },
  getUnsynced(body) {
    if (!body || !body.unsynced) return null;
    return body.unsynced.map(line => ({ text: line.text }));
  },
  getSynced(body) {
    if (!body || !body.synced) return null;
    return body.synced.map(line => ({
      text: line.text,
      time: Math.round(line.time ?? line.startTime ?? 0),
    }));
  }
};

// Genius Provider
async function fetchGeniusLyrics(info) {
  const titles = new Set([
    info.title,
    Utils.removeExtraInfo(info.title),
    Utils.removeSongFeat(info.title),
    Utils.removeSongFeat(Utils.removeExtraInfo(info.title)),
  ]);

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

  const translationKeywords = [
    "translation", "übersetzung", "перевод", "çeviri", "traducción", "traduções", "traduction",
    "traductions", "traduzione", "traducciones-al-espanol", "fordítás", "fordítások", "tumaczenie",
    "tłumaczenie", "polskie tłumaczenie", "magyar fordítás", "turkce çeviri", "russian translations",
    "deutsche übersetzung", "genius users", "fan", "fans", "official translation"
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

  const maxPages = 5;

  for (const title of titles) {
    const cleanTitle = cleanQuery(title);

    for (let page = 1; page <= maxPages; page++) {
      const query = encodeURIComponent(`${info.artist} ${cleanTitle}`);
      const searchUrl = `https://genius.com/api/search/multi?per_page=5&page=${page}&q=${query}`;

      try {
        const searchRes = await fetch(searchUrl, {
          headers: {
            Accept: "application/json",
            "User-Agent": navigator.userAgent,
          }
        });

        if (!searchRes.ok) continue;

        const searchJson = await searchRes.json();
        const hits = searchJson?.response?.sections?.flatMap(s => s.hits) || [];
        const songHits = hits.filter(h => h.type === "song");

        const targetArtists = new Set(normalizeArtists(info.artist));
        const targetTitleNorm = normalize(Utils.removeExtraInfo(info.title));

        let bestScore = -Infinity;
        let song = null;

        for (const hit of songHits) {
          const result = hit.result;
          if (isTranslationPage(result)) continue;

          const primary = normalizeArtists(result.primary_artist?.name || '');
          const resultTitleNorm = normalize(Utils.removeExtraInfo(result.title || ''));

          let artistOverlapCount = 0;
          for (const a of targetArtists) {
            if (primary.includes(a)) artistOverlapCount++;
          }

          if (artistOverlapCount === 0) continue;

          let score = artistOverlapCount * 5;
          if (resultTitleNorm === targetTitleNorm) {
            score += 10;
          } else if (resultTitleNorm.includes(targetTitleNorm) || targetTitleNorm.includes(resultTitleNorm)) {
            score += 6;
          }

          if (score > bestScore) {
            bestScore = score;
            song = result;
          }
        }

        if (bestScore < 6 || !song?.url) continue;

        const htmlRes = await fetch(song.url, {
          headers: {
            Accept: "text/html",
            "User-Agent": navigator.userAgent,
          }
        });

        if (!htmlRes.ok) continue;

        const html = await htmlRes.text();
        const lyricsMatch = html.match(/<div[^>]*data-lyrics-container="true"[^>]*>([\s\S]*?)<\/div>/);

        if (!lyricsMatch) continue;

        let lyricsHtml = lyricsMatch[1];
        lyricsHtml = lyricsHtml
          .replace(/<br[^>]*>/gi, "\n")
          .replace(/<[^>]*>/g, "")
          .replace(/&amp;/g, "&")
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">")
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'")
          .trim();

        if (lyricsHtml) {
          return { plainLyrics: lyricsHtml };
        }

      } catch (e) {
        continue;
      }
    }
  }

  return { error: "Lyrics not found on Genius" };
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
    const lines = body.plainLyrics
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(line => line && !/^(\[.*\])$/.test(line));
    
    const notTranscribedPatterns = [
      /lyrics for this song have yet to be transcribed/i,
      /we do not have the lyrics for/i,
      /be the first to add the lyrics/i,
      /please check back once the song has been released/i,
      /add lyrics on genius/i
    ];
    
    if (lines.length === 1 && notTranscribedPatterns.some(rx => rx.test(lines[0]))) {
      return null;
    }
    
    return lines.map(text => ({ text }));
  },
  getSynced() {
    return null;
  }
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