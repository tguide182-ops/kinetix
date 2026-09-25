import type { MediaCandidate } from '../types';
import { classifyMedia } from '../utils/mime';


function header(headers: chrome.webRequest.HttpHeader[] | undefined, name: string): string | undefined {
  const h = headers?.find((x) => x.name.toLowerCase() === name);
  return h?.value;
}

/** Total size from Content-Range ("bytes 0-1023/52428800") or Content-Length. */
export function sizeFromHeaders(headers: chrome.webRequest.HttpHeader[] | undefined, status: number): number | undefined {
  const range = header(headers, 'content-range');
  const m = range ? /\/(\d+)\s*$/.exec(range) : null;
  if (m) return Number(m[1]);
  if (status === 206) return undefined;
  const len = Number(header(headers, 'content-length') ?? '');
  return Number.isFinite(len) && len > 0 ? len : undefined;
}

/**
 * Turn a response observed by chrome.webRequest into a media candidate.
 * Only the response's Content-Type/Length/Range headers are read; request
 * headers (cookies, Authorization) are never requested or inspected.
 */
export function candidateFromResponse(d: chrome.webRequest.OnHeadersReceivedDetails): MediaCandidate | null {
  if (d.tabId < 0 || d.method !== 'GET') return null;
  if (d.statusCode !== 200 && d.statusCode !== 206) return null;
  const mime = header(d.responseHeaders, 'content-type');
  const cls = classifyMedia(d.url, mime);
  if (!cls || cls.isSegment || cls.type === 'unknown') return null;
  const size = sizeFromHeaders(d.responseHeaders, d.statusCode);
  // Small files are still reported (with their size) so the collection can
  // drop an entry another detector already listed without knowing its size.
  const c: MediaCandidate = { url: d.url, method: 'network' };
  if (mime) c.mimeType = mime;
  if (size !== undefined && !cls.isStream) c.size = size;
  return c;
}
