import { describe, expect, it } from 'vitest';
import { downloadSegments, fetchSegment } from '../src/download/segment-fetcher';
import { PauseGate } from '../src/download/pause-gate';
import { assembleTrack, finalizeTracks, registerMediaProcessor } from '../src/download/processor';
import { HTML_ERROR_PAGE, TS_PACKETS } from './fixtures';

function res(status: number, body: Uint8Array | string = 'x'): Response {
  return new Response(typeof body === 'string' ? body : body.slice().buffer, { status });
}

const noSleep = async (): Promise<void> => {};

describe('fetchSegment', () => {
  it('sends Range headers for byte ranges and slices full responses', async () => {
    let seen: Record<string, string> = {};
    const body = new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    const out = await fetchSegment(
      { url: 'https://a.com/v.mp4', byteRange: { start: 2, end: 4 } },
      async (_u, init) => {
        seen = init.headers as Record<string, string>;
        return res(200, body);
      },
      new AbortController().signal,
    );
    expect(seen.Range).toBe('bytes=2-4');
    expect([...out]).toEqual([2, 3, 4]);
  });

  it('never sends custom credential headers', async () => {
    let init: RequestInit = {};
    await fetchSegment({ url: 'https://a.com/s.ts' }, async (_u, i) => ((init = i), res(200, TS_PACKETS)), new AbortController().signal);
    expect(Object.keys(init.headers as object)).toEqual([]);
  });

  it('rejects non-http segment URLs', async () => {
    await expect(fetchSegment({ url: 'javascript:alert(1)' }, async () => res(200), new AbortController().signal)).rejects.toMatchObject({ code: 'UNSUPPORTED' });
  });
});

describe('downloadSegments', () => {
  const segs = Array.from({ length: 10 }, (_, i) => ({ url: `https://a.com/s${i}.ts` }));

  it('downloads in order with bounded concurrency', async () => {
    let inFlight = 0;
    let peak = 0;
    const progress: number[] = [];
    const blobs = await downloadSegments(segs, {
      concurrency: 3,
      maxRetries: 0,
      signal: new AbortController().signal,
      fetchImpl: async (url) => {
        inFlight++;
        peak = Math.max(peak, inFlight);
        await new Promise((r) => setTimeout(r, Math.random() * 5));
        inFlight--;
        return res(200, TS_PACKETS.slice(0, 188 + Number(/s(\d+)/.exec(url)![1])));
      },
      onProgress: (_b, n) => progress.push(n),
    });
    expect(peak).toBeLessThanOrEqual(3);
    expect(blobs.map((b) => b.size)).toEqual(segs.map((_, i) => 188 + i));
    expect(progress.at(-1)).toBe(10);
  });

  it('retries transient network failures per segment', async () => {
    const attempts = new Map<string, number>();
    const blobs = await downloadSegments(segs.slice(0, 3), {
      concurrency: 2,
      maxRetries: 3,
      sleep: noSleep,
      signal: new AbortController().signal,
      fetchImpl: async (url) => {
        const n = (attempts.get(url) ?? 0) + 1;
        attempts.set(url, n);
        if (n < 3) throw new TypeError('Failed to fetch');
        return res(200, TS_PACKETS);
      },
    });
    expect(blobs).toHaveLength(3);
    expect([...attempts.values()]).toEqual([3, 3, 3]);
  });

  it('fails with a clear error on 403 without retrying', async () => {
    let calls = 0;
    await expect(
      downloadSegments(segs, { concurrency: 2, maxRetries: 3, sleep: noSleep, signal: new AbortController().signal, fetchImpl: async () => (calls++, res(403)) }),
    ).rejects.toMatchObject({ code: 'ACCESS_DENIED' });
    expect(calls).toBeLessThanOrEqual(2);
  });

  it('detects HTML error pages served with 200', async () => {
    await expect(
      downloadSegments(segs.slice(0, 1), { concurrency: 1, maxRetries: 0, signal: new AbortController().signal, fetchImpl: async () => res(200, HTML_ERROR_PAGE) }),
    ).rejects.toMatchObject({ code: 'ACCESS_DENIED' });
  });

  it('enforces the size cap', async () => {
    await expect(
      downloadSegments(segs, { concurrency: 1, maxRetries: 0, maxBytes: 500, signal: new AbortController().signal, fetchImpl: async () => res(200, TS_PACKETS) }),
    ).rejects.toMatchObject({ code: 'TOO_LARGE' });
  });

  it('can be cancelled', async () => {
    const ac = new AbortController();
    const p = downloadSegments(segs, {
      concurrency: 2,
      maxRetries: 0,
      signal: ac.signal,
      fetchImpl: (_u, init) =>
        new Promise((_r, reject) => init.signal!.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))),
    });
    ac.abort();
    await expect(p).rejects.toMatchObject({ code: 'CANCELLED' });
  });

  it('honours the pause gate', async () => {
    const gate = new PauseGate();
    gate.pause();
    let calls = 0;
    const p = downloadSegments(segs.slice(0, 2), {
      concurrency: 1,
      maxRetries: 0,
      gate,
      signal: new AbortController().signal,
      fetchImpl: async () => (calls++, res(200, TS_PACKETS)),
    });
    await new Promise((r) => setTimeout(r, 10));
    expect(calls).toBe(0);
    gate.resume();
    await p;
    expect(calls).toBe(2);
  });
});

describe('track assembly', () => {
  it('prepends the init segment', async () => {
    const t = assembleTrack(
      { kind: 'video', container: 'fmp4', segments: [], extension: 'mp4', mimeType: 'video/mp4' },
      new Blob([new Uint8Array([1])]),
      [new Blob([new Uint8Array([2, 3])])],
    );
    expect([...new Uint8Array(await t.blob.arrayBuffer())]).toEqual([1, 2, 3]);
  });

  it('keeps tracks separate without a processor and merges with one', async () => {
    const tracks = [
      { kind: 'video' as const, blob: new Blob(['v']), extension: 'mp4', mimeType: 'video/mp4' },
      { kind: 'audio' as const, blob: new Blob(['a']), extension: 'm4a', mimeType: 'audio/mp4' },
    ];
    expect(await finalizeTracks(tracks, new AbortController().signal)).toHaveLength(2);
    registerMediaProcessor({
      name: 'fake',
      canMerge: () => true,
      merge: async (t) => ({ kind: 'muxed', blob: new Blob(t.map((x) => x.blob)), extension: 'mp4', mimeType: 'video/mp4' }),
    });
    const merged = await finalizeTracks(tracks, new AbortController().signal);
    expect(merged).toHaveLength(1);
    expect(merged[0]!.kind).toBe('muxed');
    registerMediaProcessor(undefined);
  });
});
