import { DownloadQueue } from '../download/queue';
import type { BackgroundPush, DownloadJob, DownloadRequest, MediaResource, QualityPreference, Result, Settings, StreamPlan } from '../types';
import { MediaForgeError, toMediaForgeError } from '../utils/errors';
import { buildFilename, FilenameRegistry, joinDownloadPath } from '../utils/filename';
import { createLogger } from '../utils/logger';
import { classifyMedia, extensionForFormat } from '../utils/mime';
import { isAcceptableMediaUrl, isBlobUrl, isHttpUrl } from '../utils/url';
import { debounce } from '../utils/timing';
import type { StreamAnalyzer } from './analyzer';
import { BlobExecutor, DirectExecutor, StreamExecutor } from './executors';
import type { TabStateStore } from './tab-state';

const log = createLogger('downloads');
const JOBS_KEY = 'downloads.v1';

export class DownloadService {
  readonly queue: DownloadQueue;
  readonly stream: StreamExecutor;
  private readonly registry = new FilenameRegistry();
  private readonly ports = new Set<chrome.runtime.Port>();
  private progressTimer: ReturnType<typeof setInterval> | undefined;

  constructor(
    private readonly settings: () => Settings,
    private readonly tabs: TabStateStore,
    private readonly analyzer: StreamAnalyzer,
  ) {
    const env = {
      saveAs: () => this.settings().askWhereToSave,
      segmentConcurrency: () => this.settings().segmentConcurrency,
      maxRetries: () => this.settings().maxRetries,
      replan: (job: DownloadJob) => this.replan(job),
    };
    this.stream = new StreamExecutor(env);
    const persist = debounce(() => void this.persist(), 500, 2000);
    const broadcast = debounce(() => this.broadcast({ type: 'DOWNLOADS_UPDATED', jobs: this.publicJobs() }), 200, 500);
    this.queue = new DownloadQueue({
      executors: { direct: new DirectExecutor(env), stream: this.stream, blob: new BlobExecutor() },
      maxConcurrent: settings().maxConcurrentDownloads,
      onChange: () => {
        persist();
        broadcast();
        this.updateProgressPolling();
      },
      onFinished: (job) => this.notifyFinished(job),
    });
  }

  async restore(): Promise<void> {
    try {
      const res = await chrome.storage.session.get(JOBS_KEY);
      const jobs = res[JOBS_KEY];
      if (Array.isArray(jobs)) this.queue.restore(jobs as DownloadJob[]);
    } catch (e) {
      log.warn('Could not restore downloads', e);
    }
  }

  /** Jobs without large stream plans — what UIs and storage need. */
  publicJobs(): DownloadJob[] {
    return this.queue.list().map(({ plan: _plan, ...rest }) => rest as DownloadJob);
  }

  private async persist(): Promise<void> {
    try {
      await chrome.storage.session.set({ [JOBS_KEY]: this.publicJobs() });
    } catch (e) {
      log.warn('Could not persist downloads', e);
    }
  }

  addPort(port: chrome.runtime.Port): void {
    this.ports.add(port);
    port.onDisconnect.addListener(() => {
      this.ports.delete(port);
      this.updateProgressPolling();
    });
    port.postMessage({ type: 'DOWNLOADS_UPDATED', jobs: this.publicJobs() } satisfies BackgroundPush);
    this.updateProgressPolling();
  }

  broadcast(msg: BackgroundPush): void {
    for (const p of this.ports) {
      try {
        p.postMessage(msg);
      } catch {
        this.ports.delete(p);
      }
    }
  }

  /**
   * chrome.downloads does not emit byte-progress events, so progress of direct
   * downloads is polled — but only while a UI is open and a download is active.
   */
  private updateProgressPolling(): void {
    const needed = this.ports.size > 0 && this.queue.list().some((j) => j.status === 'active' && j.mode === 'direct' && j.chromeDownloadIds.length);
    if (needed && !this.progressTimer) {
      this.progressTimer = setInterval(() => void this.pollProgress(), 1000);
    } else if (!needed && this.progressTimer) {
      clearInterval(this.progressTimer);
      this.progressTimer = undefined;
    }
  }

  private async pollProgress(): Promise<void> {
    for (const job of this.queue.list()) {
      if (job.status !== 'active' || job.mode !== 'direct') continue;
      const id = job.chromeDownloadIds.at(-1);
      if (id === undefined) continue;
      const [item] = await chrome.downloads.search({ id });
      if (item) this.queue.reportProgress(job.id, item.bytesReceived, item.totalBytes > 0 ? item.totalBytes : undefined);
    }
  }

  private notifyFinished(job: DownloadJob): void {
    const name = job.filename.split('/').pop() ?? job.filename;
    if (job.status === 'completed') this.registry.release(job.filename);
    const s = this.settings();
    if (!s.showNotifications || job.status === 'cancelled') return;
    const title = job.status === 'completed' ? 'Download complete' : 'Download failed';
    const message = job.status === 'completed' ? name : `${name}\n${job.errorMessage ?? ''}`;
    try {
      chrome.notifications.create(`mf-${job.id}`, { type: 'basic', iconUrl: chrome.runtime.getURL('icons/icon-128.png'), title, message: message.slice(0, 250), priority: 0 });
    } catch (e) {
      log.debug('notification failed', e);
    }
  }

  private resolveQuality(q: QualityPreference | undefined): QualityPreference {
    const pref = q && q !== 'auto' ? q : this.settings().preferredVideoQuality;
    return pref === 'auto' ? 'highest' : pref;
  }

  private async replan(job: DownloadJob): Promise<StreamPlan> {
    const kind = job.mediaType === 'dash' ? 'dash' : 'hls';
    return this.analyzer.plan(kind, job.url, { quality: this.resolveQuality(job.quality), audioQuality: this.settings().preferredAudioQuality });
  }

