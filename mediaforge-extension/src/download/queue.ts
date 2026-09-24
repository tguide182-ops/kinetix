import type { DownloadJob, DownloadStatus } from '../types';
import { MediaForgeError, toMediaForgeError } from '../utils/errors';
import { randomId } from '../utils/id';
import { backoffDelay, DEFAULT_RETRY_POLICY, shouldRetry, type RetryPolicy } from './retry';

export interface ExecutionHooks {
  progress(bytesReceived: number, totalBytes?: number): void;
  chromeDownloadId(id: number): void;
}

/**
 * Something that can carry out a job. `run` resolves on success and rejects
 * with a MediaForgeError on failure. It must honour `signal` (cancellation).
 */
export interface DownloadExecutor {
  run(job: DownloadJob, hooks: ExecutionHooks, signal: AbortSignal): Promise<void>;
  pause?(job: DownloadJob): Promise<boolean>;
  resume?(job: DownloadJob): Promise<boolean>;
}

export interface QueueOptions {
  executors: Partial<Record<DownloadJob['mode'], DownloadExecutor>>;
  maxConcurrent: number;
  policy?: RetryPolicy;
  now?: () => number;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
  onChange?: (jobs: DownloadJob[], changed: DownloadJob) => void;
  /** Called once when a job reaches a terminal state. */
  onFinished?: (job: DownloadJob) => void;
}

export type NewJob = Pick<DownloadJob, 'url' | 'filename' | 'mediaType' | 'format' | 'mode'> &
  Partial<Pick<DownloadJob, 'mediaId' | 'tabId' | 'qualityLabel' | 'quality' | 'plan' | 'totalBytes' | 'maxRetries' | 'canPause'>>;

const TERMINAL: ReadonlySet<DownloadStatus> = new Set(['completed', 'failed', 'cancelled']);
const MAX_HISTORY = 200;

interface Running {
  controller: AbortController;
  lastSample?: { t: number; bytes: number };
}

/**
 * Download queue with bounded concurrency, pause/resume, cancellation and
 * automatic retries with exponential backoff for transient failures.
 * Chrome-agnostic: all browser interaction lives in executors.
 */
export class DownloadQueue {
  private jobs = new Map<string, DownloadJob>();
  private running = new Map<string, Running>();
  private timers = new Map<string, unknown>();
  private maxConcurrent: number;
  private readonly policy: RetryPolicy;
  private readonly now: () => number;
  private readonly setTimer: (fn: () => void, ms: number) => unknown;
  private readonly clearTimer: (h: unknown) => void;

