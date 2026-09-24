import { loadSettings } from '../storage/settings';
import type { BackgroundPush, DownloadJob, MediaResource, QualityPreference, Settings, TabMediaResponse } from '../types';
import { request, subscribe } from '../ui/api';
import { mediaDisplayTitle, mediaTypeLabel } from '../ui/labels';
import { applyTheme, clear, h } from '../utils/dom';
import { formatBytes, formatBitrate, formatDuration } from '../utils/format';
import { displayQuality } from '../utils/quality';
import { hostnameOf, isSafeImageUrl } from '../utils/url';

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
const content = $('content');
const notices = $('notices');
const downloadAllBtn = $<HTMLButtonElement>('download-all');
const allQuality = $<HTMLSelectElement>('all-quality');

let tabId: number | undefined;
let settings: Settings;
let media: MediaResource[] = [];
let lastResponse: TabMediaResponse | undefined;
const selection = new Map<string, QualityPreference>();
const statuses = new Map<string, { text: string; kind: 'ok' | 'error' | 'info' }>();
const analyzing = new Set<string>();

/* ------------------------------ helpers ------------------------------ */

function estimatedSize(m: MediaResource): string {
  if (m.size) return formatBytes(m.size);
  if (m.isStream && m.bitrate && m.duration) return formatBytes((m.bitrate / 8) * m.duration, true);
  return '';
}

function notice(text: string, kind: '' | 'warning' | 'danger' = ''): HTMLElement {
  return h('div', { class: `notice ${kind}`, text, role: kind === 'danger' ? 'alert' : 'status' });
}

function setStatus(id: string, text: string, kind: 'ok' | 'error' | 'info'): void {
  statuses.set(id, { text, kind });
  render();
}

/* ------------------------------ rendering ---------------------------- */

function thumb(m: MediaResource): HTMLElement {
  const box = h('div', { class: 'thumb', aria: { hidden: 'true' } });
  const glyph = m.type === 'audio' ? '♪' : '▶';
  if (isSafeImageUrl(m.posterUrl)) {
    const img = h('img', { alt: '', src: m.posterUrl });
    img.referrerPolicy = 'no-referrer';
    img.loading = 'lazy';
    img.addEventListener('error', () => {
      clear(box);
      box.textContent = glyph;
    });
    box.append(img);
  } else {
    box.textContent = glyph;
  }
  return box;
}

function streamChooser(m: MediaResource): HTMLElement | null {
  const a = m.analysis;
  if (!m.isStream) return null;
  if (!a) return h('div', { class: 'streams-label', text: analyzing.has(m.id) ? 'Reading stream information…' : '' });
  if (a.status === 'protected') return null;
  if (a.status === 'error') return h('div', { class: 'status error', text: a.errorCode === 'MANIFEST_PARSE' ? 'Manifest could not be parsed.' : 'Stream information could not be loaded.' });
  if (a.status === 'live') return h('div', { class: 'status', text: 'Live stream — downloading is available once the broadcast ends.' });

  const options: Array<{ value: QualityPreference; label: string; hint?: string }> = [];
  for (const v of a.variants) {
    const label = v.qualityLabel ?? (v.bandwidth ? formatBitrate(v.bandwidth) : 'Default');
    const value = (v.qualityLabel as QualityPreference | undefined) ?? 'highest';
    if (options.some((o) => o.label === label)) continue;
    const opt: { value: QualityPreference; label: string; hint?: string } = { value, label };
    if (v.bandwidth && v.qualityLabel) opt.hint = formatBitrate(v.bandwidth);
    options.push(opt);
  }
  if (a.audioTracks.length) options.push({ value: 'audio', label: 'Audio' });
  if (!options.length) return null;
  if (!selection.has(m.id)) {
    const pref = settings.preferredVideoQuality;
    const match = options.find((o) => o.value === pref);
    selection.set(m.id, match ? match.value : options[0]!.value);
  }
  const current = selection.get(m.id);
  const chips = h('div', { class: 'chips', role: 'radiogroup', aria: { label: 'Available streams' } });
  for (const o of options) {
    const chip = h('button', {
      class: 'chip',
      role: 'radio',
      aria: { checked: String(o.value === current) },
      title: o.hint ?? o.label,
      on: {
        click: () => {
          selection.set(m.id, o.value);
          render();
        },
      },
    });
    chip.append(o.label);
    if (o.hint) chip.append(h('small', { text: o.hint }));
    chips.append(chip);
  }
  return h('div', { class: 'streams' }, h('div', { class: 'streams-label', text: 'Available streams' }), chips);
}

