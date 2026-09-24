import { loadSettings, onSettingsChanged } from '../storage/settings';
import type { DownloadJob, DownloadStatus, Settings } from '../types';
import { request, subscribe } from '../ui/api';
import { applyTheme, clear, h } from '../utils/dom';
import { formatBytes, formatEta, formatSpeed } from '../utils/format';
import { displayQuality } from '../utils/quality';

type Filter = 'all' | 'active' | 'queued' | 'paused' | 'completed' | 'failed';
const FILTERS: Array<{ id: Filter; label: string; match: (s: DownloadStatus) => boolean }> = [
  { id: 'all', label: 'All', match: () => true },
  { id: 'active', label: 'Active', match: (s) => s === 'active' },
  { id: 'queued', label: 'Queued', match: (s) => s === 'queued' },
  { id: 'paused', label: 'Paused', match: (s) => s === 'paused' },
  { id: 'completed', label: 'Completed', match: (s) => s === 'completed' },
  { id: 'failed', label: 'Failed', match: (s) => s === 'failed' || s === 'cancelled' },
];
const STATUS_TEXT: Record<DownloadStatus, string> = {
  queued: 'Queued',
  active: 'Downloading',
  paused: 'Paused',
  completed: 'Completed',
  failed: 'Failed',
  cancelled: 'Cancelled',
};

const list = document.getElementById('list')!;
const filters = document.getElementById('filters')!;
let jobs: DownloadJob[] = [];
let filter: Filter = 'all';
let settings: Settings;

function act(jobId: string, action: 'pause' | 'resume' | 'cancel' | 'retry' | 'remove' | 'show'): void {
  void request({ type: 'DOWNLOAD_ACTION', jobId, action });
}

function button(label: string, onClick: () => void, cls = 'btn small'): HTMLButtonElement {
  return h('button', { class: cls, text: label, on: { click: onClick } });
}

function progressBar(j: DownloadJob): HTMLElement {
  const known = j.totalBytes && j.totalBytes > 0;
  const pct = known ? Math.min(100, (j.bytesReceived / j.totalBytes!) * 100) : j.status === 'completed' ? 100 : 0;
  const bar = h('div', {
    class: `progress ${!known && j.status === 'active' ? 'indeterminate' : ''}`,
    role: 'progressbar',
    aria: { valuemin: '0', valuemax: '100', ...(known ? { valuenow: String(Math.round(pct)) } : {}), label: 'Download progress' },
  });
  bar.append(h('span', { style: { width: `${pct}%` } }));
  return bar;
}

function jobRow(j: DownloadJob): HTMLElement {
  const name = j.filename.split('/').pop() ?? j.filename;
  const type = j.mode === 'stream' ? `${j.mediaType.toUpperCase()} stream` : j.format === 'unknown' ? j.mediaType : j.format.toUpperCase();
  const size = j.totalBytes ? `${formatBytes(j.bytesReceived)} of ${formatBytes(j.totalBytes, j.mode === 'stream' && j.status !== 'completed')}` : formatBytes(j.bytesReceived);
  const meta = h(
    'div',
    { class: 'job-meta' },
    h('span', { class: `status-${j.status}`, text: STATUS_TEXT[j.status] }),
    h('span', { text: displayQuality(j.qualityLabel) }),
    h('span', { text: type }),
    size ? h('span', { text: size }) : null,
    j.status === 'active' && j.speed ? h('span', { text: formatSpeed(j.speed) }) : null,
    j.status === 'active' && j.eta ? h('span', { text: formatEta(j.eta) }) : null,
    j.status === 'queued' && j.nextRetryAt ? h('span', { text: `Retrying (attempt ${j.attempts + 1} of ${j.maxRetries + 1})` }) : null,
  );

  const actions = h('div', { class: 'job-actions' });
  if (j.status === 'active' && j.canPause) actions.append(button('Pause', () => act(j.id, 'pause')));
  if (j.status === 'paused') actions.append(button('Resume', () => act(j.id, 'resume')));
  if (j.status === 'failed' || j.status === 'cancelled') actions.append(button('Retry', () => act(j.id, 'retry')));
  if (j.status === 'completed' && j.chromeDownloadIds.length) actions.append(button('Show in folder', () => act(j.id, 'show')));
  if (j.status === 'active' || j.status === 'queued' || j.status === 'paused') actions.append(button('Cancel', () => act(j.id, 'cancel'), 'btn small danger'));
  else actions.append(button('Remove', () => act(j.id, 'remove'), 'btn small ghost'));

  const errorBox =
    j.errorMessage && j.status !== 'completed'
      ? h('div', {}, h('div', { class: 'err', text: j.errorMessage }), settings.debugLogging && j.errorDetail ? h('div', { class: 'detail', text: j.errorDetail }) : null)
      : null;

  return h(
    'article',
    { class: 'card job', aria: { label: name } },
    h('div', { class: 'job-head' }, h('div', { class: 'job-name truncate', text: name, title: j.filename })),
    progressBar(j),
    h('div', { class: 'job-foot' }, meta, actions),
    errorBox,
  );
}

function render(): void {
  clear(filters);
  for (const f of FILTERS) {
    const n = jobs.filter((j) => f.match(j.status)).length;
    const b = h('button', {
      class: 'filter',
      role: 'tab',
      aria: { selected: String(filter === f.id) },
      on: {
        click: () => {
          filter = f.id;
          render();
        },
      },
    });
    b.append(f.label, h('span', { class: 'n', text: String(n) }));
    filters.append(b);
  }
  clear(list);
  const match = FILTERS.find((f) => f.id === filter)!.match;
  const shown = jobs.filter((j) => match(j.status));
  if (!shown.length) {
    list.append(h('div', { class: 'empty', text: jobs.length ? 'Nothing here.' : 'No downloads yet. Open the MediaForge popup on a page with media to start one.' }));
    return;
  }
  for (const j of shown) list.append(jobRow(j));
}

async function init(): Promise<void> {
  settings = await loadSettings();
  applyTheme(settings.theme);
  onSettingsChanged((s) => {
    settings = s;
    applyTheme(s.theme);
    render();
  });
  document.getElementById('clear-finished')!.addEventListener('click', () => void request({ type: 'CLEAR_FINISHED_DOWNLOADS' }));
  document.getElementById('open-options')!.addEventListener('click', () => void chrome.runtime.openOptionsPage());
  const r = await request<DownloadJob[]>({ type: 'GET_DOWNLOADS' });
  if (r.ok) jobs = r.data;
  render();
  subscribe((m) => {
    if (m.type === 'DOWNLOADS_UPDATED') {
      jobs = m.jobs;
      render();
    }
  });
}

void init();
