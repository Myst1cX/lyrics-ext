document.addEventListener("DOMContentLoaded", loadSettings);
function loadSettings() {
  const fontFamily = localStorage.getItem("spotify-lyrics-plus-font-family") || "Arial";
  const fontSize = localStorage.getItem("spotify-lyrics-plus-font-size") || "32";
  const lyricsAlign = localStorage.getItem("spotify-lyrics-plus-lyrics-align") || "center";
  document.getElementById("font-family").value = fontFamily;
  document.getElementById("font-size").value = fontSize;
  document.getElementById("lyrics-align").value = lyricsAlign;
  const spotifyToken = localStorage.getItem("spotifyUserToken") || "";
  const musixmatchToken = localStorage.getItem("musixmatchUserToken") || "";
  document.getElementById("spotify-token").value = spotifyToken;
  document.getElementById("musixmatch-token").value = musixmatchToken;
  updateProviderStatus();
}
function updateProviderStatus() {
  const spotifyToken = localStorage.getItem("spotifyUserToken");
  const musixmatchToken = localStorage.getItem("musixmatchUserToken");
  const spotifyStatus = document.getElementById("spotify-status");
  const musixmatchStatus = document.getElementById("musixmatch-status");
  if (spotifyStatus) {
    if (spotifyToken) {
      spotifyStatus.textContent = "Token configured";
      spotifyStatus.className = "provider-status enabled";
    } else {
      spotifyStatus.textContent = "Requires token";
      spotifyStatus.className = "provider-status disabled";
    }
  }
  if (musixmatchStatus) {
    if (musixmatchToken) {
      musixmatchStatus.textContent = "Token configured";
      musixmatchStatus.className = "provider-status enabled";
    } else {
      musixmatchStatus.textContent = "Requires token";
      musixmatchStatus.className = "provider-status disabled";
    }
  }
}
function showStatus(message, isError = false) {
  const statusEl = document.getElementById("status");
  if (!statusEl) return;
  statusEl.textContent = message;
  statusEl.className = `status ${isError ? "error" : "success"}`;
  statusEl.style.display = "block";
  setTimeout(() => {
    statusEl.style.display = "none";
  }, 3e3);
}
function saveSpotifyToken() {
  const tokenEl = document.getElementById("spotify-token");
  const token = tokenEl.value.trim();
  if (token) {
    if (token.length < 50) {
      showStatus("Invalid token format. Please check your token.", true);
      return;
    }
    localStorage.setItem("spotifyUserToken", token);
    showStatus("Spotify token saved successfully");
  } else {
    showStatus("Please enter a token", true);
    return;
  }
  updateProviderStatus();
}
function clearSpotifyToken() {
  localStorage.removeItem("spotifyUserToken");
  document.getElementById("spotify-token").value = "";
  showStatus("Spotify token cleared");
  updateProviderStatus();
}
function saveMusixmatchToken() {
  const tokenEl = document.getElementById("musixmatch-token");
  const token = tokenEl.value.trim();
  if (token) {
    if (token.length < 50) {
      showStatus("Invalid token format. Please check your token.", true);
      return;
    }
    localStorage.setItem("musixmatchUserToken", token);
    showStatus("Musixmatch token saved successfully");
  } else {
    showStatus("Please enter a token", true);
    return;
  }
  updateProviderStatus();
}
function clearMusixmatchToken() {
  localStorage.removeItem("musixmatchUserToken");
  document.getElementById("musixmatch-token").value = "";
  showStatus("Musixmatch token cleared");
  updateProviderStatus();
}
function saveDisplaySettings() {
  const fontFamily = document.getElementById("font-family").value;
  const fontSize = document.getElementById("font-size").value;
  const lyricsAlign = document.getElementById("lyrics-align").value;
  localStorage.setItem("spotify-lyrics-plus-font-family", fontFamily);
  localStorage.setItem("spotify-lyrics-plus-font-size", fontSize);
  localStorage.setItem("spotify-lyrics-plus-lyrics-align", lyricsAlign);
  showStatus("Display settings saved successfully");
}
function resetSettings() {
  localStorage.removeItem("spotify-lyrics-plus-font-family");
  localStorage.removeItem("spotify-lyrics-plus-font-size");
  localStorage.removeItem("spotify-lyrics-plus-lyrics-align");
  document.getElementById("font-family").value = "Arial";
  document.getElementById("font-size").value = "32";
  document.getElementById("lyrics-align").value = "center";
  showStatus("Settings reset to default");
}
window.saveSpotifyToken = saveSpotifyToken;
window.clearSpotifyToken = clearSpotifyToken;
window.saveMusixmatchToken = saveMusixmatchToken;
window.clearMusixmatchToken = clearMusixmatchToken;
window.saveDisplaySettings = saveDisplaySettings;
window.resetSettings = resetSettings;
