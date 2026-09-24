import type { SegmentRef } from '../types';
import { errorFromStatus, MediaForgeError, toMediaForgeError } from '../utils/errors';
import { isHttpUrl } from '../utils/url';
import { PauseGate } from './pause-gate';
import { withRetry, type RetryPolicy } from './retry';
import { looksLikeErrorBody } from './sniff';

export const MAX_STREAM_BYTES = 4 * 1024 ** 3;
const SEGMENT_TIMEOUT_MS = 60_000;

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

export interface SegmentDownloadOptions {
  concurrency: number;
  maxRetries: number;
  policy?: RetryPolicy;
  signal: AbortSignal;
  gate?: PauseGate;
  fetchImpl?: FetchLike;
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
  /** Called after every completed segment with cumulative totals. */
  onProgress?: (bytesDone: number, segmentsDone: number) => void;
  maxBytes?: number;
}

/** Fetch one segment (optionally a byte range) through the browser's network stack. */
export async function fetchSegment(seg: SegmentRef, fetchImpl: FetchLike, signal: AbortSignal): Promise<Uint8Array<ArrayBuffer>> {
  if (!isHttpUrl(seg.url)) throw new MediaForgeError('UNSUPPORTED', { detail: 'Segment URL is not http(s)' });
  const headers: Record<string, string> = {};
  if (seg.byteRange) headers.Range = `bytes=${seg.byteRange.start}-${seg.byteRange.end}`;
  const timeout = AbortSignal.timeout(SEGMENT_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetchImpl(seg.url, { headers, credentials: 'include', signal: AbortSignal.any([signal, timeout]), cache: 'no-store' });
  } catch (e) {
    if (signal.aborted) throw new MediaForgeError('CANCELLED');
    if (timeout.aborted) throw new MediaForgeError('TIMEOUT', { transient: true, detail: 'segment timed out' });
    throw toMediaForgeError(e);
  }
  if (!res.ok) throw errorFromStatus(res.status, seg.url);
  let bytes = new Uint8Array(await res.arrayBuffer());
  // Server ignored the Range header and sent the whole file: slice locally.
  if (seg.byteRange && res.status === 200 && bytes.length > seg.byteRange.end) {
    bytes = bytes.slice(seg.byteRange.start, seg.byteRange.end + 1);
  }
  if (bytes.length === 0) throw new MediaForgeError('NETWORK', { transient: true, detail: 'empty segment' });
  return bytes;
}

/**
 * Download segments with bounded concurrency and per-segment retries.
 * Results are returned in playlist order as Blobs (Chrome may page large
 * blobs to disk, keeping memory pressure lower than holding ArrayBuffers).
 */
export async function downloadSegments(segments: SegmentRef[], opts: SegmentDownloadOptions): Promise<Blob[]> {
  const fetchImpl: FetchLike = opts.fetchImpl ?? ((u, i) => fetch(u, i));
  const results: Blob[] = new Array(segments.length);
  const maxBytes = opts.maxBytes ?? MAX_STREAM_BYTES;
  let next = 0;
  let bytesDone = 0;
  let segmentsDone = 0;
  let failure: MediaForgeError | undefined;
  const local = new AbortController();
  const signal = AbortSignal.any([opts.signal, local.signal]);

  const worker = async (): Promise<void> => {
    while (!failure) {
      await opts.gate?.wait(signal);
      const i = next++;
      if (i >= segments.length) return;
      const seg = segments[i]!;
      try {
        const retryOpts: Parameters<typeof withRetry>[1] = { maxRetries: opts.maxRetries, signal };
        if (opts.policy) retryOpts.policy = opts.policy;
        if (opts.sleep) retryOpts.sleep = opts.sleep;
        const bytes = await withRetry(() => fetchSegment(seg, fetchImpl, signal), retryOpts);
        if (i === 0 && looksLikeErrorBody(bytes)) {
          throw new MediaForgeError('ACCESS_DENIED', { detail: 'Server returned a web page instead of media' });
        }
        results[i] = new Blob([bytes]);
        bytesDone += bytes.length;
        segmentsDone++;
        if (bytesDone > maxBytes) throw new MediaForgeError('TOO_LARGE');
        opts.onProgress?.(bytesDone, segmentsDone);
      } catch (e) {
        failure ??= opts.signal.aborted ? new MediaForgeError('CANCELLED') : toMediaForgeError(e);
        local.abort();
        return;
      }
    }
  };

  const n = Math.max(1, Math.min(opts.concurrency, segments.length || 1));
  await Promise.all(Array.from({ length: n }, worker));
  if (failure) throw failure;
  if (opts.signal.aborted) throw new MediaForgeError('CANCELLED');
  return results;
}
