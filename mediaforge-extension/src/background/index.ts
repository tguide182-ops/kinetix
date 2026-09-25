/**
 * MediaForge background service worker (Manifest V3).
 *
 * All listeners are registered synchronously at the top level so Chrome can
 * wake the worker for them; state is restored lazily from session storage.
 */
import type {
  BackgroundPush,
  BackgroundToContent,
  ContentToBackground,
  DownloadJob,
  MediaResource,
  OffscreenToBackground,
  Result,
  Settings,
  TabMediaResponse,
  UiToBackground,
} from '../types';
import { loadSettings, normalizeSettings, onSettingsChanged } from '../storage/settings';
import { MediaForgeError, toMediaForgeError } from '../utils/errors';
import { clearLog, createLogger, getLogEntries, setDebugLogging } from '../utils/logger';
import { hostnameOf, isHostInList, isHttpUrl, isSafeImageUrl } from '../utils/url';
import { debounce, type Debounced } from '../utils/timing';
import { parseQualityPreference } from '../utils/quality';
import { buildVideoOptions, downloadableVideoCount } from '../detector/video-options';
import { StreamAnalyzer } from './analyzer';
import { installDownloadWatcher } from './chrome-downloads';
import { createContextMenus, MENU } from './context-menus';
import { DownloadService } from './downloads';
import { candidateFromResponse } from './network-observer';
import { TabStateStore } from './tab-state';

const log = createLogger('background');

/* ----------------------------- state ----------------------------- */

let settings: Settings = normalizeSettings({});
const settingsReady = loadSettings().then((s) => {
  applySettings(s);
});

const tabs = new TabStateStore();
const analyzer = new StreamAnalyzer(tabs);
const downloads = new DownloadService(() => settings, tabs, analyzer);
const ready = Promise.all([settingsReady, tabs.load()]).then(() => downloads.restore());

function applySettings(s: Settings): void {
  settings = s;
  setDebugLogging(s.debugLogging);
  downloads?.queue.setMaxConcurrent(s.maxConcurrentDownloads);
}

// Content scripts observe storage changes themselves; no per-tab broadcast needed.
onSettingsChanged(applySettings);

installDownloadWatcher();

function isExcluded(url: string | undefined): boolean {
  return isHostInList(url, settings.excludedSites);
}

function sendToTab(tabId: number, msg: BackgroundToContent, frameId?: number): void {
  chrome.tabs.sendMessage(tabId, msg, frameId !== undefined ? { frameId } : {}).catch(() => {
    /* no content script in this tab (e.g. chrome:// pages) */
  });
}

/* ------------------------ badge / panel push ---------------------- */

const panelPushers = new Map<number, Debounced<[MediaResource[]]>>();
const availabilityPushers = new Map<number, Debounced<[number]>>();

tabs.onChange((tabId, media) => {
  const count = media.filter((m) => !m.isProtected).length;
  void chrome.action.setBadgeText({ tabId, text: count ? String(Math.min(count, 99)) : '' }).catch(() => {});
  void chrome.action.setBadgeBackgroundColor({ tabId, color: '#6d5dfc' }).catch(() => {});
  downloads.broadcast({ type: 'TAB_MEDIA_UPDATED', tabId, media } satisfies BackgroundPush);

  const state = tabs.peek(tabId);
  if (settings.showVideoButton && !isExcluded(state?.pageUrl)) {
    // Every frame hears this, so players inside iframes get the button too.
    let push = availabilityPushers.get(tabId);
    if (!push) {
      push = debounce((n: number) => sendToTab(tabId, { type: 'MEDIA_AVAILABLE', videos: n }), 400, 1500);
      availabilityPushers.set(tabId, push);
    }
    push(downloadableVideoCount(media));
  }
  if (settings.showFloatingPanel && !isHostInList(state?.pageUrl, settings.panelDisabledSites)) {
    let push = panelPushers.get(tabId);
    if (!push) {
      push = debounce((m: MediaResource[]) => sendToTab(tabId, { type: 'PANEL_MEDIA', media: m }, 0), 400, 1500);
      panelPushers.set(tabId, push);
    }
    push(media);
  }
});

/* ------------------------ auto-download --------------------------- */

const AUTO_DOWNLOAD_LIMIT_PER_PAGE = 5;

