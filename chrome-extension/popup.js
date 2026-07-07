'use strict';

// ── State ────────────────────────────────────────────────────────────────────
let allVideos    = [];
let currentTabId = null;
let activeFilter = 'all';

// ── DOM refs ─────────────────────────────────────────────────────────────────
const $loading    = document.getElementById('loading');
const $empty      = document.getElementById('emptyState');
const $list       = document.getElementById('videoList');
const $count      = document.getElementById('videoCount');
const $refreshBtn = document.getElementById('refreshBtn');
const $toast      = document.getElementById('toast');

// ── Format → badge colour ─────────────────────────────────────────────────
const FORMAT_COLORS = {
  MP4:  '#27AE60', WEBM: '#2980B9', HLS:  '#E67E22', M3U8: '#E67E22',
  DASH: '#8E44AD', MPD:  '#8E44AD', OGG:  '#16A085', MOV:  '#2C3E50',
  AVI:  '#7F8C8D', MKV:  '#C0392B', FLV:  '#E74C3C', TS:   '#95A5A6',
  M4V:  '#1ABC9C', '3GP':'#F39C12', WMV:  '#7F8C8D', VIDEO:'#3F7A35',
};
function badgeColor(fmt) { return FORMAT_COLORS[fmt.toUpperCase()] || '#3F7A35'; }

// ── Helpers ──────────────────────────────────────────────────────────────────
function fmtSize(bytes) {
  if (!bytes || bytes <= 0) return '';
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

function truncUrl(url, max = 55) {
  try {
    const u    = new URL(url);
    const full = u.hostname + u.pathname + u.search;
    return full.length > max ? full.slice(0, max) + '…' : full;
  } catch {
    return url.length > max ? url.slice(0, max) + '…' : url;
  }
}

function safeFilename(url, fmt) {
  try {
    const name = new URL(url).pathname.split('/').pop().split('?')[0];
    if (name && name.includes('.') && name.length < 120) return decodeURIComponent(name);
  } catch (_) {}
  return `video_${Date.now()}.${fmt.toLowerCase()}`;
}

function dedup(list) {
  const seen = new Map();
  for (const v of list) {
    if (!seen.has(v.url)) {
      seen.set(v.url, v);
    } else {
      // Merge: prefer network entry (has size), keep earliest timestamp
      const existing = seen.get(v.url);
      seen.set(v.url, {
        ...existing,
        ...v,
        size:      v.size || existing.size,
        source:    existing.source === 'network' ? existing.source : v.source,
        timestamp: Math.min(existing.timestamp || Infinity, v.timestamp || Infinity),
      });
    }
  }
  return Array.from(seen.values()).sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
}

// ── Load videos from tab ──────────────────────────────────────────────────────
async function loadVideos() {
  $refreshBtn.classList.add('spinning');
  setLoading(true);

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) throw new Error('no active tab');
    currentTabId = tab.id;

    // 1. Ask content script (DOM + XHR/Fetch intercepts)
    const csResult = await chrome.tabs.sendMessage(tab.id, { type: 'GET_VIDEOS' })
      .catch(() => ({ videos: [] }));

    // 2. Ask background service worker (network monitoring)
    const bgResult = await chrome.runtime.sendMessage({ type: 'GET_TAB_VIDEOS', tabId: tab.id })
      .catch(() => ({ videos: [] }));

    const merged = dedup([...(csResult.videos || []), ...(bgResult.videos || [])]);
    allVideos = merged;

    render(filtered());
  } catch (err) {
    showEmpty('无法扫描此页面（可能是浏览器内置页）');
    console.error('[Ghibli DL]', err);
  }

  setLoading(false);
  $refreshBtn.classList.remove('spinning');
}

// ── Render ────────────────────────────────────────────────────────────────────
function filtered() {
  if (activeFilter === 'stream') return allVideos.filter(v => v.isStream);
  if (activeFilter === 'direct') return allVideos.filter(v => !v.isStream);
  return allVideos;
}

