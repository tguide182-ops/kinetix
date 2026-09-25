/**
 * Isolated-world content script: collects media candidates from the DOM,
 * media events, resource timing and the MAIN-world hook, batches them and
 * reports them to the background. Runs in every frame.
 */
import { addDomain, loadSettings, onSettingsChanged } from '../storage/settings';
import type { BackgroundToContent, ContentToBackground, MediaCandidate, MediaResource, Result, Settings, VideoOptionsResponse } from '../types';
import { isHostInList } from '../utils/url';
import { debounce } from '../utils/timing';
import { findPoster, type BlobRegistry } from './dom-detector';
import { parseHookMessage } from './hook-protocol';
import { PageObserver } from './page-observer';
import { FloatingPanel } from './panel';
import { VideoButton } from './video-button';
import { downloadableVideoCount } from '../detector/video-options';

const isTop = window === window.top;
const blobs: BlobRegistry = { blobs: new Map(), mse: new Set() };
let settings: Settings | undefined;
let panel: FloatingPanel | undefined;
let panelDismissed = false;
let lastPanelMedia: MediaResource[] = [];
let videoButton: VideoButton | undefined;
let videosAvailable = 0;
let videoButtonHidden = false;

function send(msg: ContentToBackground): Promise<unknown> {
  return chrome.runtime.sendMessage(msg).catch(() => undefined);
}

/* ------------------------- batching -------------------------------- */

const queued = new Map<string, MediaCandidate>();
const sent = new Map<string, string>();

const flush = debounce(
  () => {
    if (!queued.size) return;
    const candidates = [...queued.values()];
    queued.clear();
    const msg: ContentToBackground = { type: 'MEDIA_CANDIDATES', candidates, pageUrl: location.href, pageTitle: document.title };
    const poster = isTop ? findPoster(document) : undefined;
    if (poster) msg.posterHint = poster;
    void send(msg);
  },
  300,
  1000,
);

function enqueue(cands: MediaCandidate[]): void {
  for (const c of cands) {
    // One entry per detector and URL, so the background can record every detection method.
    const key = `${c.method}|${c.url}`;
    // Skip exact repeats; resend when new metadata (e.g. dimensions) appears.
    const sig = `${c.width ?? ''}|${c.height ?? ''}|${c.duration ?? ''}|${c.posterUrl ?? ''}|${c.mimeType ?? ''}|${c.title ?? ''}`;
    if (sent.get(key) === sig) continue;
    if (sent.size > 2000) sent.clear();
    sent.set(key, sig);
    const prev = queued.get(key);
    queued.set(key, prev ? { ...prev, ...c } : c);
  }
  if (queued.size) flush();
}

/* ------------------------- observer -------------------------------- */

const observer = new PageObserver(
  {
    onCandidates: enqueue,
    onNavigate: (url) => {
      sent.clear();
      if (isTop) void send({ type: 'PAGE_NAVIGATED', url, title: document.title });
    },
  },
  blobs,
);

function scanningAllowed(): boolean {
  return !!settings && !isHostInList(location.href, settings.excludedSites);
}

function applySettings(s: Settings): void {
  settings = s;
  if (scanningAllowed() && s.autoDetect) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => scanningAllowed() && observer.start(), { once: true });
    else observer.start();
  } else {
    observer.stop();
  }
  updatePanel();
  updateVideoButton();
}

/* ------------------------- MAIN-world hook bridge ------------------ */

window.addEventListener('message', (ev) => {
  if (ev.source !== window) return;
  const m = parseHookMessage(ev.data);
  if (!m) return;
  switch (m.kind) {
    case 'request':
      if (settings?.autoDetect && scanningAllowed()) enqueue([{ url: m.url, method: m.via, ...(m.mime ? { mimeType: m.mime } : {}) }]);
      break;
    case 'blob':
      if (blobs.blobs.size < 200 && m.url.startsWith(`blob:${location.origin}`)) blobs.blobs.set(m.url, { mime: m.mime, size: m.size });
      break;
    case 'mse':
      if (blobs.mse.size < 200) blobs.mse.add(m.url);
      break;
    case 'nav':
      observer.notifyHistoryChange();
      break;
    case 'eme':
      void send({ type: 'PAGE_EME_ACTIVE' });
      break;
  }
});

