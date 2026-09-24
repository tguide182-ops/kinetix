import type { MediaFormat, MediaType } from '../types';
import { extensionOf, isBlobUrl, lastPathSegment, safeParseUrl } from './url';

interface FormatInfo {
  format: MediaFormat;
  type: MediaType;
  mime: string;
}

const EXTENSIONS: Record<string, FormatInfo> = {
  mp4: { format: 'mp4', type: 'video', mime: 'video/mp4' },
  webm: { format: 'webm', type: 'video', mime: 'video/webm' },
  mov: { format: 'mov', type: 'video', mime: 'video/quicktime' },
  m4v: { format: 'm4v', type: 'video', mime: 'video/x-m4v' },
  ogv: { format: 'ogv', type: 'video', mime: 'video/ogg' },
  ogg: { format: 'ogg', type: 'audio', mime: 'audio/ogg' },
  oga: { format: 'ogg', type: 'audio', mime: 'audio/ogg' },
  mp3: { format: 'mp3', type: 'audio', mime: 'audio/mpeg' },
  aac: { format: 'aac', type: 'audio', mime: 'audio/aac' },
  m4a: { format: 'm4a', type: 'audio', mime: 'audio/mp4' },
  wav: { format: 'wav', type: 'audio', mime: 'audio/wav' },
  flac: { format: 'flac', type: 'audio', mime: 'audio/flac' },
  opus: { format: 'opus', type: 'audio', mime: 'audio/opus' },
  m3u8: { format: 'm3u8', type: 'hls', mime: 'application/vnd.apple.mpegurl' },
  m3u: { format: 'm3u8', type: 'hls', mime: 'application/vnd.apple.mpegurl' },
  mpd: { format: 'mpd', type: 'dash', mime: 'application/dash+xml' },
};

const MIME_TYPES: Record<string, FormatInfo> = {
  'video/mp4': EXTENSIONS.mp4!,
  'video/webm': EXTENSIONS.webm!,
  'video/quicktime': EXTENSIONS.mov!,
  'video/x-m4v': EXTENSIONS.m4v!,
  'video/ogg': EXTENSIONS.ogv!,
  'audio/ogg': EXTENSIONS.ogg!,
  'audio/mpeg': EXTENSIONS.mp3!,
  'audio/mp3': EXTENSIONS.mp3!,
  'audio/aac': EXTENSIONS.aac!,
  'audio/aacp': EXTENSIONS.aac!,
  'audio/x-aac': EXTENSIONS.aac!,
  'audio/mp4': EXTENSIONS.m4a!,
  'audio/x-m4a': EXTENSIONS.m4a!,
  'audio/wav': EXTENSIONS.wav!,
  'audio/x-wav': EXTENSIONS.wav!,
  'audio/wave': EXTENSIONS.wav!,
  'audio/flac': EXTENSIONS.flac!,
  'audio/x-flac': EXTENSIONS.flac!,
  'audio/opus': EXTENSIONS.opus!,
  'audio/webm': { format: 'webm', type: 'audio', mime: 'audio/webm' },
  'application/vnd.apple.mpegurl': EXTENSIONS.m3u8!,
  'application/x-mpegurl': EXTENSIONS.m3u8!,
  'audio/mpegurl': EXTENSIONS.m3u8!,
  'audio/x-mpegurl': EXTENSIONS.m3u8!,
  'application/dash+xml': EXTENSIONS.mpd!,
};

