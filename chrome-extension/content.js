/**
 * Ghibli Video Downloader — Content Script
 * Runs at document_start (before page scripts) so XHR/Fetch interception works.
 * Detects videos via: DOM scan · XHR override · fetch() override · MutationObserver
 */
(function () {
  'use strict';

  if (window.__ghibliPlayerScannerLoaded) return;
  window.__ghibliPlayerScannerLoaded = true;

  // ── Constants ──────────────────────────────────────────────────────────────
  const VIDEO_EXT_RE = /\.(mp4|webm|ogg|ogv|mpeg|mpg|mov|avi|mkv|flv|f4v|m3u8|mpd|ts|m4v|3gp|wmv|hevc|h264|h265)(\?[^#]*)?(?:#.*)?$/i;
  const HLS_RE       = /\.(m3u8)/i;
  const DASH_RE      = /\.(mpd)/i;
  const BLOB_RE      = /^blob:/i;
  const DATA_RE      = /^data:/i;

  const VIDEO_MIME_RE = /^(video\/|audio\/mp4|application\/(x-mpegurl|vnd\.apple\.mpegurl|dash\+xml))/i;

  const foundVideos = new Map(); // url → info

  // ── Helpers ────────────────────────────────────────────────────────────────
  function isVideoUrl(url) {
    if (!url || typeof url !== 'string') return false;
    if (BLOB_RE.test(url) || DATA_RE.test(url) || url.startsWith('javascript:')) return false;
    const base = url.split('?')[0].split('#')[0];
    return VIDEO_EXT_RE.test(base) || VIDEO_EXT_RE.test(url);
  }

  function detectFormat(url, mimeType) {
    const m = url.match(/\.(mp4|webm|ogg|ogv|mpeg|mpg|mov|avi|mkv|flv|f4v|m3u8|mpd|ts|m4v|3gp|wmv)/i);
    if (m) return m[1].toUpperCase();
    if (mimeType) {
      if (mimeType.includes('mp4') || mimeType.includes('mpeg4')) return 'MP4';
      if (mimeType.includes('webm'))    return 'WEBM';
      if (mimeType.includes('ogg'))     return 'OGG';
      if (mimeType.includes('mpegurl')) return 'HLS';
      if (mimeType.includes('dash'))    return 'DASH';
    }
    return 'VIDEO';
  }

  function normalizeUrl(url) {
    try { return new URL(url, location.href).href; } catch { return url; }
  }

  function addVideo(rawUrl, source, mimeType) {
    if (!rawUrl) return;
    const url = normalizeUrl(rawUrl);
    if (!url || BLOB_RE.test(url) || DATA_RE.test(url)) return;
    if (foundVideos.has(url)) return;

    const format   = detectFormat(url, mimeType);
    const isStream = HLS_RE.test(url) || DASH_RE.test(url) ||
                     format === 'HLS' || format === 'DASH';

    const info = { url, format, isStream, mimeType: mimeType || '', source, timestamp: Date.now() };
    foundVideos.set(url, info);

    try {
      chrome.runtime.sendMessage({ type: 'VIDEO_FOUND', video: info }).catch(() => {});
    } catch (_) {}
  }

  // ── XHR Interception ──────────────────────────────────────────────────────
  const origOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url) {
    const u = String(url || '');
    if (isVideoUrl(u)) {
      addVideo(u, 'XHR');
      // Also check response Content-Type when the response arrives
      this.addEventListener('load', function () {
        const ct = this.getResponseHeader('content-type') || '';
        if (VIDEO_MIME_RE.test(ct)) addVideo(u, 'XHR', ct);
      }, { once: true });
    }
    return origOpen.apply(this, arguments);
  };

  // ── Fetch Interception ────────────────────────────────────────────────────
  const origFetch = window.fetch;
  window.fetch = function (resource, init) {
    const url = resource instanceof Request ? resource.url : String(resource || '');
    if (url && isVideoUrl(url)) addVideo(url, 'fetch');

    const promise = origFetch.apply(this, arguments);
    promise.then(res => {
      const ct = res.headers.get('content-type') || '';
      if (VIDEO_MIME_RE.test(ct)) addVideo(res.url || url, 'fetch', ct);
    }).catch(() => {});
    return promise;
  };

  // ── DOM Scanner ───────────────────────────────────────────────────────────
  function scanDOM() {
    // <video> elements
    document.querySelectorAll('video').forEach(v => {
      [v.src, v.currentSrc].forEach(s => { if (s && !BLOB_RE.test(s)) addVideo(s, 'DOM <video>'); });
      v.querySelectorAll('source').forEach(s => {
        if (s.src) addVideo(s.src, 'DOM <source>', s.type);
      });
    });

    // Common data attributes used by video players
    const dataAttrs = ['data-src', 'data-video-src', 'data-hls-url', 'data-mp4', 'data-webm',
                       'data-stream', 'data-url', 'data-video-url', 'data-media'];
    document.querySelectorAll('[' + dataAttrs.join('],[') + ']').forEach(el => {
      dataAttrs.forEach(attr => {
        const val = el.getAttribute(attr);
        if (val && isVideoUrl(val)) addVideo(val, 'data-attr');
      });
    });

    // Look for JSON-LD and script-embedded video URLs
    document.querySelectorAll('script[type="application/ld+json"]').forEach(s => {
      try {
        const text = s.textContent || '';
        const urls = text.match(/https?:\/\/[^\s"'<>]+\.(mp4|m3u8|mpd|webm)[^\s"'<>]*/gi);
        if (urls) urls.forEach(u => addVideo(u, 'JSON-LD'));
      } catch (_) {}
    });
  }

  // ── MutationObserver ──────────────────────────────────────────────────────
  const observer = new MutationObserver(mutations => {
    for (const mut of mutations) {
      for (const node of mut.addedNodes) {
        if (node.nodeType !== 1) continue;

        if (node.tagName === 'VIDEO') {
          [node.src, node.currentSrc].forEach(s => { if (s && !BLOB_RE.test(s)) addVideo(s, 'MutObs <video>'); });
        }
        if (node.tagName === 'SOURCE' && node.src) {
          addVideo(node.src, 'MutObs <source>', node.type);
        }
        // Subtree scan
        node.querySelectorAll?.('video, source').forEach(el => {
          if (el.tagName === 'VIDEO') {
            [el.src, el.currentSrc].forEach(s => { if (s && !BLOB_RE.test(s)) addVideo(s, 'MutObs subtree'); });
          }
          if (el.tagName === 'SOURCE' && el.src) addVideo(el.src, 'MutObs subtree', el.type);
        });
      }
      // Attribute changes on video elements
      if (mut.type === 'attributes' && mut.target.tagName === 'VIDEO') {
        const s = mut.target.src;
        if (s && !BLOB_RE.test(s)) addVideo(s, 'MutObs attr');
      }
    }
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['src', 'data-src'],
  });

  // ── Message Handler ───────────────────────────────────────────────────────
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.type === 'GET_VIDEOS') {
      scanDOM();
      sendResponse({
        videos:    Array.from(foundVideos.values()),
        pageTitle: document.title,
        pageUrl:   location.href,
      });
      return true;
    }
    if (msg.type === 'PING') {
      sendResponse({ ready: true });
      return true;
    }
  });

  // ── Initial scan (if DOM already ready) ──────────────────────────────────
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', scanDOM);
  } else {
    scanDOM();
  }
})();
