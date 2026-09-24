import type { DetectionMethod, MediaCandidate, MediaResource, StreamAnalysis } from '../types';
import { hashString } from '../utils/id';
import { classifyMedia, stemFromUrl } from '../utils/mime';
import { qualityFromText, qualityLabel } from '../utils/quality';
import { isAcceptableMediaUrl, isBlobUrl, isSafeImageUrl, normalizeUrl, stripTracking } from '../utils/url';

const MAX_ITEMS_PER_PAGE = 200;
const MAX_TITLE = 300;

function cleanText(s: string | undefined, max = MAX_TITLE): string | undefined {
  if (typeof s !== 'string') return undefined;
  // eslint-disable-next-line no-control-regex
  const t = s.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
  return t || undefined;
}

function positive(n: unknown, max = Number.MAX_SAFE_INTEGER): number | undefined {
  return typeof n === 'number' && Number.isFinite(n) && n > 0 && n <= max ? n : undefined;
}

export function mediaIdFor(dedupKey: string): string {
  return `m_${hashString(dedupKey)}_${dedupKey.length.toString(36)}`;
}

/**
 * Validate and normalize an untrusted candidate into a MediaResource.
 * Returns null for anything that is not listable media (unsafe schemes,
 * non-media, stream fragments).
 */
export function candidateToResource(c: MediaCandidate, ctx: { pageUrl: string; pageTitle?: string }, now = Date.now()): MediaResource | null {
  if (!c || typeof c.url !== 'string' || !isAcceptableMediaUrl(c.url)) return null;
  const blob = isBlobUrl(c.url);
  const hint = c.element === 'video' || c.element === 'audio' ? c.element : undefined;
  const cls = classifyMedia(c.url, c.mimeType, hint);
  if (!cls || cls.isSegment) return null;
  if (cls.type === 'unknown') return null;

  const url = blob ? c.url : stripTracking(c.url);
  const dedupKey = normalizeUrl(url);
  const width = positive(c.width, 20_000);
  const height = positive(c.height, 20_000);
  const r: MediaResource = {
    id: mediaIdFor(dedupKey),
    url,
    dedupKey,
    type: cls.type,
    format: cls.format,
    sourcePage: ctx.pageUrl,
    detectionMethod: c.method,
    detectionMethods: [c.method],
    isStream: cls.isStream,
    isProtected: false,
    protection: 'none',
    detectedAt: now,
  };
  if (cls.mimeType) r.mimeType = cls.mimeType;
  const title = cleanText(c.title);
  if (title) r.title = title;
  const pageTitle = cleanText(c.pageTitle ?? ctx.pageTitle);
  if (pageTitle) r.pageTitle = pageTitle;
  const size = positive(c.size ?? c.blobSize);
  if (size) r.size = size;
  const duration = positive(c.duration, 1e7);
  if (duration) r.duration = duration;
  if (width) r.width = width;
  if (height) r.height = height;
  const label = qualityLabel(width, height) ?? (blob ? undefined : qualityFromText(stemFromUrl(url)));
  if (label) r.qualityLabel = label;
  if (isSafeImageUrl(c.posterUrl)) r.posterUrl = c.posterUrl;
  if (blob) r.isBlob = true;
  if (!blob) {
    const stem = stemFromUrl(url);
    if (stem) r.filename = cleanText(stem, 120)!;
  }
  return r;
}

/** Merge a newly observed resource into an existing one with the same dedup key. */
export function mergeResources(a: MediaResource, b: MediaResource): MediaResource {
  const methods = new Set<DetectionMethod>([...a.detectionMethods, ...b.detectionMethods]);
  const merged: MediaResource = { ...a, detectionMethods: [...methods] };
  const fill = <K extends keyof MediaResource>(k: K): void => {
    if (merged[k] === undefined && b[k] !== undefined) merged[k] = b[k];
  };
  (['mimeType', 'title', 'filename', 'size', 'duration', 'width', 'height', 'bitrate', 'fps', 'codec', 'posterUrl', 'pageTitle', 'analysis'] as const).forEach(fill);
  // DOM-provided titles are more descriptive than network ones.
  if (b.title && (b.detectionMethod === 'dom' || b.detectionMethod === 'media-event')) merged.title = b.title;
  // Prefer a specific format/type over unknown.
  if (merged.format === 'unknown' && b.format !== 'unknown') merged.format = b.format;
  if (b.size && (!merged.size || b.size > merged.size)) merged.size = b.size;
  merged.qualityLabel = qualityLabel(merged.width, merged.height) ?? merged.qualityLabel ?? b.qualityLabel;
  if (!merged.qualityLabel) delete merged.qualityLabel;
  merged.detectedAt = Math.min(a.detectedAt, b.detectedAt);
  merged.isProtected = a.isProtected || b.isProtected;
  if (b.protection !== 'none') merged.protection = b.protection;
  return merged;
}

