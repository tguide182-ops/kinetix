import { analyzeStream, planDash, planHls, type ParsedStream, type PlanOptions } from '../detector/manifest/analyze';
import { fetchText } from '../detector/manifest/fetch-text';
import type { MediaResource, StreamAnalysis, StreamPlan } from '../types';
import { MediaForgeError } from '../utils/errors';
import { createLogger } from '../utils/logger';
import type { TabStateStore } from './tab-state';

const log = createLogger('analyzer');
const CACHE_SIZE = 20;
const FRESH_MS = 5 * 60_000;

/**
 * Lazily fetches and parses manifests (only when the user opens the popup or
 * starts a download) and caches parsed results in memory.
 */
export class StreamAnalyzer {
  private parsed = new Map<string, ParsedStream>();
  private inflight = new Map<string, Promise<{ analysis: StreamAnalysis; parsed?: ParsedStream }>>();

  constructor(private readonly tabs: TabStateStore) {}

  private remember(url: string, p: ParsedStream): void {
    this.parsed.delete(url);
    this.parsed.set(url, p);
    while (this.parsed.size > CACHE_SIZE) this.parsed.delete(this.parsed.keys().next().value!);
  }

  private run(kind: 'hls' | 'dash', url: string): Promise<{ analysis: StreamAnalysis; parsed?: ParsedStream }> {
    let p = this.inflight.get(url);
    if (!p) {
      p = analyzeStream(kind, url, fetchText).finally(() => this.inflight.delete(url));
      this.inflight.set(url, p);
    }
    return p;
  }

  async analyze(tabId: number, mediaId: string, force = false): Promise<MediaResource> {
    const state = await this.tabs.get(tabId);
    const item = state.collection.get(mediaId);
    if (!item) throw new MediaForgeError('NO_MEDIA');
    if (!item.isStream || (item.type !== 'hls' && item.type !== 'dash')) return item;
    if (!force && item.analysis && item.analysis.status !== 'error' && Date.now() - item.analysis.analyzedAt < FRESH_MS) return item;
    const { analysis, parsed } = await this.run(item.type, item.url);
    if (parsed) this.remember(item.url, parsed);
    if (analysis.status === 'error') log.info('Manifest analysis failed', analysis.errorCode, item.url);
    const updated = state.collection.setAnalysis(mediaId, analysis) ?? item;
    this.tabs.touch(tabId);
    return updated;
  }

  async plan(kind: 'hls' | 'dash', url: string, opts: PlanOptions): Promise<StreamPlan> {
    let parsed = this.parsed.get(url);
    if (!parsed) {
      const r = await this.run(kind, url);
      if (!r.parsed) throw new MediaForgeError(r.analysis.errorCode === 'NETWORK' ? 'NETWORK' : 'MANIFEST_PARSE', { transient: r.analysis.errorCode === 'NETWORK' });
      parsed = r.parsed;
      this.remember(url, parsed);
    }
    return kind === 'hls' ? planHls(parsed, opts, fetchText) : planDash(parsed, opts);
  }
}
