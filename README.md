# GhibliPlayer

![Status: Experimental](https://img.shields.io/badge/status-experimental-orange.svg)
[![CI](https://github.com/alexwang-engineering/ghibli-player/actions/workflows/ci.yml/badge.svg)](https://github.com/alexwang-engineering/ghibli-player/actions/workflows/ci.yml)
[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)

> 🚧 **Work in progress** — under active development, not feature-complete. Feedback and review welcome via the open draft PR.

A Ghibli-themed macOS video player app with real-photo character companions, plus a companion Chrome extension for detecting and downloading video sources.

> ⚠️ **Responsible use only.** The downloader is for inspecting and downloading
> media you own or have permission to access. Respect each site's terms and
> applicable copyright law. Studio Ghibli names, characters and third-party
> artwork belong to their respective owners — no affiliation or endorsement is
> claimed, and character assets must not be redistributed without permission.

## Technical highlights

- A self-contained macOS app wrapper with an embedded HTML/CSS/JavaScript
  player interface.
- A Manifest V3 Chrome extension with background, content and popup modules.
- Client-side detection of common direct-video and streaming manifest formats.
- No persistent host access: scanning is injected only after the user opens the
  popup, using Chrome's temporary `activeTab` permission.

## Responsible-use boundary

Beyond the usage rules called out at the top, the extension is built to a
deliberately narrow privacy boundary: it intentionally avoids `<all_urls>` and
passive `webRequest` monitoring. Its reduced permission model trades some early
network-request coverage for a clearer privacy story — scanning only runs after
you open the popup, under Chrome's temporary `activeTab` grant. This remains an
educational work in progress.

## Structure

- `GhibliPlayer.app/` — the packaged macOS app (AppleScript + Chrome `--app=` mode). The actual player UI lives at `GhibliPlayer.app/Contents/Resources/index.html`.
- `chrome-extension/` — Chrome MV3 extension (`ghibli-downloader`) used alongside the player for video detection/download.
- `index.html` — a standalone template version of the player UI.

## Getting started

Requirements: macOS with Google Chrome installed (the app opens the bundled UI
through Chrome's `--app=` window mode). No build step or package manager is
needed — the player is a self-contained `.app` bundle.

### Run the player

- **Packaged app:** double-click `GhibliPlayer.app`, or from a terminal:

  ```bash
  open GhibliPlayer.app
  ```

- **Standalone UI (no app wrapper):** open `index.html` directly in a browser to
  preview the same player interface.

### Load the Chrome extension

The companion downloader is an unpacked Manifest V3 extension:

1. Open `chrome://extensions` in Chrome.
2. Enable **Developer mode** (top-right toggle).
3. Click **Load unpacked** and select the `chrome-extension/` folder.
4. Pin **ghibli-downloader** to the toolbar. It requests no host access up
   front — clicking the popup grants a temporary `activeTab` scan of the current
   page only.

### Verify

Validate the extension manifest and script syntax before loading:

```bash
node -e "JSON.parse(require('fs').readFileSync('chrome-extension/manifest.json'))"
node -e "const m=require('./chrome-extension/manifest.json'); if (m.host_permissions || m.content_scripts || !m.permissions.includes('activeTab')) process.exit(1)"
node --check chrome-extension/background.js
node --check chrome-extension/content.js
node --check chrome-extension/popup.js
```

GitHub Actions runs the same manifest and JavaScript syntax checks on every push
and pull request.

## Characters

Six characters (Totoro, No-Face, Calcifer, Jiji, Kodama, Catbus) sourced from real photos/fan art and processed with flood-fill background removal, then embedded into the player UI.

## License

Licensed under the [Apache License 2.0](LICENSE).
