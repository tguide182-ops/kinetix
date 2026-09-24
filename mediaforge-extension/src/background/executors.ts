import type { DownloadExecutor, ExecutionHooks } from '../download/queue';
import type { BackgroundToContent, DownloadJob, OffscreenToBackground, StreamPlan, StreamTrackOutput } from '../types';
import { isErrorCode, MediaForgeError } from '../utils/errors';
import { closeOffscreen, ensureOffscreen, sendToOffscreen } from './offscreen-client';
import { startChromeDownload, waitForDownload } from './chrome-downloads';

export interface ExecutorEnv {
  saveAs(): boolean;
  segmentConcurrency(): number;
  maxRetries(): number;
  /** Re-create a stream plan (plans are not persisted across worker restarts). */
  replan(job: DownloadJob): Promise<StreamPlan>;
}

/** Plain files: handed to chrome.downloads, which handles redirects, resume and disk I/O. */
export class DirectExecutor implements DownloadExecutor {
  constructor(private readonly env: ExecutorEnv) {}

  async run(job: DownloadJob, hooks: ExecutionHooks, signal: AbortSignal): Promise<void> {
    // Re-attach to a download that survived a service-worker restart.
    const lastId = job.chromeDownloadIds[job.chromeDownloadIds.length - 1];
    if (lastId !== undefined) {
      const [item] = await chrome.downloads.search({ id: lastId });
      if (item && item.state === 'complete') return;
      if (item && item.state === 'in_progress') {
        if (item.paused && item.canResume) await chrome.downloads.resume(lastId);
        return waitForDownload(lastId, signal);
      }
    }
    const id = await startChromeDownload({ url: job.url, filename: job.filename, saveAs: this.env.saveAs() });
    hooks.chromeDownloadId(id);
    await waitForDownload(id, signal);
  }

  async pause(job: DownloadJob): Promise<boolean> {
    const id = job.chromeDownloadIds.at(-1);
    if (id === undefined) return false;
    try {
      await chrome.downloads.pause(id);
      return true;
    } catch {
      return false;
    }
  }

  async resume(job: DownloadJob): Promise<boolean> {
    const id = job.chromeDownloadIds.at(-1);
    if (id === undefined) return false;
    try {
      await chrome.downloads.resume(id);
      return true;
    } catch {
      return false;
    }
  }
}

/** Blob-backed media: only the page can read its own blob: URL, so the page saves it. */
export class BlobExecutor implements DownloadExecutor {
  async run(job: DownloadJob): Promise<void> {
    if (job.tabId === undefined) throw new MediaForgeError('BLOB_UNAVAILABLE');
    const name = job.filename.split('/').pop() ?? job.filename;
    const msg: BackgroundToContent = { type: 'DOWNLOAD_BLOB', url: job.url, filename: name };
    let ok = false;
    try {
      ok = (await chrome.tabs.sendMessage(job.tabId, msg)) === true;
    } catch (e) {
      throw new MediaForgeError('BLOB_UNAVAILABLE', { detail: String(e) });
    }
    if (!ok) throw new MediaForgeError('BLOB_UNAVAILABLE');
  }
}

interface PendingStream {
  hooks: ExecutionHooks;
  resolve: (outputs: StreamTrackOutput[]) => void;
  reject: (e: MediaForgeError) => void;
}

/**
 * HLS/DASH: segments are fetched and assembled in the offscreen document,
 * which returns blob: URLs that are then saved through chrome.downloads.
 */
export class StreamExecutor implements DownloadExecutor {
  private pending = new Map<string, PendingStream>();
  /** Results that arrived while no run() was waiting (worker restarted mid-download). */
  private orphans = new Map<string, OffscreenToBackground>();
  private active = new Set<string>();

  constructor(private readonly env: ExecutorEnv) {}

