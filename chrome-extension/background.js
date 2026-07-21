/**
 * Handles explicit user actions from the extension popup.
 *
 * Scanning is injected only after the user opens the popup. The extension
 * deliberately avoids persistent host permissions and passive traffic
 * monitoring.
 */

const tabVideos = new Map();

function storeVideo(tabId, info) {
  if (!tabVideos.has(tabId)) tabVideos.set(tabId, new Map());
  const videos = tabVideos.get(tabId);
  if (!videos.has(info.url)) videos.set(info.url, info);
}

chrome.tabs.onRemoved.addListener(tabId => tabVideos.delete(tabId));

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === 'loading' && changeInfo.url) {
    tabVideos.delete(tabId);
  }
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'GET_TAB_VIDEOS') {
    const videos = tabVideos.get(msg.tabId);
    sendResponse({ videos: videos ? Array.from(videos.values()) : [] });
    return false;
  }

  if (msg.type === 'VIDEO_FOUND') {
    const tabId = sender.tab?.id;
    if (tabId !== undefined && tabId >= 0) {
      storeVideo(tabId, { ...msg.video, source: 'page-script' });
    }
    return false;
  }

  if (msg.type === 'DOWNLOAD') {
    const opts = { url: msg.url, saveAs: msg.saveAs || false };
    if (msg.filename) opts.filename = msg.filename;

    chrome.downloads.download(opts, downloadId => {
      if (chrome.runtime.lastError) {
        sendResponse({ ok: false, error: chrome.runtime.lastError.message });
      } else {
        sendResponse({ ok: true, downloadId });
      }
    });
    return true;
  }

  return false;
});