function render(videos) {
  $count.textContent = `${allVideos.length} 个视频` + (videos.length !== allVideos.length ? `（显示 ${videos.length}）` : '');

  if (videos.length === 0) {
    $list.innerHTML = '';
    showEmpty(
      allVideos.length
        ? '当前筛选条件下没有视频'
        : '此页面暂未发现视频'
    );
    return;
  }

  $empty.classList.remove('show');
  $list.innerHTML = videos.map((v, i) => {
    const sizeStr   = fmtSize(v.size);
    const sourceStr = v.source || '未知';
    const fmt       = v.format || 'VIDEO';

    if (v.isStream) {
      return `
        <div class="video-card">
          <div class="card-top">
            <span class="format-badge" style="background:${badgeColor(fmt)}">${fmt}</span>
            <span class="stream-tag">流媒体</span>
            ${sizeStr ? `<span class="size-label">${sizeStr}</span>` : ''}
          </div>
          <div class="card-url" title="${v.url}">${truncUrl(v.url)}</div>
          <div class="card-source">来源: ${sourceStr}</div>
          <div class="card-actions">
            <button class="btn-dl stream-dl" data-i="${i}" data-action="copy">📋 复制链接</button>
            <button class="btn-open" data-i="${i}" data-action="open">↗ 在新标签打开</button>
            <div class="stream-note">⚠️ 流媒体请用 ffmpeg / yt-dlp 下载</div>
          </div>
        </div>`;
    }

    return `
      <div class="video-card">
        <div class="card-top">
          <span class="format-badge" style="background:${badgeColor(fmt)}">${fmt}</span>
          ${sizeStr ? `<span class="size-label">${sizeStr}</span>` : ''}
        </div>
        <div class="card-url" title="${v.url}">${truncUrl(v.url)}</div>
        <div class="card-source">来源: ${sourceStr}</div>
        <div class="card-actions">
          <button class="btn-dl" data-i="${i}" data-action="download">⬇ 下载</button>
          <button class="btn-copy" data-i="${i}" data-action="copy">📋 复制</button>
          <button class="btn-open" data-i="${i}" data-action="open">↗ 打开</button>
        </div>
      </div>`;
  }).join('');
}

// ── Actions ───────────────────────────────────────────────────────────────────
$list.addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;

  const i      = parseInt(btn.dataset.i, 10);
  const action = btn.dataset.action;
  const video  = allVideos[filtered()[i] ? i : i]; // resolve from filtered list
  const vlist  = filtered();
  const v      = vlist[i];
  if (!v) return;

  if (action === 'download') {
    btn.textContent = '⌛ 启动中…';
    btn.disabled = true;
    const filename = safeFilename(v.url, v.format);
    const resp = await chrome.runtime.sendMessage({ type: 'DOWNLOAD', url: v.url, filename });
    if (resp?.ok) {
      toast('下载已开始 🌿');
      btn.textContent = '✓ 已开始';
    } else {
      toast('下载失败：' + (resp?.error || '未知错误'), true);
      btn.textContent = '⬇ 下载';
      btn.disabled = false;
    }
    return;
  }

  if (action === 'copy') {
    await navigator.clipboard.writeText(v.url);
    toast('链接已复制到剪贴板 🍃');
    return;
  }

  if (action === 'open') {
    chrome.tabs.create({ url: v.url, active: false });
    return;
  }
});

// ── Filter buttons ────────────────────────────────────────────────────────────
document.querySelectorAll('.filter-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    activeFilter = btn.id === 'filterStream' ? 'stream'
                 : btn.id === 'filterDirect' ? 'direct'
                 : 'all';
    render(filtered());
  });
});

$refreshBtn.addEventListener('click', loadVideos);

// ── UI helpers ────────────────────────────────────────────────────────────────
function setLoading(show) {
  $loading.classList.toggle('show', show);
  $list.style.display   = show ? 'none' : 'block';
  $empty.classList.remove('show');
}

function showEmpty(msg) {
  $empty.querySelector('.empty-title').textContent = msg || '此页面暂未发现视频';
  $empty.classList.add('show');
  $list.innerHTML = '';
}

let toastTimer;
function toast(msg, isErr = false) {
  clearTimeout(toastTimer);
  $toast.textContent = msg;
  $toast.className   = 'toast show' + (isErr ? ' err' : '');
  toastTimer = setTimeout(() => { $toast.className = 'toast'; }, 3000);
}

// ── Boot ──────────────────────────────────────────────────────────────────────
loadVideos();
