# GhibliPlayer

> 🚧 **Work in progress** — under active development, not feature-complete. Feedback and review welcome via the open draft PR.

A Ghibli-themed macOS video player app with real-photo character companions, plus a companion Chrome extension for detecting and downloading video sources.

## Technical highlights

- A self-contained macOS app wrapper with an embedded HTML/CSS/JavaScript
  player interface.
- A Manifest V3 Chrome extension with background, content and popup modules.
- Client-side detection of common direct-video and streaming manifest formats.
- No persistent host access: scanning is injected only after the user opens the
  popup, using Chrome's temporary `activeTab` permission.

## Responsible-use boundary

This is an educational work in progress. Only inspect or download media you own
or have permission to access, and follow the website's terms and applicable
copyright law. Studio Ghibli names, characters and third-party artwork remain
the property of their respective owners; no affiliation or endorsement is
claimed. Do not redistribute third-party character assets without permission.

The extension intentionally avoids `<all_urls>` and passive `webRequest`
monitoring. Its reduced permission model trades some early network-request
coverage for a clearer privacy boundary.

## Structure

- `GhibliPlayer.app/` — the packaged macOS app (AppleScript + Chrome `--app=` mode). The actual player UI lives at `GhibliPlayer.app/Contents/Resources/index.html`.
- `chrome-extension/` — Chrome MV3 extension (`ghibli-downloader`) used alongside the player for video detection/download.
- `index.html` — a standalone template version of the player UI.

## Characters

Six characters (Totoro, No-Face, Calcifer, Jiji, Kodama, Catbus) sourced from real photos/fan art and processed with flood-fill background removal, then embedded into the player UI.

## Verify

```bash
node -e "JSON.parse(require('fs').readFileSync('chrome-extension/manifest.json'))"
node -e "const m=require('./chrome-extension/manifest.json'); if (m.host_permissions || m.content_scripts || !m.permissions.includes('activeTab')) process.exit(1)"
node --check chrome-extension/background.js
node --check chrome-extension/content.js
node --check chrome-extension/popup.js
```

GitHub Actions runs the same manifest and JavaScript syntax checks on every push
and pull request.