async function maybeAutoDownload(tabId: number, added: MediaResource[]): Promise<void> {
  if (!settings.autoDownload || !added.length) return;
  const state = await tabs.get(tabId);
  if (isExcluded(state.pageUrl)) return;
  for (const m of added) {
    if (state.autoDownloaded >= AUTO_DOWNLOAD_LIMIT_PER_PAGE) return;
    // Only complete, directly addressable files — never streams, blobs or protected media.
    if (m.isStream || m.isBlob || m.isProtected || (m.type !== 'video' && m.type !== 'audio')) continue;
    if (m.size !== undefined && m.size < 100 * 1024) continue;
    state.autoDownloaded++;
    const r = await downloads.request({ tabId, mediaId: m.id });
    if (!r.ok) log.info('Auto-download refused', r.errorCode);
  }
}

async function addCandidates(tabId: number, candidates: Extract<ContentToBackground, { type: 'MEDIA_CANDIDATES' }>, frameUrl: string): Promise<void> {
  const state = await tabs.get(tabId);
  const pageUrl = state.pageUrl ?? frameUrl;
  if (isExcluded(pageUrl)) return;
  const valid = candidates.candidates.slice(0, 100);
  const res = state.collection.addCandidates(valid, { pageUrl: frameUrl || pageUrl, ...(state.pageTitle ? { pageTitle: state.pageTitle } : {}) });
  if (state.posterHint) state.collection.applyPosterHint(state.posterHint);
  if (res.added.length || res.updated.length) {
    tabs.touch(tabId);
    await maybeAutoDownload(tabId, res.added);
  }
}

/* ---------------------- network-level detection ------------------- */

chrome.webRequest.onHeadersReceived.addListener(
  (details): undefined => {
    if (details.type === 'main_frame') {
      const ct = details.responseHeaders?.find((h) => h.name.toLowerCase() === 'content-type')?.value ?? '';
      // A new document is loading in the tab: start with a clean slate.
      if (/html|xml/i.test(ct) && details.statusCode < 400) void ready.then(() => tabs.reset(details.tabId, details.url));
      return;
    }
    if (!settings.autoDetect) return;
    const cand = candidateFromResponse(details);
    if (!cand) return;
    void ready.then(async () => {
      const state = await tabs.get(details.tabId);
      if (isExcluded(state.pageUrl ?? details.initiator)) return;
      const res = state.collection.addCandidates([cand], { pageUrl: state.pageUrl ?? details.initiator ?? '', ...(state.pageTitle ? { pageTitle: state.pageTitle } : {}) });
      if (res.added.length || res.updated.length) {
        tabs.touch(details.tabId);
        await maybeAutoDownload(details.tabId, res.added);
      }
    });
  },
  { urls: ['http://*/*', 'https://*/*'], types: ['main_frame', 'media', 'xmlhttprequest', 'other', 'object'] },
  ['responseHeaders'],
);

/* ------------------------------ tabs ------------------------------ */

chrome.tabs.onRemoved.addListener((tabId) => {
  panelPushers.get(tabId)?.cancel();
  panelPushers.delete(tabId);
  availabilityPushers.get(tabId)?.cancel();
  availabilityPushers.delete(tabId);
  void tabs.remove(tabId);
});

chrome.tabs.onUpdated.addListener((tabId, info, tab) => {
  if (!info.title && !info.url) return;
  void ready.then(async () => {
    const state = await tabs.get(tabId);
    if (tab.url && isHttpUrl(tab.url)) state.pageUrl = tab.url;
    if (tab.title) state.pageTitle = tab.title;
    tabs.touch(tabId);
  });
});

/* ---------------------------- messaging --------------------------- */

const EXTENSION_ORIGIN = chrome.runtime.getURL('');

function isExtensionPage(sender: chrome.runtime.MessageSender): boolean {
  return sender.id === chrome.runtime.id && !!sender.url?.startsWith(EXTENSION_ORIGIN);
}

function isContentScript(sender: chrome.runtime.MessageSender): boolean {
  return sender.id === chrome.runtime.id && !!sender.tab && sender.tab.id !== undefined && !isExtensionPage(sender);
}

function fail(e: unknown): Result<never> {
  const err = toMediaForgeError(e);
  const r: Result<never> = { ok: false, errorCode: err.code, message: err.message };
  if (settings.debugLogging && err.detail) r.detail = err.detail;
  return r;
}