  private filenameFor(media: MediaResource, pageTitle: string | undefined, pageUrl: string | undefined, qualityLabel: string | undefined, ext: string, suffix?: string): string {
    const s = this.settings();
    const input: Parameters<typeof buildFilename>[0] = { mediaUrl: media.url, extension: ext, template: s.filenameTemplate };
    if (media.title) input.mediaTitle = media.title;
    const pt = pageTitle ?? media.pageTitle;
    if (pt) input.pageTitle = pt;
    const pu = pageUrl ?? media.sourcePage;
    if (pu) input.pageUrl = pu;
    if (qualityLabel) input.qualityLabel = qualityLabel;
    if (suffix) input.suffix = suffix;
    return this.registry.reserve(joinDownloadPath(s.downloadFolder, buildFilename(input)));
  }

  /** Start a download for detected media (by id) or for a raw URL (context menu). */
  async request(req: DownloadRequest): Promise<Result<DownloadJob>> {
    try {
      return { ok: true, data: await this.start(req) };
    } catch (e) {
      const err = toMediaForgeError(e);
      log.info('Download request refused', err.code, err.detail ?? '');
      const r: Result<DownloadJob> = { ok: false, errorCode: err.code, message: err.message };
      if (this.settings().debugLogging && err.detail) r.detail = err.detail;
      return r;
    }
  }

  private async start(req: DownloadRequest): Promise<DownloadJob> {
    const s = this.settings();
    const state = req.tabId !== undefined ? await this.tabs.get(req.tabId) : undefined;
    let media: MediaResource | undefined = req.mediaId && state ? state.collection.get(req.mediaId) : undefined;
    if (!media && req.url && state) media = state.collection.findByUrl(req.url);
    if (!media && req.url) {
      if (!isAcceptableMediaUrl(req.url)) throw new MediaForgeError('UNSUPPORTED', { detail: 'unsupported URL scheme' });
      const added = state?.collection.addCandidates([{ url: req.url, method: 'context-menu' }], { pageUrl: state.pageUrl ?? '', ...(state.pageTitle ? { pageTitle: state.pageTitle } : {}) });
      media = added?.added[0] ?? (state ? state.collection.findByUrl(req.url) : undefined);
      if (!media) {
        // Unknown extension: still allow a direct http(s) download of what the user explicitly chose.
        if (!isHttpUrl(req.url)) throw new MediaForgeError('UNSUPPORTED');
        const cls = classifyMedia(req.url) ?? { type: 'video' as const, format: 'unknown' as const, isStream: false };
        media = {
          id: 'adhoc',
          url: req.url,
          dedupKey: req.url,
          type: cls.type,
          format: cls.format,
          sourcePage: state?.pageUrl ?? '',
          detectionMethod: 'context-menu',
          detectionMethods: ['context-menu'],
          isStream: cls.isStream,
          isProtected: false,
          protection: 'none',
          detectedAt: Date.now(),
        };
      }
      if (req.tabId !== undefined) this.tabs.touch(req.tabId);
    }
    if (!media) throw new MediaForgeError('NO_MEDIA');
    if (media.isProtected) throw new MediaForgeError('PROTECTED');

    const pageTitle = state?.pageTitle;
    const pageUrl = state?.pageUrl;
    const base = { mediaId: media.id, mediaType: media.type, format: media.format, maxRetries: s.maxRetries, ...(req.tabId !== undefined ? { tabId: req.tabId } : {}) };

    if (media.isStream && (media.type === 'hls' || media.type === 'dash')) {
      const quality = this.resolveQuality(req.quality);
      const plan = await this.analyzer.plan(media.type, media.url, { quality, audioQuality: s.preferredAudioQuality });
      const first = plan.tracks[0]!;
      const label = plan.tracks.find((t) => t.qualityLabel)?.qualityLabel;
      const estimated = plan.tracks.every((t) => t.estimatedBytes) ? plan.tracks.reduce((a, t) => a + (t.estimatedBytes ?? 0), 0) : undefined;
      const filename = this.filenameFor(media, pageTitle, pageUrl, quality === 'audio' ? undefined : label, first.extension, quality === 'audio' ? 'audio' : undefined);
      return this.queue.enqueue({
        ...base,
        url: media.url,
        filename,
        mode: 'stream',
        plan,
        quality,
        ...(label && quality !== 'audio' ? { qualityLabel: label } : {}),
        ...(estimated ? { totalBytes: estimated } : {}),
        canPause: true,
      });
    }

    const ext = extensionForFormat(media.format, media.type);
    const filename = this.filenameFor(media, pageTitle, pageUrl, media.qualityLabel, ext);
    return this.queue.enqueue({
      ...base,
      url: media.url,
      filename,
      mode: isBlobUrl(media.url) ? 'blob' : 'direct',
      ...(media.qualityLabel ? { qualityLabel: media.qualityLabel } : {}),
      ...(media.size ? { totalBytes: media.size } : {}),
    });
  }

  async action(jobId: string, action: 'pause' | 'resume' | 'cancel' | 'retry' | 'remove' | 'show'): Promise<boolean> {
    switch (action) {
      case 'pause':
        return this.queue.pause(jobId);
      case 'resume':
        return this.queue.resume(jobId);
      case 'cancel':
        return this.queue.cancel(jobId);
      case 'retry': {
        const job = this.queue.get(jobId);
        if (job) job.maxRetries = this.settings().maxRetries;
        return this.queue.retry(jobId);
      }
      case 'remove':
        return this.queue.remove(jobId);
      case 'show': {
        const id = this.queue.get(jobId)?.chromeDownloadIds.at(-1);
        if (id === undefined) return false;
        chrome.downloads.show(id);
        return true;
      }
    }
  }
}
