import type { MediaCandidate } from '../types';
import { classifyMedia } from '../utils/mime';
import { isAcceptableMediaUrl, isBlobUrl, isSafeImageUrl, resolveUrl } from '../utils/url';

const LINK_EXTENSIONS = ['mp4', 'webm', 'mov', 'm4v', 'ogv', 'ogg', 'mp3', 'aac', 'm4a', 'wav', 'flac', 'opus', 'm3u8', 'mpd'];
/** Only anchors that point at media — avoids walking every link on large pages. */
export const MEDIA_LINK_SELECTOR = LINK_EXTENSIONS.map((e) => `a[href*=".${e}" i]`).join(',');
export const MEDIA_SELECTOR = `video,audio,source,${MEDIA_LINK_SELECTOR}`;

export interface BlobRegistry {
  /** Blob-backed (downloadable by the page) media blobs: url → info. */
  blobs: Map<string, { mime: string; size: number }>;
  /** MediaSource-backed blob URLs (not downloadable as files). */
  mse: Set<string>;
}

function finite(n: number): number | undefined {
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

function labelFor(el: Element): string | undefined {
  const own = el.getAttribute('title') || el.getAttribute('aria-label') || el.getAttribute('data-title');
  if (own) return own;
  const fig = el.closest('figure')?.querySelector('figcaption')?.textContent;
  return fig || undefined;
}

function candidateFor(url: string, el: Element, kind: 'video' | 'audio' | 'source' | 'a', blobs: BlobRegistry): MediaCandidate | null {
  const base = el.ownerDocument.baseURI;
  const abs = isBlobUrl(url) ? url : resolveUrl(url, base);
  if (!abs || !isAcceptableMediaUrl(abs)) return null;
  const c: MediaCandidate = { url: abs, method: 'dom', element: kind };
  if (isBlobUrl(abs)) {
    const info = blobs.blobs.get(abs);
    if (!info) return null; // MediaSource or unknown blob: no standalone file exists
    c.method = 'blob';
    c.mimeType = info.mime;
    c.blobSize = info.size;
  }
  const media = kind === 'source' ? el.closest('video,audio') : kind === 'a' ? null : el;
  if (media instanceof HTMLMediaElement) {
    const tag = media.tagName.toLowerCase() as 'video' | 'audio';
    if (kind === 'source') c.element = tag;
    const dur = finite(media.duration);
    if (dur && dur !== Infinity) c.duration = dur;
    if (media instanceof HTMLVideoElement) {
      const w = finite(media.videoWidth);
      const h = finite(media.videoHeight);
      if (w && h && (media.currentSrc === url || media.currentSrc === abs)) {
        c.width = w;
        c.height = h;
      }
      const poster = media.poster ? resolveUrl(media.poster, base) : null;
      if (poster && isSafeImageUrl(poster)) c.posterUrl = poster;
    }
    const title = labelFor(media);
    if (title) c.title = title;
  }
  if (kind === 'source') {
    const type = el.getAttribute('type');
    if (type) c.mimeType = type;
  }
  if (kind === 'a') {
    const text = (el.getAttribute('download') || el.textContent || '').trim();
    if (text) c.title = text.slice(0, 200);
    if (!classifyMedia(abs)) return null;
  }
  return c;
}

/** Extract candidates from one element (video/audio/source/a). */
export function candidatesFromElement(el: Element, blobs: BlobRegistry): MediaCandidate[] {
  const out: MediaCandidate[] = [];
  const tag = el.tagName.toLowerCase();
  const push = (c: MediaCandidate | null): void => {
    if (c && !out.some((o) => o.url === c.url)) out.push(c);
  };
  if (tag === 'video' || tag === 'audio') {
    const m = el as HTMLMediaElement;
    const attr = m.getAttribute('src');
    if (attr) push(candidateFor(attr, m, tag, blobs));
    if (m.currentSrc) push(candidateFor(m.currentSrc, m, tag, blobs));
    m.querySelectorAll('source[src]').forEach((s) => push(candidateFor(s.getAttribute('src')!, s, 'source', blobs)));
  } else if (tag === 'source') {
    const src = el.getAttribute('src');
    if (src) push(candidateFor(src, el, 'source', blobs));
  } else if (tag === 'a') {
    const href = el.getAttribute('href');
    if (href) push(candidateFor(href, el, 'a', blobs));
  }
  return out;
}

/** Scan a subtree (or a single element) for media. Targeted: only matching elements are visited. */
export function scanRoot(root: ParentNode | Element, blobs: BlobRegistry): MediaCandidate[] {
  const out: MediaCandidate[] = [];
  if (root instanceof Element && root.matches(MEDIA_SELECTOR)) out.push(...candidatesFromElement(root, blobs));
  root.querySelectorAll(MEDIA_SELECTOR).forEach((el) => out.push(...candidatesFromElement(el, blobs)));
  return out;
}

/** First poster on the page — used as a thumbnail for streams played via Media Source. */
export function findPoster(doc: Document): string | undefined {
  for (const v of Array.from(doc.querySelectorAll('video[poster]')).slice(0, 5)) {
    const p = resolveUrl((v as HTMLVideoElement).getAttribute('poster') ?? '', doc.baseURI);
    if (p && isSafeImageUrl(p)) return p;
  }
  return undefined;
}

/** Media-like entries from the Resource Timing buffer. */
export function candidatesFromPerformance(entries: readonly PerformanceEntry[]): MediaCandidate[] {
  const out: MediaCandidate[] = [];
  for (const e of entries) {
    const r = e as PerformanceResourceTiming & { contentType?: string };
    const url = r.name;
    if (!url || !isAcceptableMediaUrl(url)) continue;
    const cls = classifyMedia(url, r.contentType || undefined);
    if (!cls || cls.isSegment) continue;
    const c: MediaCandidate = { url, method: 'performance' };
    if (r.contentType) c.mimeType = r.contentType;
    // decodedBodySize is the full size only for complete (non-range) responses.
    if (!cls.isStream && r.decodedBodySize > 0 && r.initiatorType !== 'video' && r.initiatorType !== 'audio') c.size = r.decodedBodySize;
    out.push(c);
  }
  return out;
}
