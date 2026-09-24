import { describe, expect, it, vi } from 'vitest';
import { backoffDelay, shouldRetry, withRetry } from '../src/download/retry';
import { errorFromInterruptReason, errorFromStatus, MediaForgeError, toMediaForgeError, userMessage } from '../src/utils/errors';

describe('backoffDelay', () => {
  it('doubles from 1s: 1, 2, 4, 8 seconds', () => {
    expect([1, 2, 3, 4].map((n) => backoffDelay(n))).toEqual([1000, 2000, 4000, 8000]);
  });
  it('is capped', () => {
    expect(backoffDelay(20)).toBe(30_000);
  });
  it('adds bounded jitter', () => {
    const d = backoffDelay(2, { baseDelayMs: 1000, factor: 2, maxDelayMs: 30_000, jitter: 0.5 }, () => 1);
    expect(d).toBe(3000);
  });
});

describe('shouldRetry', () => {
  it('retries transient errors only, within budget', () => {
    expect(shouldRetry(new MediaForgeError('NETWORK'), 0, 3)).toBe(true);
    expect(shouldRetry(new MediaForgeError('NETWORK'), 3, 3)).toBe(false);
    expect(shouldRetry(new MediaForgeError('ACCESS_DENIED'), 0, 3)).toBe(false);
    expect(shouldRetry(new MediaForgeError('PROTECTED'), 0, 3)).toBe(false);
  });
});

describe('withRetry', () => {
  it('retries transient failures with exponential delays, then succeeds', async () => {
    const sleeps: number[] = [];
    let calls = 0;
    const result = await withRetry(
      async () => {
        calls++;
        if (calls < 3) throw new TypeError('Failed to fetch');
        return 'ok';
      },
      { maxRetries: 4, sleep: async (ms) => void sleeps.push(ms) },
    );
    expect(result).toBe('ok');
    expect(sleeps).toEqual([1000, 2000]);
  });

  it('does not retry indefinitely', async () => {
    const fn = vi.fn(async () => {
      throw new MediaForgeError('NETWORK');
    });
    await expect(withRetry(fn, { maxRetries: 3, sleep: async () => {} })).rejects.toMatchObject({ code: 'NETWORK' });
    expect(fn).toHaveBeenCalledTimes(4);
  });

  it('fails fast on permanent errors', async () => {
    const fn = vi.fn(async () => {
      throw errorFromStatus(403);
    });
    await expect(withRetry(fn, { maxRetries: 5, sleep: async () => {} })).rejects.toMatchObject({ code: 'ACCESS_DENIED' });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('stops when aborted', async () => {
    const ac = new AbortController();
    ac.abort();
    await expect(withRetry(async () => 1, { maxRetries: 1, signal: ac.signal })).rejects.toMatchObject({ code: 'CANCELLED' });
  });
});

describe('error mapping', () => {
  it('maps HTTP statuses', () => {
    expect(errorFromStatus(403)).toMatchObject({ code: 'ACCESS_DENIED', transient: false });
    expect(errorFromStatus(404).code).toBe('NOT_FOUND');
    expect(errorFromStatus(503)).toMatchObject({ code: 'SERVER_REJECTED', transient: true });
    expect(errorFromStatus(429).transient).toBe(true);
    expect(errorFromStatus(400)).toMatchObject({ code: 'SERVER_REJECTED', transient: false });
  });

  it('maps chrome.downloads interrupt reasons to user messages', () => {
    expect(errorFromInterruptReason('FILE_NO_SPACE').message).toBe('Insufficient storage.');
    expect(errorFromInterruptReason('NETWORK_DISCONNECTED')).toMatchObject({ code: 'NETWORK', transient: true });
    expect(errorFromInterruptReason('SERVER_FORBIDDEN').message).toBe('Media URL could not be accessed.');
    expect(errorFromInterruptReason('USER_CANCELED').message).toBe('Download cancelled.');
  });

  it('never exposes raw errors as user messages', () => {
    const e = toMediaForgeError(new Error('at Object.<anonymous> (file.js:1:1)'));
    expect(e.message).not.toContain('file.js');
    expect(e.detail).toContain('file.js');
    expect(userMessage('NOT_A_CODE')).toMatch(/Something went wrong/);
  });

  it('redacts query strings in details', () => {
    expect(errorFromStatus(403, 'https://a.com/x.mp4?token=SECRET').detail).not.toContain('SECRET');
  });
});