  constructor(private readonly opts: QueueOptions) {
    this.maxConcurrent = Math.max(1, opts.maxConcurrent);
    this.policy = opts.policy ?? DEFAULT_RETRY_POLICY;
    this.now = opts.now ?? Date.now;
    this.setTimer = opts.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
    this.clearTimer = opts.clearTimer ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>));
  }

  list(): DownloadJob[] {
    return [...this.jobs.values()].sort((a, b) => b.createdAt - a.createdAt);
  }

  get(id: string): DownloadJob | undefined {
    return this.jobs.get(id);
  }

  setMaxConcurrent(n: number): void {
    this.maxConcurrent = Math.max(1, Math.floor(n));
    this.pump();
  }

  enqueue(input: NewJob): DownloadJob {
    const job: DownloadJob = {
      id: randomId('dl_'),
      status: 'queued',
      bytesReceived: 0,
      attempts: 0,
      maxRetries: 3,
      chromeDownloadIds: [],
      createdAt: this.now(),
      canPause: input.mode !== 'blob',
      ...input,
    };
    this.jobs.set(job.id, job);
    this.trim();
    this.emit(job);
    this.pump();
    return job;
  }

  /** Restore persisted jobs after a service-worker restart. In-flight work is re-queued. */
  restore(jobs: DownloadJob[]): void {
    for (const j of jobs) {
      const copy: DownloadJob = { ...j };
      if (copy.status === 'active') {
        copy.status = 'queued';
        delete copy.speed;
        delete copy.eta;
      }
      this.jobs.set(copy.id, copy);
    }
    this.pump();
  }

  async pause(id: string): Promise<boolean> {
    const job = this.jobs.get(id);
    if (!job) return false;
    if (job.status === 'queued') {
      this.cancelTimer(id);
      delete job.nextRetryAt;
      this.update(job, { status: 'paused' });
      return true;
    }
    if (job.status === 'active' && job.canPause) {
      const ok = (await this.opts.executors[job.mode]?.pause?.(job)) ?? false;
      if (ok) this.update(job, { status: 'paused', speed: 0 });
      return ok;
    }
    return false;
  }

  async resume(id: string): Promise<boolean> {
    const job = this.jobs.get(id);
    if (!job || job.status !== 'paused') return false;
    if (this.running.has(id)) {
      const ok = (await this.opts.executors[job.mode]?.resume?.(job)) ?? false;
      if (ok) this.update(job, { status: 'active' });
      return ok;
    }
    this.update(job, { status: 'queued' });
    this.pump();
    return true;
  }

  cancel(id: string): boolean {
    const job = this.jobs.get(id);
    if (!job || TERMINAL.has(job.status)) return false;
    this.cancelTimer(id);
    const r = this.running.get(id);
    if (r) {
      r.controller.abort(new MediaForgeError('CANCELLED'));
      // Status is finalised when run() settles.
      return true;
    }
    this.finish(job, 'cancelled', new MediaForgeError('CANCELLED'));
    return true;
  }

  /** Manual retry of a failed/cancelled job; resets the retry budget. */
  retry(id: string): boolean {
    const job = this.jobs.get(id);
    if (!job || (job.status !== 'failed' && job.status !== 'cancelled')) return false;
    const patch: Partial<DownloadJob> = { status: 'queued', attempts: 0, bytesReceived: 0 };
    this.update(job, patch);
    for (const k of ['errorCode', 'errorMessage', 'errorDetail', 'finishedAt', 'nextRetryAt', 'speed', 'eta'] as const) delete job[k];
    this.pump();
    return true;
  }

  remove(id: string): boolean {
    const job = this.jobs.get(id);
    if (!job) return false;
    if (!TERMINAL.has(job.status)) this.cancel(id);
    this.cancelTimer(id);
    this.jobs.delete(id);
    this.emit(job);
    return true;
  }

  clearFinished(): void {
    for (const [id, j] of this.jobs) if (TERMINAL.has(j.status)) this.jobs.delete(id);
    const any = this.list()[0];
    if (any) this.emit(any);
    else this.opts.onChange?.([], { id: '' } as DownloadJob);
  }

  /** Progress reported from outside run() (e.g. chrome.downloads polling). */
  reportProgress(id: string, bytesReceived: number, totalBytes?: number): void {
    const job = this.jobs.get(id);
    const r = this.running.get(id);
    if (!job || !r || job.status !== 'active') return;
    const t = this.now();
    const patch: Partial<DownloadJob> = { bytesReceived };
    if (totalBytes && totalBytes > 0) patch.totalBytes = totalBytes;
    if (r.lastSample && t > r.lastSample.t) {
      const inst = ((bytesReceived - r.lastSample.bytes) * 1000) / (t - r.lastSample.t);
      if (inst >= 0) {
        // Exponential moving average for a steadier speed read-out.
        patch.speed = job.speed ? job.speed * 0.7 + inst * 0.3 : inst;
      }
    }
    r.lastSample = { t, bytes: bytesReceived };
    const total = patch.totalBytes ?? job.totalBytes;
    const speed = patch.speed ?? job.speed;
    if (total && speed && speed > 0) patch.eta = Math.max(0, (total - bytesReceived) / speed);
    this.update(job, patch);
  }

  get activeCount(): number {
    return this.running.size;
  }

  private pump(): void {
    const queued = [...this.jobs.values()]
      .filter((j) => j.status === 'queued' && !this.running.has(j.id) && (!j.nextRetryAt || j.nextRetryAt <= this.now()))
      .sort((a, b) => a.createdAt - b.createdAt);
    for (const job of queued) {
      if (this.running.size >= this.maxConcurrent) break;
      void this.start(job);
    }
  }

  private async start(job: DownloadJob): Promise<void> {
    const executor = this.opts.executors[job.mode];
    if (!executor) {
      this.finish(job, 'failed', new MediaForgeError('UNSUPPORTED', { detail: `No executor for ${job.mode}` }));
      return;
    }
    const controller = new AbortController();
    this.running.set(job.id, { controller });
    delete job.nextRetryAt;
    this.update(job, { status: 'active', startedAt: job.startedAt ?? this.now(), attempts: job.attempts + 1, speed: 0 });
    try {
      await executor.run(
        job,
        {
          progress: (b, t) => this.reportProgress(job.id, b, t),
          chromeDownloadId: (id) => {
            job.chromeDownloadIds = [...job.chromeDownloadIds, id];
            this.emit(job);
          },
        },
        controller.signal,
      );
      this.running.delete(job.id);
      if (job.totalBytes) job.bytesReceived = Math.max(job.bytesReceived, job.totalBytes);
      this.finish(job, 'completed');
    } catch (e) {
      this.running.delete(job.id);
      const err = controller.signal.aborted ? new MediaForgeError('CANCELLED') : toMediaForgeError(e);
      if (!this.jobs.has(job.id)) {
        /* removed while running */
      } else if (err.code === 'CANCELLED') {
        this.finish(job, 'cancelled', err);
      } else if (shouldRetry(err, job.attempts - 1, job.maxRetries)) {
        const delay = backoffDelay(job.attempts, this.policy);
        this.update(job, { status: 'queued', nextRetryAt: this.now() + delay, errorCode: err.code, errorMessage: err.message, speed: 0 });
        if (err.detail) job.errorDetail = err.detail;
        this.timers.set(
          job.id,
          this.setTimer(() => {
            this.timers.delete(job.id);
            delete job.nextRetryAt;
            this.pump();
          }, delay),
        );
      } else {
        this.finish(job, 'failed', err);
      }
    }
    this.pump();
  }

  private finish(job: DownloadJob, status: 'completed' | 'failed' | 'cancelled', err?: MediaForgeError): void {
    const patch: Partial<DownloadJob> = { status, finishedAt: this.now(), speed: 0, eta: 0 };
    if (err) {
      patch.errorCode = err.code;
      patch.errorMessage = err.message;
      if (err.detail) patch.errorDetail = err.detail;
    } else {
      delete job.errorCode;
      delete job.errorMessage;
      delete job.errorDetail;
    }
    this.update(job, patch);
    this.opts.onFinished?.(job);
  }

  private update(job: DownloadJob, patch: Partial<DownloadJob>): void {
    Object.assign(job, patch);
    this.emit(job);
  }

  private emit(job: DownloadJob): void {
    this.opts.onChange?.(this.list(), job);
  }

  private cancelTimer(id: string): void {
    const t = this.timers.get(id);
    if (t !== undefined) {
      this.clearTimer(t);
      this.timers.delete(id);
    }
  }

  /** Keep memory bounded: drop the oldest finished jobs beyond MAX_HISTORY. */
  private trim(): void {
    if (this.jobs.size <= MAX_HISTORY) return;
    const finished = [...this.jobs.values()].filter((j) => TERMINAL.has(j.status)).sort((a, b) => a.createdAt - b.createdAt);
    while (this.jobs.size > MAX_HISTORY && finished.length) this.jobs.delete(finished.shift()!.id);
  }
}