function mediaCard(m: MediaResource): HTMLElement {
  const meta = [displayQuality(m.qualityLabel), mediaTypeLabel(m), estimatedSize(m), formatDuration(m.duration)].filter(Boolean).join(' • ');
  const badges = h('div', { class: 'badges' });
  if (m.isStream) badges.append(h('span', { class: 'badge accent', text: 'Stream' }));
  if (m.isProtected) badges.append(h('span', { class: 'badge danger', text: 'Protected' }));
  if (m.analysis?.status === 'live') badges.append(h('span', { class: 'badge warning', text: 'Live' }));
  if (m.isBlob) badges.append(h('span', { class: 'badge', text: 'In-page' }));

  const blocked = m.isProtected || m.analysis?.status === 'live' || m.analysis?.status === 'error';
  const st = statuses.get(m.id);
  const status = h('div', { class: `status ${st?.kind === 'error' ? 'error' : st?.kind === 'ok' ? 'ok' : ''}`, text: st?.text ?? '' });
  if (m.isProtected) {
    status.className = 'status error';
    status.textContent = 'Protected media — downloading is not supported.';
  }
  const btn = h('button', {
    class: 'btn primary small',
    text: 'Download',
    disabled: blocked || (m.isStream && !m.analysis),
    aria: { label: `Download ${mediaDisplayTitle(m)}` },
    on: { click: () => void download(m) },
  });

  return h(
    'article',
    { class: 'card media' },
    h('div', { class: 'media-head' }, thumb(m), h('div', { class: 'media-info' }, h('div', { class: 'media-title truncate', text: mediaDisplayTitle(m), title: mediaDisplayTitle(m) }), h('div', { class: 'media-meta', text: meta }), badges)),
    streamChooser(m),
    h('div', { class: 'media-actions' }, status, btn),
  );
}

function render(): void {
  content.setAttribute('aria-busy', 'false');
  clear(content);
  clear(notices);
  if (lastResponse?.excluded) {
    notices.append(notice('Scanning is disabled for this site. You can change this in Settings.', 'warning'));
  }
  if (lastResponse?.emeActive && media.some((m) => m.isStream)) {
    notices.append(notice('This page uses encrypted media. Protected streams cannot be downloaded.', ''));
  }
  const visible = media;
  downloadAllBtn.disabled = !visible.some((m) => !m.isProtected && m.analysis?.status !== 'live');
  if (!visible.length) {
    content.append(
      h(
        'div',
        { class: 'empty' },
        h('p', { text: 'No downloadable media detected on this page.' }),
        h('button', { class: 'btn', text: 'Scan Again', on: { click: () => void rescan() } }),
      ),
    );
    return;
  }
  content.append(h('div', { class: 'section-title', text: `Detected media (${visible.length})` }));
  for (const m of visible) content.append(mediaCard(m));
}

/* ------------------------------ actions ------------------------------ */

async function download(m: MediaResource): Promise<void> {
  if (tabId === undefined) return;
  setStatus(m.id, m.isStream ? 'Preparing stream…' : 'Starting…', 'info');
  const quality = selection.get(m.id) ?? 'auto';
  const r = await request<DownloadJob>({ type: 'DOWNLOAD', request: { tabId, mediaId: m.id, quality } });
  if (r.ok) setStatus(m.id, `Added to downloads: ${r.data.filename.split('/').pop()}`, 'ok');
  else setStatus(m.id, settings.debugLogging && r.detail ? `${r.message} (${r.detail})` : r.message, 'error');
}

