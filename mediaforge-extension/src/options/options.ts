import { addDomain, loadSettings, onSettingsChanged, removeDomain, resetSettings, saveSettings } from '../storage/settings';
import type { Settings } from '../types';
import { request } from '../ui/api';
import { applyTheme, clear, h } from '../utils/dom';
import type { LogEntry } from '../utils/logger';
import { debounce } from '../utils/timing';
import { normalizeDomain } from '../utils/url';

const form = document.getElementById('form') as HTMLFormElement;
const saved = document.getElementById('saved')!;
let current: Settings;

const TEXT_FIELDS = ['downloadFolder', 'filenameTemplate'] as const;
const NUMBER_FIELDS = ['maxConcurrentDownloads', 'maxRetries', 'segmentConcurrency'] as const;
const SELECT_FIELDS = ['preferredVideoQuality', 'preferredAudioQuality', 'theme'] as const;
const CHECK_FIELDS = ['askWhereToSave', 'autoDownload', 'showFloatingPanel', 'showVideoButton', 'autoDetect', 'showNotifications', 'debugLogging'] as const;

function field<T extends HTMLElement>(name: string): T {
  return form.elements.namedItem(name) as unknown as T;
}

function fill(s: Settings): void {
  for (const k of TEXT_FIELDS) if (document.activeElement !== field(k)) field<HTMLInputElement>(k).value = s[k];
  for (const k of NUMBER_FIELDS) if (document.activeElement !== field(k)) field<HTMLInputElement>(k).value = String(s[k]);
  for (const k of SELECT_FIELDS) field<HTMLSelectElement>(k).value = s[k];
  for (const k of CHECK_FIELDS) field<HTMLInputElement>(k).checked = s[k];
  renderDomains('excluded-list', 'excludedSites', s.excludedSites, 'No sites excluded.');
  renderDomains('panel-list', 'panelDisabledSites', s.panelDisabledSites, 'None — use “Disable on this site” in the panel.');
  (document.getElementById('debug-box') as HTMLElement).hidden = !s.debugLogging;
  applyTheme(s.theme);
}

function renderDomains(listId: string, key: 'excludedSites' | 'panelDisabledSites', domains: string[], emptyText: string): void {
  const ul = document.getElementById(listId)!;
  clear(ul);
  if (!domains.length) {
    ul.append(h('li', { class: 'none', text: emptyText }));
    return;
  }
  for (const d of domains) {
    ul.append(
      h('li', {}, d, h('button', { type: 'button', title: `Remove ${d}`, aria: { label: `Remove ${d}` }, text: '×', on: { click: () => void removeDomain(key, d) } })),
    );
  }
}

function flashSaved(): void {
  saved.textContent = 'Saved';
  setTimeout(() => (saved.textContent = ''), 1500);
}

function collect(): Partial<Settings> {
  const patch: Record<string, unknown> = {};
  for (const k of TEXT_FIELDS) patch[k] = field<HTMLInputElement>(k).value;
  for (const k of NUMBER_FIELDS) patch[k] = Number(field<HTMLInputElement>(k).value);
  for (const k of SELECT_FIELDS) patch[k] = field<HTMLSelectElement>(k).value;
  for (const k of CHECK_FIELDS) patch[k] = field<HTMLInputElement>(k).checked;
  return patch as Partial<Settings>;
}

const save = debounce(async () => {
  current = await saveSettings(collect());
  flashSaved();
}, 400);

async function addExcluded(): Promise<void> {
  const input = document.getElementById('excluded-input') as HTMLInputElement;
  const err = document.getElementById('excluded-error')!;
  const d = normalizeDomain(input.value);
  if (!d) {
    err.textContent = 'Enter a valid domain such as example.com';
    return;
  }
  err.textContent = '';
  input.value = '';
  await addDomain('excludedSites', d);
  flashSaved();
}

async function refreshLog(): Promise<void> {
  const pre = document.getElementById('debug-log')!;
  const r = await request<LogEntry[]>({ type: 'GET_DEBUG_LOG' });
  const entries = r.ok ? r.data : [];
  pre.textContent = entries.length
    ? entries.map((e) => `${new Date(e.t).toISOString()} ${e.level.toUpperCase().padEnd(5)} [${e.scope}] ${e.msg}`).join('\n')
    : 'No log entries yet.';
}

async function init(): Promise<void> {
  current = await loadSettings();
  fill(current);
  onSettingsChanged((s) => {
    current = s;
    fill(s);
  });
  form.addEventListener('input', (e) => {
    const t = e.target as HTMLElement;
    if (t.id === 'excluded-input') return;
    void save();
  });
  form.addEventListener('change', (e) => {
    const t = e.target as HTMLElement;
    if (t.id === 'excluded-input') return;
    save();
    save.flush();
  });
  form.addEventListener('submit', (e) => e.preventDefault());
  document.getElementById('excluded-add')!.addEventListener('click', () => void addExcluded());
  document.getElementById('excluded-input')!.addEventListener('keydown', (e) => {
    if ((e as KeyboardEvent).key === 'Enter') {
      e.preventDefault();
      void addExcluded();
    }
  });
  document.getElementById('debug-refresh')!.addEventListener('click', () => void refreshLog());
  document.getElementById('debug-clear')!.addEventListener('click', async () => {
    await request({ type: 'CLEAR_DEBUG_LOG' });
    await refreshLog();
  });
  document.getElementById('reset')!.addEventListener('click', async () => {
    if (!confirm('Reset all MediaForge settings to their defaults?')) return;
    current = await resetSettings();
    fill(current);
    flashSaved();
  });
  if (current.debugLogging) void refreshLog();
}

void init();