  handleMessage(msg: OffscreenToBackground): void {
    const p = this.pending.get(msg.jobId);
    if (!p) {
      if (msg.type !== 'STREAM_PROGRESS') this.orphans.set(msg.jobId, msg);
      return;
    }
    if (msg.type === 'STREAM_PROGRESS') {
      p.hooks.progress(msg.bytesReceived, msg.totalBytes);
    } else if (msg.type === 'STREAM_DONE') {
      this.pending.delete(msg.jobId);
      p.resolve(msg.outputs);
    } else {
      this.pending.delete(msg.jobId);
      p.reject(new MediaForgeError(isErrorCode(msg.errorCode) ? msg.errorCode : 'INTERNAL', { transient: msg.transient, ...(msg.detail ? { detail: msg.detail } : {}) }));
    }
  }

  async run(job: DownloadJob, hooks: ExecutionHooks, signal: AbortSignal): Promise<void> {
    this.active.add(job.id);
    try {
      const outputs = await this.fetchTracks(job, hooks, signal);
      await this.saveOutputs(job, outputs, hooks, signal);
    } finally {
      this.active.delete(job.id);
      if (!this.active.size) {
        // Give chrome.downloads a moment to finish reading any blob, then free the document.
        setTimeout(() => {
          if (!this.active.size) void closeOffscreen();
        }, 5000);
      }
    }
  }

  private async fetchTracks(job: DownloadJob, hooks: ExecutionHooks, signal: AbortSignal): Promise<StreamTrackOutput[]> {
    const orphan = this.orphans.get(job.id);
    if (orphan) {
      this.orphans.delete(job.id);
      if (orphan.type === 'STREAM_DONE') return orphan.outputs;
    }
    const plan = job.plan ?? (await this.env.replan(job));
    job.plan = plan;
    await ensureOffscreen();
    const result = new Promise<StreamTrackOutput[]>((resolve, reject) => {
      this.pending.set(job.id, { hooks, resolve, reject });
    });
    const onAbort = (): void => {
      void sendToOffscreen({ target: 'offscreen', type: 'STREAM_CANCEL', jobId: job.id }).catch(() => {});
      const p = this.pending.get(job.id);
      this.pending.delete(job.id);
      p?.reject(new MediaForgeError('CANCELLED'));
    };
    signal.addEventListener('abort', onAbort, { once: true });
    try {
      await sendToOffscreen({
        target: 'offscreen',
        type: 'STREAM_START',
        jobId: job.id,
        plan,
        concurrency: this.env.segmentConcurrency(),
        maxRetries: this.env.maxRetries(),
      });
      return await result;
    } finally {
      signal.removeEventListener('abort', onAbort);
    }
  }

  private async saveOutputs(job: DownloadJob, outputs: StreamTrackOutput[], hooks: ExecutionHooks, signal: AbortSignal): Promise<void> {
    const base = job.filename.replace(/\.[a-z0-9]{1,5}$/i, '');
    try {
      for (const out of outputs) {
        const suffix = outputs.length > 1 ? ` (${out.kind})` : '';
        const id = await startChromeDownload({ url: out.blobUrl, filename: `${base}${suffix}.${out.extension}`, saveAs: this.env.saveAs() });
        hooks.chromeDownloadId(id);
        await waitForDownload(id, signal);
      }
    } finally {
      for (const out of outputs) {
        void sendToOffscreen({ target: 'offscreen', type: 'RELEASE_BLOB', blobUrl: out.blobUrl }).catch(() => {});
      }
    }
    const total = outputs.reduce((s, o) => s + o.size, 0);
    hooks.progress(total, total);
  }

  async pause(job: DownloadJob): Promise<boolean> {
    if (!this.pending.has(job.id)) return false;
    await sendToOffscreen({ target: 'offscreen', type: 'STREAM_PAUSE', jobId: job.id });
    return true;
  }

  async resume(job: DownloadJob): Promise<boolean> {
    if (!this.pending.has(job.id)) return false;
    await sendToOffscreen({ target: 'offscreen', type: 'STREAM_RESUME', jobId: job.id });
    return true;
  }
}
