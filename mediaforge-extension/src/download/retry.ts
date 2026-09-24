import { MediaForgeError, toMediaForgeError } from '../utils/errors';
import { sleep as defaultSleep } from '../utils/timing';

export interface RetryPolicy {
  /** Delay before the first retry. */
  baseDelayMs: number;
  factor: number;
  maxDelayMs: number;
  /** 0..1 — fraction of random jitter added to each delay. */
  jitter: number;
}

export const DEFAULT_RETRY_POLICY: Readonly<RetryPolicy> = Object.freeze({ baseDelayMs: 1000, factor: 2, maxDelayMs: 30_000, jitter: 0 });

/** Delay before retry number `retry` (1-based): 1s, 2s, 4s, 8s, ... capped. */
export function backoffDelay(retry: number, policy: RetryPolicy = DEFAULT_RETRY_POLICY, random: () => number = Math.random): number {
  const n = Math.max(1, Math.floor(retry));
  const raw = Math.min(policy.maxDelayMs, policy.baseDelayMs * policy.factor ** (n - 1));
  return Math.round(raw + raw * policy.jitter * random());
}

/** Only transient failures are retried, and never more than `maxRetries` times. */
export function shouldRetry(err: MediaForgeError, retriesSoFar: number, maxRetries: number): boolean {
  return err.transient && err.code !== 'CANCELLED' && retriesSoFar < maxRetries;
}

export interface WithRetryOptions {
  maxRetries: number;
  policy?: RetryPolicy;
  signal?: AbortSignal;
  onRetry?: (err: MediaForgeError, retry: number, delayMs: number) => void;
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
}

export async function withRetry<T>(fn: (attempt: number) => Promise<T>, opts: WithRetryOptions): Promise<T> {
  const sleep = opts.sleep ?? defaultSleep;
  for (let attempt = 0; ; attempt++) {
    if (opts.signal?.aborted) throw new MediaForgeError('CANCELLED');
    try {
      return await fn(attempt);
    } catch (e) {
      const err = toMediaForgeError(e);
      if (opts.signal?.aborted) throw new MediaForgeError('CANCELLED');
      if (!shouldRetry(err, attempt, opts.maxRetries)) throw err;
      const delay = backoffDelay(attempt + 1, opts.policy);
      opts.onRetry?.(err, attempt + 1, delay);
      await sleep(delay, opts.signal).catch(() => {
        throw new MediaForgeError('CANCELLED');
      });
    }
  }
}