async function downloadAll(): Promise<void> {
  if (tabId === undefined) return;
  downloadAllBtn.disabled = true;
  const r = await request<Array<{ ok: boolean }>>({ type: 'DOWNLOAD_ALL', tabId, quality: allQuality.value as QualityPreference });
  downloadAllBtn.disabled = false;
  clear(notices);
  if (!r.ok) notices.append(notice(r.message, 'danger'));
  else {
    const started = r.data.filter((x) => x.ok).length;
    const failed = r.data.length - started;
    notices.append(notice(`${started} download${started === 1 ? '' : 's'} added${failed ? `, ${failed} could not be started` : ''}.`, failed ? 'warning' : ''));
  }
}

async function rescan(): Promise<void> {
  if (tabId === undefined) return;
  content.setAttribute('aria-busy', 'true');
  const r = await request<TabMediaResponse>({ type: 'RESCAN_TAB', tabId });
  if (!r.ok) {
    clear(notices);
    notices.append(notice(r.message, 'warning'));
    return;
  }
  // Results arrive through the live subscription; refresh once after the content script flushes.
  setTimeout(() => void refresh(), 700);
}

function analyzeStreams(): void {
  if (tabId === undefined) return;
  for (const m of media) {
    if (!m.isStream || m.analysis || analyzing.has(m.id)) continue;
    analyzing.add(m.id);
    void request<MediaResource>({ type: 'ANALYZE_MEDIA', tabId, mediaId: m.id }).then((r) => {
      analyzing.delete(m.id);
      if (r.ok) {
        media = media.map((x) => (x.id === r.data.id ? r.data : x));
      } else {
        statuses.set(m.id, { text: r.message, kind: 'error' });
      }
      render();
    });
  }
}

function setMedia(list: MediaResource[]): void {
  media = list;
  render();
  analyzeStreams();
}

async function refresh(): Promise<void> {
  if (tabId === undefined) return;
  const r = await request<TabMediaResponse>({ type: 'GET_TAB_MEDIA', tabId });
  if (!r.ok) {
    content.setAttribute('aria-busy', 'false');
    clear(content);
    content.append(notice(r.message, 'danger'));
    return;
  }
  lastResponse = r.data;
  $('page-host').textContent = hostnameOf(r.data.pageUrl) || 'This page';
  $('page-title').textContent = r.data.pageTitle ?? '';
  setMedia(r.data.media);
}

function updateSummary(jobs: DownloadJob[]): void {
  const active = jobs.filter((j) => j.status === 'active').length;
  const queued = jobs.filter((j) => j.status === 'queued').length;
  $('dl-summary').textContent = active || queued ? `${active} downloading${queued ? ` · ${queued} queued` : ''}` : '';
}

/* ------------------------------ init --------------------------------- */

async function init(): Promise<void> {
  settings = await loadSettings();
  applyTheme(settings.theme);
  $('open-options').addEventListener('click', () => void chrome.runtime.openOptionsPage());
  $('open-manager').addEventListener('click', () => void chrome.tabs.create({ url: chrome.runtime.getURL('manager/manager.html') }));
  $('scan-again').addEventListener('click', () => void rescan());
  downloadAllBtn.addEventListener('click', () => void downloadAll());

  // "?tab=<id>" lets the popup be opened as a page for a specific tab (automation, accessibility tools).
  const forced = Number(new URLSearchParams(location.search).get('tab'));
  const [tab] = Number.isInteger(forced) && forced > 0 ? [await chrome.tabs.get(forced).catch(() => undefined)] : await chrome.tabs.query({ active: true, currentWindow: true });
  tabId = tab?.id;
  if (tabId === undefined || !tab?.url || !/^https?:/.test(tab.url)) {
    content.setAttribute('aria-busy', 'false');
    clear(content);
    content.append(h('div', { class: 'empty' }, h('p', { text: 'MediaForge works on regular web pages (http/https).' })));
    downloadAllBtn.disabled = true;
    return;
  }
  subscribe((msg: BackgroundPush) => {
    if (msg.type === 'TAB_MEDIA_UPDATED' && msg.tabId === tabId) setMedia(msg.media);
    else if (msg.type === 'DOWNLOADS_UPDATED') updateSummary(msg.jobs);
  });
  await refresh();
}

void init();