/** Segment/fragment containers: detected but never listed as standalone media. */
const SEGMENT_EXTENSIONS = new Set(['ts', 'm4s', 'm4f', 'cmfv', 'cmfa', 'mp2t', 'fmp4', 'm4i']);
const SEGMENT_MIME = new Set(['video/mp2t', 'video/iso.segment', 'audio/iso.segment']);
/** Whole-filename patterns typical of stream fragments (e.g. "segment_00012.mp4", "000123.aac"). */
const SEGMENT_NAME = /^(?:(?:seg|segment|chunk|frag|fragment)[-_]?\d+[^/]*|\d{1,7})\.(?:ts|aac|m4s|mp4|m4a|m4v|webm)$/i;
const SEGMENT_PATH = /\/(?:fragments|qualitylevels)\(/i;

export function baseMime(mime: string | undefined | null): string {
  return (mime ?? '').split(';')[0]!.trim().toLowerCase();
}

export function formatFromMime(mime: string | undefined | null): FormatInfo | null {
  const m = baseMime(mime);
  if (!m) return null;
  const known = MIME_TYPES[m];
  if (known) return known;
  if (m.startsWith('video/')) return { format: 'unknown', type: 'video', mime: m };
  if (m.startsWith('audio/')) return { format: 'unknown', type: 'audio', mime: m };
  return null;
}

export function formatFromExtension(ext: string): FormatInfo | null {
  return EXTENSIONS[ext.toLowerCase()] ?? null;
}

/** Heuristics for playlist URLs without an extension (e.g. /manifest(format=m3u8-aapl)). */
function formatFromUrlHints(url: string): FormatInfo | null {
  const u = safeParseUrl(url);
  if (!u) return null;
  const s = `${u.pathname}?${u.search}`.toLowerCase();
  if (/\.m3u8(\b|$)|format=m3u8|\/hls\/.*playlist|m3u8-aapl/.test(s)) return EXTENSIONS.m3u8!;
  if (/\.mpd(\b|$)|format=mpd|manifest\(format=mpd/.test(s)) return EXTENSIONS.mpd!;
  return null;
}

export function isSegmentUrl(url: string, mime?: string): boolean {
  if (SEGMENT_MIME.has(baseMime(mime))) return true;
  const ext = extensionOf(url);
  if (SEGMENT_EXTENSIONS.has(ext)) return true;
  if (SEGMENT_NAME.test(lastPathSegment(url))) return true;
  const u = safeParseUrl(url);
  return !!u && SEGMENT_PATH.test(u.pathname);
}

export interface Classification {
  type: MediaType;
  format: MediaFormat;
  mimeType?: string;
  isStream: boolean;
  /** True for HLS/DASH fragments that should not be listed on their own. */
  isSegment: boolean;
}

/**
 * Classify a URL (+ optional MIME type) as media.
 * MIME type wins when it is specific; URL extension is the fallback.
 * Returns null when it does not look like media at all.
 */
export function classifyMedia(url: string, mime?: string | null, elementHint?: 'video' | 'audio'): Classification | null {
  const m = baseMime(mime);
  const fromMime = formatFromMime(m);
  const ext = isBlobUrl(url) ? '' : extensionOf(url);
  const fromExt = ext ? formatFromExtension(ext) : null;
  const fromHints = fromExt ? null : formatFromUrlHints(url);

  // Manifests are identified by either signal; a manifest served as text/plain still counts.
  const manifest = [fromMime, fromExt, fromHints].find((f) => f && (f.type === 'hls' || f.type === 'dash'));
  if (manifest) {
    return { type: manifest.type, format: manifest.format, mimeType: manifest.mime, isStream: true, isSegment: false };
  }

  const segment = !isBlobUrl(url) && isSegmentUrl(url, m);

  let info = fromMime && fromMime.format !== 'unknown' ? fromMime : fromExt ?? fromMime;
  if (!info && elementHint) info = { format: 'unknown', type: elementHint, mime: '' };
  if (!info && segment) info = { format: 'unknown', type: 'video', mime: m };
  if (!info) return null;

  let type = info.type;
  // Element context disambiguates e.g. .webm/.ogg/.mp4 audio.
  if (elementHint && (type === 'video' || type === 'audio')) type = elementHint;
  if (!fromMime && ext === 'mp4' && elementHint === 'audio') type = 'audio';

  return {
    type,
    format: info.format,
    mimeType: m || info.mime || undefined,
    isStream: false,
    isSegment: segment,
  };
}

export function mimeForFormat(format: MediaFormat): string {
  return EXTENSIONS[format]?.mime ?? 'application/octet-stream';
}

export function extensionForFormat(format: MediaFormat, type: MediaType): string {
  if (format !== 'unknown' && format !== 'm3u8' && format !== 'mpd') return format;
  return type === 'audio' ? 'm4a' : 'mp4';
}

/** Name without extension, taken from the URL path. Never includes query parameters. */
export function stemFromUrl(url: string): string {
  const seg = lastPathSegment(url);
  return seg.replace(/\.[a-z0-9]{1,5}$/i, '');
}