/* ------------------------- panel ----------------------------------- */

function panelWanted(): boolean {
  return isTop && !panelDismissed && !!settings?.showFloatingPanel && scanningAllowed() && !isHostInList(location.href, settings.panelDisabledSites);
}

function updatePanel(): void {
  if (!panelWanted()) {
    panel?.destroy();
    panel = undefined;
    return;
  }
  if (!lastPanelMedia.length) {
    panel?.update([]);
    return;
  }
  panel ??= new FloatingPanel({
    download: async (mediaId) => ((await send({ type: 'PANEL_DOWNLOAD', mediaId })) as Result<unknown>) ?? { ok: false, errorCode: 'INTERNAL', message: 'Extension unavailable.' },
    disableOnSite: () => {
      panelDismissed = true;
      void addDomain('panelDisabledSites', location.hostname);
      updatePanel();
    },
    openManager: () => void send({ type: 'OPEN_POPUP_MANAGER' }),
  });
  panel.update(lastPanelMedia);
}

/* ------------------------- on-video download button --------------- */

function updateVideoButton(): void {
  const wanted = !!settings?.showVideoButton && scanningAllowed() && !videoButtonHidden && videosAvailable > 0;
  if (!wanted) {
    videoButton?.destroy();
    videoButton = undefined;
    return;
  }
  if (videoButton) {
    videoButton.refresh();
    return;
  }
  videoButton = new VideoButton({
    getOptions: async (src) => ((await send({ type: 'OVERLAY_GET_OPTIONS', ...(src ? { src } : {}) })) as VideoOptionsResponse | undefined) ?? { options: [], message: 'MediaForge is unavailable. Reload the page.' },
    download: async (mediaId, quality) =>
      ((await send({ type: 'PANEL_DOWNLOAD', mediaId, quality })) as Result<unknown> | undefined) ?? { ok: false, errorCode: 'INTERNAL', message: 'Extension unavailable.' },
    hideOnPage: () => {
      videoButtonHidden = true;
      updateVideoButton();
    },
  });
}

/* ------------------------- background messages -------------------- */

function saveBlob(url: string, filename: string): boolean {
  // Only this document's own Blob-backed media; never navigate to arbitrary URLs.
  if (!url.startsWith(`blob:${location.origin}/`) || !blobs.blobs.has(url)) return false;
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.replace(/[/\\:*?"<>|]/g, ' ').slice(0, 150) || 'media';
  a.rel = 'noopener';
  a.style.display = 'none';
  (document.body ?? document.documentElement).appendChild(a);
  a.click();
  a.remove();
  return true;
}

chrome.runtime.onMessage.addListener((msg: BackgroundToContent, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id || !msg || typeof msg !== 'object') return false;
  switch (msg.type) {
    case 'RESCAN':
      if (scanningAllowed()) {
        observer.fullScan();
        flush.flush();
      }
      sendResponse(true);
      return false;
    case 'PANEL_MEDIA':
      if (Array.isArray(msg.media)) {
        lastPanelMedia = msg.media;
        updatePanel();
      }
      return false;
    case 'MEDIA_AVAILABLE':
      if (typeof msg.videos === 'number') {
        videosAvailable = msg.videos;
        updateVideoButton();
      }
      return false;
    case 'DOWNLOAD_BLOB':
      sendResponse(typeof msg.url === 'string' && typeof msg.filename === 'string' && saveBlob(msg.url, msg.filename));
      return false;
    default:
      return false;
  }
});

/* ------------------------- start ----------------------------------- */

void loadSettings().then(async (s) => {
  applySettings(s);
  if (panelWanted() || s.showVideoButton) {
    const media = (await send({ type: 'PANEL_GET_MEDIA' })) as MediaResource[] | undefined;
    if (Array.isArray(media)) {
      videosAvailable = downloadableVideoCount(media);
      updateVideoButton();
      if (panelWanted()) {
        lastPanelMedia = media;
        updatePanel();
      }
    }
  }
});
onSettingsChanged(applySettings);