async function tabMedia(tabId: number): Promise<TabMediaResponse> {
  const state = await tabs.get(tabId);
  const tab = await chrome.tabs.get(tabId).catch(() => undefined);
  const pageUrl = state.pageUrl ?? tab?.url;
  const pageTitle = tab?.title ?? state.pageTitle;
  const r: TabMediaResponse = { tabId, media: state.collection.list(), excluded: isExcluded(pageUrl), emeActive: state.emeActive };
  if (pageUrl) r.pageUrl = pageUrl;
  if (pageTitle) r.pageTitle = pageTitle;
  return r;
}

async function rescan(tabId: number): Promise<boolean> {
  try {
    await chrome.tabs.sendMessage(tabId, { type: 'RESCAN' } satisfies BackgroundToContent);
    return true;
  } catch {
    return false;
  }
}

async function handleContent(msg: ContentToBackground, sender: chrome.runtime.MessageSender): Promise<unknown> {
  const tabId = sender.tab!.id!;
  const isTop = sender.frameId === 0;
  switch (msg.type) {
    case 'MEDIA_CANDIDATES': {
      if (!Array.isArray(msg.candidates)) return false;
      const state = await tabs.get(tabId);
      if (isTop) {
        if (typeof msg.pageUrl === 'string' && isHttpUrl(msg.pageUrl)) state.pageUrl = msg.pageUrl;
        if (typeof msg.pageTitle === 'string' && msg.pageTitle) state.pageTitle = msg.pageTitle.slice(0, 300);
      }
      if (isSafeImageUrl(msg.posterHint) && !state.posterHint) state.posterHint = msg.posterHint;
      await addCandidates(tabId, msg, sender.url ?? '');
      return true;
    }
    case 'PAGE_NAVIGATED': {
      if (!isTop) return false;
      const state = await tabs.get(tabId);
      if (hostnameOf(state.pageUrl) && typeof msg.url === 'string' && isHttpUrl(msg.url)) {
        // SPA route change: drop media from the previous view but keep anything
        // requested in the last moments (players often load before pushState).
        state.collection.clear(Date.now() - 1500);
        state.pageUrl = msg.url;
        if (typeof msg.title === 'string') state.pageTitle = msg.title.slice(0, 300);
        state.autoDownloaded = 0;
        tabs.touch(tabId);
      }
      return true;
    }
    case 'PAGE_EME_ACTIVE': {
      const state = await tabs.get(tabId);
      state.emeActive = true;
      tabs.touch(tabId);
      return true;
    }
    case 'PANEL_GET_MEDIA':
      return (await tabs.get(tabId)).collection.list();
    case 'PANEL_DOWNLOAD': {
      const quality = parseQualityPreference(msg.quality);
      return downloads.request({ tabId, mediaId: String(msg.mediaId), ...(quality ? { quality } : {}) });
    }
    case 'OVERLAY_GET_OPTIONS': {
      const state = await tabs.get(tabId);
      // Read stream manifests now — the user just asked for the quality list.
      const streams = state.collection.list().filter((m) => m.isStream && !m.isProtected);
      await Promise.all(streams.map((m) => analyzer.analyze(tabId, m.id).catch(() => undefined)));
      return buildVideoOptions(state.collection.list(), typeof msg.src === 'string' ? msg.src : undefined);
    }
    case 'OPEN_POPUP_MANAGER':
      await chrome.tabs.create({ url: chrome.runtime.getURL('manager/manager.html') });
      return true;
    default:
      return false;
  }
}

