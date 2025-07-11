# Lyrics Extension - Usage Guide

## Overview
This Chrome extension provides a floating lyrics popup that integrates directly with Spotify Web Player. It's designed to be a 1:1 clone of the pip-gui-stable.user.js functionality.

## Installation
1. Load the extension in Chrome Developer Mode
2. Navigate to https://open.spotify.com/
3. The extension will automatically inject itself into the page

## Features

### Keyboard Shortcuts
- **L key**: Toggle lyrics popup on/off
- **Ctrl+L** (or **Cmd+L** on Mac): Alternative toggle via extension command

### UI Components
- **Floating popup**: Resizable and draggable lyrics display
- **Provider tabs**: Switch between LRCLIB, Spotify, KPoe, Musixmatch, and Genius
- **Translation controls**: Translate lyrics to different languages
- **Offset controls**: Adjust timing for synced lyrics
- **Download options**: Save lyrics as .lrc (synced) or .txt (unsynced) files
- **Font size selector**: Adjust lyrics text size
- **Playback controls**: Control Spotify playback from the popup

### Providers
1. **LRCLIB**: Free synced and unsynced lyrics
2. **Spotify**: Official Spotify lyrics (requires token)
3. **KPoe**: Multiple source aggregator
4. **Musixmatch**: Community lyrics (requires token)
5. **Genius**: Unsynced lyrics from Genius.com

### Token Setup
- **Spotify**: Double-click the Spotify provider tab to set up token
- **Musixmatch**: Double-click the Musixmatch provider tab to set up token
- Follow the detailed instructions in the modal popups

## Usage
1. Open Spotify Web Player
2. Play any song
3. Click the "Lyrics+" button or press 'L' to open the popup
4. The extension will automatically detect and load lyrics
5. Use the provider tabs to switch between different lyric sources
6. Adjust settings using the control buttons in the header

## Features Matching pip-gui-stable.user.js
- ✅ Embedded popup overlay (not separate window)
- ✅ 'L' keyboard shortcut
- ✅ Popup stays on top, doesn't hide when clicking outside
- ✅ Modal token setup dialogs
- ✅ All provider implementations
- ✅ Translation functionality
- ✅ Drag/resize capability
- ✅ Exact styling and appearance
- ✅ Robust error handling
- ✅ Auto-detection of best provider
- ✅ Synced lyrics highlighting
- ✅ Download functionality

## Technical Details
- Uses Chrome Extension Manifest V3
- Injects content script into Spotify Web Player
- Communicates with background script for lyrics fetching
- Stores preferences in localStorage
- Uses the same provider APIs as the original userscript