import type { AudioQualityPreference, QualityPreference, Settings, ThemePreference } from '../types';
import { normalizeDomain } from '../utils/url';
import { sanitizeFolder } from '../utils/filename';

export const SETTINGS_KEY = 'mediaforge.settings.v1';

export const DEFAULT_SETTINGS: Readonly<Settings> = Object.freeze({
  downloadFolder: 'MediaForge',
  askWhereToSave: false,
  filenameTemplate: '{title} - {quality}',
  autoDownload: false,
  showFloatingPanel: false,
  showVideoButton: true,
  maxConcurrentDownloads: 3,
  maxRetries: 4,
  segmentConcurrency: 4,
  preferredVideoQuality: 'highest',
  preferredAudioQuality: 'highest',
  autoDetect: true,
  showNotifications: true,
  theme: 'system',
  debugLogging: false,
  excludedSites: [],
  panelDisabledSites: [],
});

export const LIMITS = {
  maxConcurrentDownloads: [1, 8],
  maxRetries: [0, 10],
  segmentConcurrency: [1, 12],
} as const;

const VIDEO_PREFS: readonly QualityPreference[] = ['auto', 'highest', '2160p', '1440p', '1080p', '720p', '480p', '360p', 'audio'];
const AUDIO_PREFS: readonly AudioQualityPreference[] = ['highest', 'balanced', 'lowest'];
const THEMES: readonly ThemePreference[] = ['system', 'dark', 'light'];

function clampInt(v: unknown, [min, max]: readonly [number, number], fallback: number): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function bool(v: unknown, fallback: boolean): boolean {
  return typeof v === 'boolean' ? v : fallback;
}

function oneOf<T extends string>(v: unknown, allowed: readonly T[], fallback: T): T {
  return typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
}

function domains(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const out = new Set<string>();
  for (const d of v) {
    if (typeof d !== 'string') continue;
    const n = normalizeDomain(d);
    if (n) out.add(n);
    if (out.size >= 500) break;
  }
  return [...out].sort();
}

/** Validate and clamp any stored/partial object into a complete Settings value. */
export function normalizeSettings(raw: unknown): Settings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const d = DEFAULT_SETTINGS;
  const template = typeof r.filenameTemplate === 'string' ? r.filenameTemplate.replace(/[\u0000-\u001f]/g, '').slice(0, 100) : d.filenameTemplate;
  return {
    downloadFolder: typeof r.downloadFolder === 'string' ? sanitizeFolder(r.downloadFolder) : d.downloadFolder,
    askWhereToSave: bool(r.askWhereToSave, d.askWhereToSave),
    filenameTemplate: template.includes('{title}') ? template : d.filenameTemplate,
    autoDownload: bool(r.autoDownload, d.autoDownload),
    showFloatingPanel: bool(r.showFloatingPanel, d.showFloatingPanel),
    showVideoButton: bool(r.showVideoButton, d.showVideoButton),
    maxConcurrentDownloads: clampInt(r.maxConcurrentDownloads, LIMITS.maxConcurrentDownloads, d.maxConcurrentDownloads),
    maxRetries: clampInt(r.maxRetries, LIMITS.maxRetries, d.maxRetries),
    segmentConcurrency: clampInt(r.segmentConcurrency, LIMITS.segmentConcurrency, d.segmentConcurrency),
    preferredVideoQuality: oneOf(r.preferredVideoQuality, VIDEO_PREFS, d.preferredVideoQuality),
    preferredAudioQuality: oneOf(r.preferredAudioQuality, AUDIO_PREFS, d.preferredAudioQuality),
    autoDetect: bool(r.autoDetect, d.autoDetect),
    showNotifications: bool(r.showNotifications, d.showNotifications),
    theme: oneOf(r.theme, THEMES, d.theme),
    debugLogging: bool(r.debugLogging, d.debugLogging),
    excludedSites: domains(r.excludedSites),
    panelDisabledSites: domains(r.panelDisabledSites),
  };
}

/**
 * Minimal subset of chrome.storage.StorageArea we depend on — lets tests
 * inject an in-memory implementation.
 */
export interface StorageAreaLike {
  get(keys: string | string[]): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
}

function defaultArea(): StorageAreaLike {
  // Settings sync across the user's browsers; fall back to local storage when sync is unavailable.
  return (chrome.storage.sync ?? chrome.storage.local) as unknown as StorageAreaLike;
}

export async function loadSettings(area: StorageAreaLike = defaultArea()): Promise<Settings> {
  try {
    const res = await area.get(SETTINGS_KEY);
    return normalizeSettings(res[SETTINGS_KEY]);
  } catch {
    return normalizeSettings({});
  }
}

export async function saveSettings(patch: Partial<Settings>, area: StorageAreaLike = defaultArea()): Promise<Settings> {
  const current = await loadSettings(area);
  const next = normalizeSettings({ ...current, ...patch });
  await area.set({ [SETTINGS_KEY]: next });
  return next;
}

export async function resetSettings(area: StorageAreaLike = defaultArea()): Promise<Settings> {
  const next = normalizeSettings({});
  await area.set({ [SETTINGS_KEY]: next });
  return next;
}

/** Subscribe to settings changes from any extension context. Returns an unsubscribe function. */
export function onSettingsChanged(cb: (s: Settings) => void): () => void {
  const listener = (changes: Record<string, chrome.storage.StorageChange>): void => {
    const change = changes[SETTINGS_KEY];
    if (change) cb(normalizeSettings(change.newValue));
  };
  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
}

export async function addDomain(list: 'excludedSites' | 'panelDisabledSites', domain: string, area?: StorageAreaLike): Promise<Settings> {
  const n = normalizeDomain(domain);
  const current = await loadSettings(area);
  if (!n || current[list].includes(n)) return current;
  return saveSettings({ [list]: [...current[list], n] }, area);
}

export async function removeDomain(list: 'excludedSites' | 'panelDisabledSites', domain: string, area?: StorageAreaLike): Promise<Settings> {
  const current = await loadSettings(area);
  return saveSettings({ [list]: current[list].filter((d) => d !== domain) }, area);
}
