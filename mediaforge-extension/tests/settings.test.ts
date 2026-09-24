import { describe, expect, it } from 'vitest';
import { addDomain, DEFAULT_SETTINGS, loadSettings, normalizeSettings, removeDomain, saveSettings, SETTINGS_KEY, type StorageAreaLike } from '../src/storage/settings';

function memoryArea(initial: Record<string, unknown> = {}): StorageAreaLike & { data: Record<string, unknown> } {
  const data: Record<string, unknown> = { ...initial };
  return {
    data,
    async get(keys) {
      const ks = Array.isArray(keys) ? keys : [keys];
      return Object.fromEntries(ks.filter((k) => k in data).map((k) => [k, structuredClone(data[k])]));
    },
    async set(items) {
      Object.assign(data, structuredClone(items));
    },
  };
}

describe('settings', () => {
  it('returns defaults when nothing is stored', async () => {
    expect(await loadSettings(memoryArea())).toEqual(DEFAULT_SETTINGS);
  });

  it('never enables automatic downloading by default', () => {
    expect(DEFAULT_SETTINGS.autoDownload).toBe(false);
  });

  it('clamps numbers and rejects invalid enum values', () => {
    const s = normalizeSettings({ maxConcurrentDownloads: 99, maxRetries: -3, segmentConcurrency: '6', preferredVideoQuality: '8K', theme: 'neon' });
    expect(s.maxConcurrentDownloads).toBe(8);
    expect(s.maxRetries).toBe(0);
    expect(s.segmentConcurrency).toBe(6);
    expect(s.preferredVideoQuality).toBe(DEFAULT_SETTINGS.preferredVideoQuality);
    expect(s.theme).toBe('system');
  });

  it('sanitizes the download folder and filename template', () => {
    const s = normalizeSettings({ downloadFolder: '../../etc', filenameTemplate: '{quality}' });
    expect(s.downloadFolder).toBe('etc');
    expect(s.filenameTemplate).toBe(DEFAULT_SETTINGS.filenameTemplate);
  });

  it('persists partial updates', async () => {
    const area = memoryArea();
    await saveSettings({ autoDownload: true, maxRetries: 2 }, area);
    const s = await loadSettings(area);
    expect(s).toMatchObject({ autoDownload: true, maxRetries: 2, showNotifications: true });
    expect(Object.keys(area.data)).toEqual([SETTINGS_KEY]);
  });

  it('adds, normalizes, de-duplicates and removes excluded sites', async () => {
    const area = memoryArea();
    await addDomain('excludedSites', 'https://www.Example.com/page', area);
    await addDomain('excludedSites', 'example.com', area);
    await addDomain('excludedSites', 'not valid!', area);
    await addDomain('excludedSites', 'video.test.org', area);
    expect((await loadSettings(area)).excludedSites).toEqual(['example.com', 'video.test.org']);
    await removeDomain('excludedSites', 'example.com', area);
    expect((await loadSettings(area)).excludedSites).toEqual(['video.test.org']);
  });

  it('survives corrupt stored data and storage failures', async () => {
    expect(await loadSettings(memoryArea({ [SETTINGS_KEY]: 'garbage' }))).toEqual(DEFAULT_SETTINGS);
    const broken: StorageAreaLike = {
      get: async () => {
        throw new Error('quota');
      },
      set: async () => {},
    };
    expect(await loadSettings(broken)).toEqual(DEFAULT_SETTINGS);
  });

  it('does not store unknown (potentially sensitive) keys', () => {
    const s = normalizeSettings({ cookie: 'abc', authorization: 'Bearer x' }) as unknown as Record<string, unknown>;
    expect(s.cookie).toBeUndefined();
    expect(s.authorization).toBeUndefined();
  });
});
