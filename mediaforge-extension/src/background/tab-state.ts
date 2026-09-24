import { MediaCollection } from '../detector/collection';
import type { MediaResource } from '../types';
import { createLogger } from '../utils/logger';
import { debounce, type Debounced } from '../utils/timing';

const log = createLogger('tabs');
const KEY_PREFIX = 'tab:';

export interface TabState {
  tabId: number;
  pageUrl?: string;
  pageTitle?: string;
  collection: MediaCollection;
  emeActive: boolean;
  posterHint?: string;
  autoDownloaded: number;
}

interface Snapshot {
  pageUrl?: string;
  pageTitle?: string;
  emeActive: boolean;
  posterHint?: string;
  autoDownloaded: number;
  media: ReturnType<MediaCollection['toJSON']>;
}

/**
 * In-memory per-tab media state, mirrored to chrome.storage.session so it
 * survives service-worker restarts. Session storage is memory-only, never
 * synced, cleared when the browser closes and inaccessible to content scripts.
 */
export class TabStateStore {
  private tabs = new Map<number, TabState>();
  private savers = new Map<number, Debounced<[]>>();
  private loaded: Promise<void> | undefined;
  private listeners = new Set<(tabId: number, media: MediaResource[]) => void>();

  load(): Promise<void> {
    this.loaded ??= (async () => {
      try {
        await chrome.storage.session.setAccessLevel?.({ accessLevel: 'TRUSTED_CONTEXTS' });
        const all = await chrome.storage.session.get(null);
        for (const [k, v] of Object.entries(all)) {
          if (!k.startsWith(KEY_PREFIX)) continue;
          const tabId = Number(k.slice(KEY_PREFIX.length));
          const snap = v as Snapshot;
          if (!Number.isInteger(tabId) || !snap?.media) continue;
          const state: TabState = {
            tabId,
            collection: new MediaCollection(snap.media),
            emeActive: !!snap.emeActive,
            autoDownloaded: snap.autoDownloaded ?? 0,
          };
          if (snap.pageUrl) state.pageUrl = snap.pageUrl;
          if (snap.pageTitle) state.pageTitle = snap.pageTitle;
          if (snap.posterHint) state.posterHint = snap.posterHint;
          this.tabs.set(tabId, state);
        }
      } catch (e) {
        log.warn('Could not restore tab state', e);
      }
    })();
    return this.loaded;
  }

  onChange(cb: (tabId: number, media: MediaResource[]) => void): void {
    this.listeners.add(cb);
  }

  async get(tabId: number): Promise<TabState> {
    await this.load();
    let s = this.tabs.get(tabId);
    if (!s) {
      s = { tabId, collection: new MediaCollection(), emeActive: false, autoDownloaded: 0 };
      this.tabs.set(tabId, s);
    }
    return s;
  }

  peek(tabId: number): TabState | undefined {
    return this.tabs.get(tabId);
  }

  /** Persist and notify listeners (debounced per tab). */
  touch(tabId: number): void {
    let saver = this.savers.get(tabId);
    if (!saver) {
      saver = debounce(() => void this.flush(tabId), 250, 1000);
      this.savers.set(tabId, saver);
    }
    saver();
  }

  private async flush(tabId: number): Promise<void> {
    const s = this.tabs.get(tabId);
    if (!s) return;
    const media = s.collection.list();
    for (const cb of this.listeners) cb(tabId, media);
    const snap: Snapshot = { emeActive: s.emeActive, autoDownloaded: s.autoDownloaded, media: s.collection.toJSON() };
    if (s.pageUrl) snap.pageUrl = s.pageUrl;
    if (s.pageTitle) snap.pageTitle = s.pageTitle;
    if (s.posterHint) snap.posterHint = s.posterHint;
    try {
      await chrome.storage.session.set({ [KEY_PREFIX + tabId]: snap });
    } catch (e) {
      log.warn('Could not persist tab state', e);
    }
  }

  /** Full reset (new document loaded in the tab). */
  async reset(tabId: number, pageUrl?: string): Promise<TabState> {
    const s = await this.get(tabId);
    s.collection.clear();
    s.emeActive = false;
    s.autoDownloaded = 0;
    delete s.posterHint;
    delete s.pageTitle;
    if (pageUrl) s.pageUrl = pageUrl;
    this.touch(tabId);
    return s;
  }

  async remove(tabId: number): Promise<void> {
    this.savers.get(tabId)?.cancel();
    this.savers.delete(tabId);
    this.tabs.delete(tabId);
    try {
      await chrome.storage.session.remove(KEY_PREFIX + tabId);
    } catch {
      /* ignore */
    }
  }
}
