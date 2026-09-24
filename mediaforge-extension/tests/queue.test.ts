import { describe, expect, it } from 'vitest';
import { DownloadQueue, type DownloadExecutor, type NewJob } from '../src/download/queue';
import { MediaForgeError } from '../src/utils/errors';
import type { DownloadJob } from '../src/types';

/** Controllable fake executor. */
class FakeExecutor implements DownloadExecutor {
  pending = new Map<string, { resolve: () => void; reject: (e: unknown) => void }>();
  runs: string[] = [];
  paused = new Set<string>();

  run(job: DownloadJob, _hooks: unknown, signal: AbortSignal): Promise<void> {
    this.runs.push(job.id);
    return new Promise((resolve, reject) => {
      this.pending.set(job.id, { resolve, reject });
      signal.addEventListener('abort', () => reject(new MediaForgeError('CANCELLED')));
    });
  }
  async pause(job: DownloadJob): Promise<boolean> {
    this.paused.add(job.id);
    return true;
  }
  async resume(job: DownloadJob): Promise<boolean> {
    this.paused.delete(job.id);
    return true;
  }
  succeed(id: string): void {
    this.pending.get(id)!.resolve();
  }
  fail(id: string, e: unknown): void {
    this.pending.get(id)!.reject(e);
  }
}

const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

function setup(maxConcurrent = 2) {
  const exec = new FakeExecutor();
  const timers: Array<{ fn: () => void; ms: number }> = [];
  let now = 1000;
  const finished: DownloadJob[] = [];
  const q = new DownloadQueue({
    executors: { direct: exec, stream: exec },
    maxConcurrent,
    now: () => now++,
    setTimer: (fn, ms) => {
      timers.push({ fn, ms });
      return timers.length;
    },
    clearTimer: () => {},
    onFinished: (j) => finished.push({ ...j }),
  });
  const job = (n: number, extra: Partial<NewJob> = {}): NewJob => ({
    url: `https://a.com/${n}.mp4`,
    filename: `${n}.mp4`,
    mediaType: 'video',
    format: 'mp4',
    mode: 'direct',
    maxRetries: 3,
    ...extra,
  });
  return { exec, q, timers, job, finished };
}

describe('DownloadQueue', () => {
  it('respects the concurrency limit and starts queued jobs as slots free up', async () => {
    const { exec, q, job } = setup(2);
    const a = q.enqueue(job(1));
    const b = q.enqueue(job(2));
    const c = q.enqueue(job(3));
    expect(exec.runs).toEqual([a.id, b.id]);
    expect(q.get(c.id)!.status).toBe('queued');
    exec.succeed(a.id);
    await flush();
    expect(q.get(a.id)!.status).toBe('completed');
    expect(exec.runs).toEqual([a.id, b.id, c.id]);
    expect(q.activeCount).toBe(2);
  });

  it('retries transient failures with 1s, 2s, 4s backoff and then gives up', async () => {
    const { exec, q, timers, job, finished } = setup(1);
    const a = q.enqueue(job(1, { maxRetries: 3 }));
    for (let i = 0; i < 3; i++) {
      exec.fail(a.id, new MediaForgeError('NETWORK'));
      await flush();
      expect(q.get(a.id)!.status).toBe('queued');
      expect(q.get(a.id)!.errorMessage).toBe('Network connection interrupted.');
      timers[i]!.fn();
    }
    expect(timers.map((t) => t.ms)).toEqual([1000, 2000, 4000]);
    exec.fail(a.id, new MediaForgeError('NETWORK'));
    await flush();
    expect(q.get(a.id)).toMatchObject({ status: 'failed', attempts: 4, errorCode: 'NETWORK' });
    expect(finished).toHaveLength(1);
  });

  it('does not retry permanent failures', async () => {
    const { exec, q, timers, job } = setup(1);
    const a = q.enqueue(job(1));
    exec.fail(a.id, new MediaForgeError('ACCESS_DENIED'));
    await flush();
    expect(q.get(a.id)).toMatchObject({ status: 'failed', errorMessage: 'Media URL could not be accessed.' });
    expect(timers).toHaveLength(0);
  });

  it('cancels running and queued jobs', async () => {
    const { exec, q, job } = setup(1);
    const a = q.enqueue(job(1));
    const b = q.enqueue(job(2));
    q.cancel(b.id);
    expect(q.get(b.id)!.status).toBe('cancelled');
    q.cancel(a.id);
    await flush();
    expect(q.get(a.id)).toMatchObject({ status: 'cancelled', errorMessage: 'Download cancelled.' });
    expect(exec.runs).toEqual([a.id]);
  });

  it('pauses and resumes queued and active jobs', async () => {
    const { exec, q, job } = setup(1);
    const a = q.enqueue(job(1));
    const b = q.enqueue(job(2));
    expect(await q.pause(b.id)).toBe(true);
    expect(q.get(b.id)!.status).toBe('paused');
    expect(await q.pause(a.id)).toBe(true);
    expect(exec.paused.has(a.id)).toBe(true);
    expect(q.get(a.id)!.status).toBe('paused');
    expect(await q.resume(a.id)).toBe(true);
    expect(q.get(a.id)!.status).toBe('active');
    exec.succeed(a.id);
    await flush();
    // b stays paused until resumed.
    expect(exec.runs).toEqual([a.id]);
    await q.resume(b.id);
    expect(exec.runs).toEqual([a.id, b.id]);
  });

  it('supports manual retry and removal', async () => {
    const { exec, q, job } = setup(1);
    const a = q.enqueue(job(1));
    exec.fail(a.id, new MediaForgeError('NOT_FOUND'));
    await flush();
    expect(q.retry(a.id)).toBe(true);
    expect(q.get(a.id)).toMatchObject({ status: 'active', attempts: 1 });
    expect(q.get(a.id)!.errorCode).toBeUndefined();
    exec.succeed(a.id);
    await flush();
    expect(q.remove(a.id)).toBe(true);
    expect(q.list()).toHaveLength(0);
  });

  it('computes speed and ETA from progress reports', async () => {
    const { q, job } = setup(1);
    const a = q.enqueue(job(1));
    q.reportProgress(a.id, 0, 10_000);
    q.reportProgress(a.id, 1000, 10_000);
    const j = q.get(a.id)!;
    expect(j.bytesReceived).toBe(1000);
    expect(j.speed).toBeGreaterThan(0);
    expect(j.eta).toBeGreaterThan(0);
  });

  it('clears finished jobs and restores persisted ones', async () => {
    const { exec, q, job } = setup(1);
    const a = q.enqueue(job(1));
    exec.succeed(a.id);
    await flush();
    q.clearFinished();
    expect(q.list()).toHaveLength(0);

    const { q: q2, exec: exec2 } = setup(1);
    q2.restore([{ ...a, id: 'restored', status: 'active' }]);
    expect(exec2.runs).toEqual(['restored']);
  });

  it('fails jobs without an executor', async () => {
    const { q, job } = setup(1);
    const a = q.enqueue(job(1, { mode: 'blob' }));
    await flush();
    expect(q.get(a.id)).toMatchObject({ status: 'failed', errorCode: 'UNSUPPORTED' });
  });
});
