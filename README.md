# GhibliPlayer

A Ghibli-themed macOS video player app with real-photo character companions, plus a companion Chrome extension for detecting and downloading video sources.

## Structure

- `GhibliPlayer.app/` — the packaged macOS app (AppleScript + Chrome `--app=` mode). The actual player UI lives at `GhibliPlayer.app/Contents/Resources/index.html`.
- `chrome-extension/` — Chrome MV3 extension (`ghibli-downloader`) used alongside the player for video detection/download.
- `index.html` — a standalone template version of the player UI.

## Characters

Six characters (Totoro, No-Face, Calcifer, Jiji, Kodama, Catbus) sourced from real photos/fan art and processed with flood-fill background removal, then embedded into the player UI.
