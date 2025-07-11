# Spotify Web Lyrics Plus - Browser Extension

A powerful browser extension that brings the full Spotify Lyrics+ experience to your browser with multi-provider lyrics support, translation, and advanced features.

## Features

- **Multi-Provider Lyrics**: Support for LRCLIB, Spotify, KPoe, Musixmatch, and Genius
- **Auto-Detection**: Automatically detects and fetches lyrics for currently playing tracks
- **Synced & Unsynced Lyrics**: Displays both time-synced and static lyrics
- **Translation**: Translate lyrics to 80+ languages using Google Translate
- **Download**: Download lyrics as LRC (synced) or TXT (unsynced) files
- **Playback Controls**: Control Spotify Web Player directly from the popup
- **Customizable**: Adjust font size, timing offset, and appearance
- **Floating Popup**: Draggable, resizable popup window that works everywhere
- **Hotkey Support**: Press Alt+L to toggle the lyrics popup

## Installation

1. Download or clone this repository
2. Open Chrome/Edge and navigate to `chrome://extensions/`
3. Enable "Developer mode" in the top right
4. Click "Load unpacked" and select the extension directory
5. The extension icon will appear in your browser toolbar

## Usage

### Basic Usage
1. Open Spotify Web Player in a browser tab
2. Start playing a song
3. Click the extension icon or press Alt+L to open the lyrics popup
4. Lyrics will automatically load and sync with the music

### Provider Setup
Some providers require authentication tokens:

**Spotify Provider:**
1. Double-click the "Spotify" provider tab
2. Follow the instructions to extract your token from DevTools
3. Paste the token and save

**Musixmatch Provider:**
1. Double-click the "Musixmatch" provider tab
2. Follow the instructions to get your user token
3. Paste the token and save

### Features

**Translation:**
- Click the 🌐 button to show translation controls
- Select target language and click "Translate"
- Click "Original" to remove translations

**Downloads:**
- Click the download button (⬇️) to download lyrics
- Choose between synced (LRC) or unsynced (TXT) format

**Playback Controls:**
- Click the 🎛️ button to show playback controls
- Control previous/next track and play/pause

**Timing Adjustment:**
- Click the ⚙️ button to show timing controls
- Adjust lyrics timing offset in milliseconds

## Browser Compatibility

- **Chrome**: Full support (Manifest V3)
- **Edge**: Full support (Manifest V3)
- **Firefox**: Compatible with minor limitations

## Privacy

- No data is sent to external servers except for lyrics fetching
- Tokens are stored locally in your browser
- No tracking or analytics

## Development

The extension is built with:
- Manifest V3 for Chrome/Edge compatibility
- Service Worker background script
- Content script for Spotify Web Player integration
- Popup window for the main UI

### File Structure
- `manifest.json` - Extension manifest
- `background.js` - Service worker background script
- `content.js` - Content script for Spotify integration
- `lyrics-popup.html/js` - Main popup window
- `providers.js` - Lyrics provider implementations
- `token-setup.html` - Token configuration page

## Contributing

1. Fork the repository
2. Create your feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgments

- Based on the original Spotify Web Lyrics Plus userscript
- Lyrics providers: LRCLIB, Spotify, KPoe, Musixmatch, Genius
- Google Translate API for translation services