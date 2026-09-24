import type { MediaCandidate } from '../types';
import { debounce } from '../utils/timing';
import { candidatesFromElement, candidatesFromPerformance, MEDIA_SELECTOR, scanRoot, type BlobRegistry } from './dom-detector';

export interface PageObserverCallbacks {
  onCandidates(c: MediaCandidate[]): void;
  onNavigate(url: string): void;
}

/**
 * Event-driven observation of the page:
 *  - one MutationObserver (childList + src/poster/href attributes only);
 *    added nodes are queued and processed in a debounced batch, scanning only
 *    the added subtrees — never the whole document
 *  - capture-phase media events (loadstart/loadedmetadata) for players that
 *    set src/srcObject programmatically
 *  - a PerformanceObserver for resource timing entries
 *  - URL change checks on pushState/replaceState/popstate/hashchange
 * No polling.
 */
export class PageObserver {
  private mutationObserver?: MutationObserver;
  private perfObserver?: PerformanceObserver;
  private pending = new Set<Element>();
  private lastUrl = location.href.split('#')[0]!;
  /**
   * Resource Timing keeps entries from before an SPA navigation; after a route
   * change only entries that started shortly before it (players often start
   * loading just before pushState) or later are considered.
   */
  private perfCutoff = 0;
  private active = false;
  private readonly flushPending = debounce(() => this.processPending(), 300, 1500);
  private readonly checkUrl = debounce(() => this.detectNavigation(), 150);

  constructor(
    private readonly cb: PageObserverCallbacks,
    private readonly blobs: BlobRegistry,
  ) {}

  start(): void {
    if (this.active) return;
    this.active = true;
    this.mutationObserver = new MutationObserver((records) => this.onMutations(records));
    const root = document.documentElement ?? document;
    this.mutationObserver.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['src', 'poster', 'href'] });

    document.addEventListener('loadstart', this.onMediaEvent, true);
    document.addEventListener('loadedmetadata', this.onMediaEvent, true);
    window.addEventListener('popstate', this.onHistory);
    window.addEventListener('hashchange', this.onHistory);

    try {
      this.perfObserver = new PerformanceObserver((list) => {
        const c = candidatesFromPerformance(list.getEntries());
        if (c.length) this.cb.onCandidates(c);
      });
      this.perfObserver.observe({ type: 'resource', buffered: true });
    } catch {
      /* PerformanceObserver unavailable */
    }
    this.fullScan();
  }

  stop(): void {
    this.active = false;
    this.mutationObserver?.disconnect();
    this.perfObserver?.disconnect();
    document.removeEventListener('loadstart', this.onMediaEvent, true);
    document.removeEventListener('loadedmetadata', this.onMediaEvent, true);
    window.removeEventListener('popstate', this.onHistory);
    window.removeEventListener('hashchange', this.onHistory);
    this.flushPending.cancel();
    this.pending.clear();
  }

  /** One-off complete scan (initial load, SPA navigation, "Scan again"). */
  fullScan(): void {
    const c = document.documentElement ? scanRoot(document, this.blobs) : [];
    try {
      c.push(...candidatesFromPerformance(performance.getEntriesByType('resource').filter((e) => e.startTime >= this.perfCutoff)));
    } catch {
      /* ignore */
    }
    this.cb.onCandidates(c);
  }

  /** Called by the hook bridge when the page used pushState/replaceState. */
  notifyHistoryChange(): void {
    this.checkUrl();
  }

  private readonly onHistory = (): void => this.checkUrl();

  private detectNavigation(): void {
    const now = location.href.split('#')[0]!;
    if (now === this.lastUrl) return;
    this.lastUrl = now;
    this.perfCutoff = Math.max(0, performance.now() - 1500);
    this.cb.onNavigate(location.href);
    // Let the new view render, then rescan once.
    setTimeout(() => this.fullScan(), 800);
  }

  private readonly onMediaEvent = (e: Event): void => {
    const t = e.target;
    if (t instanceof HTMLMediaElement) {
      const c = candidatesFromElement(t, this.blobs);
      if (c.length) this.cb.onCandidates(c);
    }
  };

  private onMutations(records: MutationRecord[]): void {
    for (const r of records) {
      if (r.type === 'attributes') {
        if (r.target instanceof Element) this.pending.add(r.target);
      } else {
        r.addedNodes.forEach((n) => {
          if (n instanceof Element) this.pending.add(n);
        });
      }
    }
    if (this.pending.size) this.flushPending();
  }

  private processPending(): void {
    const nodes = [...this.pending];
    this.pending.clear();
    const out: MediaCandidate[] = [];
    for (const n of nodes) {
      if (!n.isConnected) continue;
      if (n.matches(MEDIA_SELECTOR)) out.push(...candidatesFromElement(n, this.blobs));
      // Skip leaf elements quickly; only query subtrees that can contain media.
      if (n.firstElementChild) out.push(...scanRoot(n, this.blobs).filter((c) => !out.some((o) => o.url === c.url)));
    }
    if (out.length) this.cb.onCandidates(out);
  }
}