export interface AddResult {
  added: MediaResource[];
  updated: MediaResource[];
}

/**
 * Per-page collection of detected media with deduplication.
 * Also remembers "suppressed" keys — e.g. the variant playlists of a master
 * HLS playlist — so they are not listed as separate items.
 */
export class MediaCollection {
  private items = new Map<string, MediaResource>();
  private suppressed = new Set<string>();

  constructor(snapshot?: { items: MediaResource[]; suppressed: string[] }) {
    if (snapshot) {
      for (const it of snapshot.items) this.items.set(it.dedupKey, it);
      for (const k of snapshot.suppressed) this.suppressed.add(k);
    }
  }

  get size(): number {
    return this.items.size;
  }

  list(): MediaResource[] {
    return [...this.items.values()].sort((a, b) => rank(b) - rank(a) || a.detectedAt - b.detectedAt);
  }

  get(id: string): MediaResource | undefined {
    for (const it of this.items.values()) if (it.id === id) return it;
    return undefined;
  }

  findByUrl(url: string): MediaResource | undefined {
    return this.items.get(normalizeUrl(url));
  }

  addResource(r: MediaResource): 'added' | 'updated' | 'ignored' {
    if (this.suppressed.has(r.dedupKey)) return 'ignored';
    const existing = this.items.get(r.dedupKey);
    if (existing) {
      const merged = mergeResources(existing, r);
      if (JSON.stringify(merged) === JSON.stringify(existing)) return 'ignored';
      this.items.set(r.dedupKey, merged);
      return 'updated';
    }
    if (this.items.size >= MAX_ITEMS_PER_PAGE) return 'ignored';
    this.items.set(r.dedupKey, r);
    return 'added';
  }

  addCandidates(cands: MediaCandidate[], ctx: { pageUrl: string; pageTitle?: string }, now = Date.now()): AddResult {
    const res: AddResult = { added: [], updated: [] };
    for (const c of cands) {
      const r = candidateToResource(c, ctx, now);
      if (!r) continue;
      const outcome = this.addResource(r);
      if (outcome === 'added') res.added.push(this.items.get(r.dedupKey)!);
      else if (outcome === 'updated') res.updated.push(this.items.get(r.dedupKey)!);
    }
    return res;
  }

  /** Attach a manifest analysis and hide child playlists it references. */
  setAnalysis(id: string, analysis: StreamAnalysis): MediaResource | undefined {
    const it = this.get(id);
    if (!it) return undefined;
    it.analysis = analysis;
    it.protection = analysis.protection;
    it.isProtected = analysis.protection !== 'none';
    if (analysis.duration && !it.duration) it.duration = analysis.duration;
    const best = analysis.variants[0];
    if (best) {
      if (best.width && !it.width) it.width = best.width;
      if (best.height && !it.height) it.height = best.height;
      if (best.qualityLabel) it.qualityLabel = best.qualityLabel;
      if (best.codecs) it.codec = best.codecs;
      if (best.bandwidth) it.bitrate = best.bandwidth;
      if (best.frameRate) it.fps = best.frameRate;
    }
    for (const v of [...analysis.variants, ...analysis.audioTracks]) {
      if (!v.url) continue;
      const key = normalizeUrl(v.url);
      if (key === it.dedupKey) continue;
      this.suppressed.add(key);
      this.items.delete(key);
    }
    return it;
  }

  /** Remove everything detected before `keepSince` (SPA navigation). */
  clear(keepSince?: number): void {
    if (keepSince === undefined) {
      this.items.clear();
      this.suppressed.clear();
      return;
    }
    for (const [k, v] of this.items) if (v.detectedAt < keepSince) this.items.delete(k);
  }

  applyPosterHint(posterUrl: string): void {
    if (!isSafeImageUrl(posterUrl)) return;
    for (const it of this.items.values()) if (it.isStream && !it.posterUrl) it.posterUrl = posterUrl;
  }

  toJSON(): { items: MediaResource[]; suppressed: string[] } {
    return { items: [...this.items.values()], suppressed: [...this.suppressed] };
  }
}

/** Sort order: streams and larger/higher-quality media first. */
function rank(r: MediaResource): number {
  let s = 0;
  if (r.type === 'hls' || r.type === 'dash') s += 4e12;
  else if (r.type === 'video') s += 3e12;
  else if (r.type === 'audio') s += 2e12;
  s += (r.height ?? 0) * 1e8;
  s += Math.min(r.size ?? 0, 9e7);
  return s;
}
