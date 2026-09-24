import { errorFromStatus, MediaForgeError, toMediaForgeError } from '../../utils/errors';
import { isHttpUrl } from '../../utils/url';

export interface FetchedText {
  text: string;
  /** URL after redirects — relative manifest URIs resolve against this. */
  url: string;
  contentType: string;
}

export type TextFetcher = (url: string, signal?: AbortSignal) => Promise<FetchedText>;

const MAX_MANIFEST_BYTES = 20 * 1024 * 1024;

/**
 * Fetch a manifest through Chrome's normal network stack. The browser attaches
 * whatever credentials it normally would for this request; MediaForge never
 * reads, copies or stores cookies or authorization headers. Server refusals are
 * reported, never worked around.
 */
export const fetchText: TextFetcher = async (url, signal) => {
  if (!isHttpUrl(url)) throw new MediaForgeError('UNSUPPORTED', { detail: 'Only http(s) manifests can be fetched' });
  const timeout = AbortSignal.timeout(20_000);
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
  let res: Response;
  try {
    res = await fetch(url, { credentials: 'include', signal: combined, cache: 'no-store', redirect: 'follow' });
  } catch (e) {
    if (timeout.aborted && !signal?.aborted) throw new MediaForgeError('TIMEOUT', { transient: true, detail: 'manifest fetch timed out' });
    throw toMediaForgeError(e);
  }
  if (!res.ok) throw errorFromStatus(res.status, url);
  const len = Number(res.headers.get('content-length') ?? '0');
  if (len > MAX_MANIFEST_BYTES) throw new MediaForgeError('MANIFEST_PARSE', { detail: 'Manifest too large' });
  const text = await res.text();
  if (text.length > MAX_MANIFEST_BYTES) throw new MediaForgeError('MANIFEST_PARSE', { detail: 'Manifest too large' });
  return { text, url: res.url || url, contentType: res.headers.get('content-type') ?? '' };
};