async function handleUi(msg: UiToBackground): Promise<unknown> {
  switch (msg.type) {
    case 'GET_TAB_MEDIA':
      return { ok: true, data: await tabMedia(msg.tabId) };
    case 'RESCAN_TAB': {
      const reached = await rescan(msg.tabId);
      return reached ? { ok: true, data: await tabMedia(msg.tabId) } : { ok: false, errorCode: 'NO_CONTENT_SCRIPT', message: 'Reload the page so MediaForge can scan it.' };
    }
    case 'ANALYZE_MEDIA':
      try {
        return { ok: true, data: await analyzer.analyze(msg.tabId, msg.mediaId) };
      } catch (e) {
        return fail(e);
      }
    case 'DOWNLOAD': {
      const r = msg.request ?? {};
      const quality = parseQualityPreference(r.quality);
      return downloads.request({
        ...(typeof r.tabId === 'number' ? { tabId: r.tabId } : {}),
        ...(typeof r.mediaId === 'string' ? { mediaId: r.mediaId } : {}),
        ...(typeof r.url === 'string' ? { url: r.url } : {}),
        ...(quality ? { quality } : {}),
      });
    }
    case 'DOWNLOAD_ALL': {
      const state = await tabs.get(msg.tabId);
      const results: Result<DownloadJob>[] = [];
      for (const m of state.collection.list()) {
        if (m.isProtected || m.analysis?.status === 'live' || m.analysis?.status === 'error') continue;
        const quality = parseQualityPreference(msg.quality);
        results.push(await downloads.request({ tabId: msg.tabId, mediaId: m.id, ...(quality ? { quality } : {}) }));
      }
      if (!results.length) return { ok: false, errorCode: 'NO_MEDIA', message: new MediaForgeError('NO_MEDIA').message };
      return { ok: true, data: results };
    }
    case 'GET_DOWNLOADS':
      return { ok: true, data: downloads.publicJobs() };
    case 'DOWNLOAD_ACTION':
      return { ok: await downloads.action(msg.jobId, msg.action), data: null };
    case 'CLEAR_FINISHED_DOWNLOADS':
      downloads.queue.clearFinished();
      return { ok: true, data: null };
    case 'GET_DEBUG_LOG':
      return { ok: true, data: settings.debugLogging ? getLogEntries() : [] };
    case 'CLEAR_DEBUG_LOG':
      clearLog();
      return { ok: true, data: null };
    default:
      return { ok: false, errorCode: 'INTERNAL', message: 'Unknown request' };
  }
}

chrome.runtime.onMessage.addListener((msg: unknown, sender, sendResponse) => {
  if (!msg || typeof msg !== 'object' || sender.id !== chrome.runtime.id) return false;
  const m = msg as { type?: unknown; target?: unknown };
  if (m.target === 'offscreen') return false; // addressed to the offscreen document
  if (m.target === 'background') {
    if (isExtensionPage(sender)) downloads.stream.handleMessage(msg as OffscreenToBackground);
    return false;
  }
  let work: Promise<unknown>;
  if (isContentScript(sender)) work = ready.then(() => handleContent(msg as ContentToBackground, sender));
  else if (isExtensionPage(sender)) work = ready.then(() => handleUi(msg as UiToBackground));
  else return false;
  work.then(sendResponse, (e: unknown) => {
    log.error('Message handler failed', e);
    sendResponse(fail(e));
  });
  return true; // async response
});

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'mf-ui' || !port.sender?.url?.startsWith(EXTENSION_ORIGIN)) {
    port.disconnect();
    return;
  }
  void ready.then(() => downloads.addPort(port));
});

/* -------------------------- context menus ------------------------- */

chrome.runtime.onInstalled.addListener(() => createContextMenus());

chrome.contextMenus.onClicked.addListener((info, tab) => {
  const tabId = tab?.id;
  if (tabId === undefined) return;
  void ready.then(async () => {
    if (info.menuItemId === MENU.page) {
      await rescan(tabId);
      await chrome.action.openPopup?.().catch(() => {});
      return;
    }
    const url = info.menuItemId === MENU.link ? info.linkUrl : info.srcUrl;
    let result: Result<DownloadJob>;
    if (url && isHttpUrl(url)) {
      result = await downloads.request({ tabId, url });
    } else {
      // Media Source (blob:) player: offer the best unprotected stream detected on the page.
      const state = await tabs.get(tabId);
      const stream = state.collection.list().find((m) => m.isStream && !m.isProtected);
      const blob = url ? state.collection.findByUrl(url) : undefined;
      const target = blob?.isBlob ? blob : stream;
      result = target ? await downloads.request({ tabId, mediaId: target.id }) : { ok: false, errorCode: 'BLOB_UNAVAILABLE', message: new MediaForgeError('BLOB_UNAVAILABLE').message };
    }
    if (!result.ok && settings.showNotifications) {
      chrome.notifications.create({ type: 'basic', iconUrl: chrome.runtime.getURL('icons/icon-128.png'), title: 'MediaForge', message: result.message });
    }
  });
});

chrome.notifications?.onClicked.addListener((id) => {
  if (id.startsWith('mf-')) void chrome.tabs.create({ url: chrome.runtime.getURL('manager/manager.html') });
});
