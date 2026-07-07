/**
 * Ghibli Video Downloader — Background Service Worker
 * Monitors ALL network requests via chrome.webRequest and stores video URLs per tab.
 */

const tabVideos = new Map(); // tabId → Map<url, videoInfo>

const VIDEO_URL_RE   = /\.(mp4|webm|ogg|ogv|mov|avi|mkv|flv|f4v|m3u8|mpd|ts|m4v|3gp|wmv|hevc)(\?|$|#)/i;
const VIDEO_MIME_RE  = /^(video\/|audio\/mp4|application\/(x-mpegurl|vnd\.apple\.mpegurl|dash\+xml))/i;

// ── Helpers ────────────────────────────────────────────────────────────────
function getHeader(headers, name) {
  if (!headers) return null;
  const h = headers.find(h => h.name.toLowerCase() === name.toLowerCase());
  return h ? h.value : null;
}

function isVideoRequest(details) {
  const url  = details.url || '';
  const base = url.split('?')[0].split('#')[0];
  if (VIDEO_URL_RE.test(base)) return true;

  const ct = getHeader(details.responseHeaders, 'content-type');
  if (ct && VIDEO_MIME_RE.test(ct)) return true;

  return false;
}

function detectFormat(url, mimeType) {
  const m = url.match(/\.(mp4|webm|ogg|ogv|mov|avi|mkv|flv|f4v|m3u8|mpd|ts|m4v|3gp|wmv)/i);
  if (m) return m[1].toUpperCase();
  if (mimeType) {
    if (mimeType.includes('mp4') || mimeType.includes('mpeg4'))  return 'MP4';
    if (mimeType.includes('webm'))    return 'WEBM';
    if (mimeType.includes('ogg'))     return 'OGG';
    if (mimeType.includes('mpegurl')) return 'HLS';
    if (mimeType.includes('dash'))    return 'DASH';
  }
  return 'VIDEO';
}

function buildInfo(details) {
  const ct  = getHeader(details.responseHeaders, 'content-type') || '';
  const cl  = getHeader(details.responseHeaders, 'content-length');
  const url = details.url;

  const format   = detectFormat(url, ct);
  const isStream = /m3u8|mpd/i.test(url) || format === 'HLS' || format === 'DASH';

  return {
    url,
    format,
    isStream,
    mimeType:  ct,
    size:      cl ? parseInt(cl, 10) : null,
    source:    'network',
    initiator: details.initiator || details.documentUrl || '',
    timestamp: Date.now(),
  };
}

function storeVideo(tabId, info) {
  if (!tabVideos.has(tabId)) tabVideos.set(tabId, new Map());
  const m = tabVideos.get(tabId);
  if (!m.has(info.url)) m.set(info.url, info);
  // Merge size info if we now have it
  else if (info.size && !m.get(info.url).size) {
    m.set(info.url, { ...m.get(info.url), size: info.size });
  }
}

// ── webRequest listeners ───────────────────────────────────────────────────

// onCompleted — captures direct video file responses
chrome.webRequest.onCompleted.addListener(
  (details) => {
    if (details.tabId < 0) return;
    if (!isVideoRequest(details)) return;

    // Skip tiny files (thumbnails/icons/ad beacons)
    const cl = getHeader(details.responseHeaders, 'content-length');
    if (cl && parseInt(cl, 10) < 2048) return;

    storeVideo(details.tabId, buildInfo(details));
  },
  { urls: ['<all_urls>'] },
  ['responseHeaders']
);

// onHeadersReceived — catches streaming content before full response (e.g. HLS manifests)
chrome.webRequest.onHeadersReceived.addListener(
  (details) => {
    if (details.tabId < 0) return;
    const ct = getHeader(details.responseHeaders, 'content-type') || '';
    if (!VIDEO_MIME_RE.test(ct)) return;
    storeVideo(details.tabId, buildInfo(details));
  },
  { urls: ['<all_urls>'] },
  ['responseHeaders']
);

// ── Tab lifecycle ──────────────────────────────────────────────────────────
chrome.tabs.onRemoved.addListener(tabId => tabVideos.delete(tabId));

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  // Clear stored videos when the tab navigates to a new page
  if (changeInfo.status === 'loading' && changeInfo.url) {
    tabVideos.delete(tabId);
  }
});

// ── Message handler ────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {

  if (msg.type === 'GET_TAB_VIDEOS') {
    const m = tabVideos.get(msg.tabId);
    sendResponse({ videos: m ? Array.from(m.values()) : [] });
    return false;
  }

  if (msg.type === 'VIDEO_FOUND') {
    // Store video reported by content script
    const tabId = sender.tab?.id;
    if (tabId !== undefined && tabId >= 0) {
      storeVideo(tabId, { ...msg.video, source: 'page-script' });
    }
    return false;
  }

  if (msg.type === 'DOWNLOAD') {
    const opts = {
      url:    msg.url,
      saveAs: msg.saveAs || false,
    };
    if (msg.filename) opts.filename = msg.filename;

    chrome.downloads.download(opts, (downloadId) => {
      if (chrome.runtime.lastError) {
        sendResponse({ ok: false, error: chrome.runtime.lastError.message });
      } else {
        sendResponse({ ok: true, downloadId });
      }
    });
    return true; // async
  }

  return false;
});
