import type { ByteRange, ProtectionStatus } from '../../types';
import { MediaForgeError } from '../../utils/errors';
import { qualityLabel } from '../../utils/quality';
import { resolveUrl } from '../../utils/url';

export interface HlsKey {
  method: string;
  uri?: string;
  keyFormat?: string;
}

export interface HlsVariant {
  uri: string;
  bandwidth?: number;
  averageBandwidth?: number;
  width?: number;
  height?: number;
  frameRate?: number;
  codecs?: string;
  audioGroup?: string;
  videoGroup?: string;
  qualityLabel?: string;
}

export interface HlsRendition {
  type: 'AUDIO' | 'VIDEO' | 'SUBTITLES' | 'CLOSED-CAPTIONS';
  groupId: string;
  name?: string;
  language?: string;
  uri?: string;
  isDefault: boolean;
  channels?: string;
}

export interface HlsMasterPlaylist {
  type: 'master';
  variants: HlsVariant[];
  renditions: HlsRendition[];
  sessionKeys: HlsKey[];
}

export interface HlsSegment {
  uri: string;
  duration: number;
  byteRange?: ByteRange;
  key?: HlsKey;
  map?: { uri: string; byteRange?: ByteRange };
  discontinuity: boolean;
}

export interface HlsMediaPlaylist {
  type: 'media';
  targetDuration?: number;
  mediaSequence: number;
  endList: boolean;
  playlistType?: string;
  segments: HlsSegment[];
  keys: HlsKey[];
  totalDuration: number;
}

export type HlsPlaylist = HlsMasterPlaylist | HlsMediaPlaylist;

const MAX_SEGMENTS = 100_000;

/** Parse an HLS attribute list: KEY=VALUE,KEY="quoted, value",... */
export function parseAttributes(input: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /([A-Z0-9-]+)=("[^"]*"|[^,]*)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(input))) {
    const raw = m[2] ?? '';
    out[m[1]!] = raw.startsWith('"') ? raw.slice(1, -1) : raw.trim();
  }
  return out;
}

function num(v: string | undefined): number | undefined {
  if (v === undefined || v === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

/** "length@offset"; the offset defaults to the end of the previous sub-range. */
function parseByteRange(v: string, defaultStart: number | undefined): ByteRange | undefined {
  const m = /^(\d+)(?:@(\d+))?$/.exec(v.trim());
  if (!m) return undefined;
  const length = Number(m[1]);
  const start = m[2] !== undefined ? Number(m[2]) : defaultStart ?? 0;
  if (!(length > 0)) return undefined;
  return { start, end: start + length - 1 };
}

function parseKey(attrs: Record<string, string>, base: string): HlsKey {
  const key: HlsKey = { method: (attrs.METHOD ?? 'NONE').toUpperCase() };
  if (attrs.URI) key.uri = resolveUrl(attrs.URI, base) ?? attrs.URI;
  if (attrs.KEYFORMAT) key.keyFormat = attrs.KEYFORMAT;
  return key;
}

function resolveOrThrow(uri: string, base: string): string {
  const r = resolveUrl(uri, base);
  if (!r) throw new MediaForgeError('MANIFEST_PARSE', { detail: 'Playlist references a non-http(s) URI' });
  return r;
}

export function isHlsText(text: string): boolean {
  return /^﻿?\s*#EXTM3U/.test(text);
}

export function parseM3u8(text: string, baseUrl: string): HlsPlaylist {
  if (typeof text !== 'string' || !isHlsText(text)) {
    throw new MediaForgeError('MANIFEST_PARSE', { detail: 'Missing #EXTM3U header' });
  }
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const isMaster = lines.some((l) => l.startsWith('#EXT-X-STREAM-INF'));
  return isMaster ? parseMaster(lines, baseUrl) : parseMedia(lines, baseUrl);
}

function parseMaster(lines: string[], base: string): HlsMasterPlaylist {
  const variants: HlsVariant[] = [];
  const renditions: HlsRendition[] = [];
  const sessionKeys: HlsKey[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (line.startsWith('#EXT-X-STREAM-INF:')) {
      const a = parseAttributes(line.slice('#EXT-X-STREAM-INF:'.length));
      // The URI is the next non-comment line.
      let j = i + 1;
      while (j < lines.length && lines[j]!.startsWith('#')) j++;
      const uriLine = lines[j];
      if (!uriLine) continue;
      i = j;
      const res = /^(\d+)x(\d+)$/i.exec(a.RESOLUTION ?? '');
      const v: HlsVariant = { uri: resolveOrThrow(uriLine, base) };
      const bw = num(a.BANDWIDTH);
      if (bw !== undefined) v.bandwidth = bw;
      const abw = num(a['AVERAGE-BANDWIDTH']);
      if (abw !== undefined) v.averageBandwidth = abw;
      if (res) {
        v.width = Number(res[1]);
        v.height = Number(res[2]);
        const label = qualityLabel(v.width, v.height);
        if (label) v.qualityLabel = label;
      }
      const fr = num(a['FRAME-RATE']);
      if (fr !== undefined) v.frameRate = fr;
      if (a.CODECS) v.codecs = a.CODECS;
      if (a.AUDIO) v.audioGroup = a.AUDIO;
      if (a.VIDEO) v.videoGroup = a.VIDEO;
      variants.push(v);
    } else if (line.startsWith('#EXT-X-MEDIA:')) {
      const a = parseAttributes(line.slice('#EXT-X-MEDIA:'.length));
      const type = a.TYPE as HlsRendition['type'] | undefined;
      if (!type || !a['GROUP-ID']) continue;
      const r: HlsRendition = { type, groupId: a['GROUP-ID'], isDefault: a.DEFAULT === 'YES' };
      if (a.NAME) r.name = a.NAME;
      if (a.LANGUAGE) r.language = a.LANGUAGE;
      if (a.CHANNELS) r.channels = a.CHANNELS;
      if (a.URI) r.uri = resolveOrThrow(a.URI, base);
      renditions.push(r);
    } else if (line.startsWith('#EXT-X-SESSION-KEY:')) {
      sessionKeys.push(parseKey(parseAttributes(line.slice('#EXT-X-SESSION-KEY:'.length)), base));
    }
  }
  if (!variants.length) throw new MediaForgeError('MANIFEST_PARSE', { detail: 'Master playlist has no variants' });
  return { type: 'master', variants, renditions, sessionKeys };
}

function parseMedia(lines: string[], base: string): HlsMediaPlaylist {
  const pl: HlsMediaPlaylist = { type: 'media', mediaSequence: 0, endList: false, segments: [], keys: [], totalDuration: 0 };
  let duration: number | undefined;
  let byteRange: ByteRange | undefined;
  let lastRangeEnd: number | undefined;
  let key: HlsKey | undefined;
  let map: HlsSegment['map'];
  let discontinuity = false;

  for (const line of lines) {
    if (line.startsWith('#EXTINF:')) {
      duration = num(line.slice(8).split(',')[0]) ?? 0;
    } else if (line.startsWith('#EXT-X-BYTERANGE:')) {
      byteRange = parseByteRange(line.slice(17), lastRangeEnd !== undefined ? lastRangeEnd + 1 : undefined);
    } else if (line.startsWith('#EXT-X-KEY:')) {
      key = parseKey(parseAttributes(line.slice(11)), base);
      pl.keys.push(key);
      if (key.method === 'NONE') key = undefined;
    } else if (line.startsWith('#EXT-X-MAP:')) {
      const a = parseAttributes(line.slice(11));
      if (a.URI) {
        map = { uri: resolveOrThrow(a.URI, base) };
        const br = a.BYTERANGE ? parseByteRange(a.BYTERANGE, 0) : undefined;
        if (br) map.byteRange = br;
      }
    } else if (line.startsWith('#EXT-X-TARGETDURATION:')) {
      const t = num(line.slice(22));
      if (t !== undefined) pl.targetDuration = t;
    } else if (line.startsWith('#EXT-X-MEDIA-SEQUENCE:')) {
      pl.mediaSequence = num(line.slice(22)) ?? 0;
    } else if (line.startsWith('#EXT-X-PLAYLIST-TYPE:')) {
      pl.playlistType = line.slice(21).trim().toUpperCase();
    } else if (line === '#EXT-X-ENDLIST') {
      pl.endList = true;
    } else if (line === '#EXT-X-DISCONTINUITY') {
      discontinuity = true;
    } else if (!line.startsWith('#')) {
      if (duration === undefined) continue; // URI without EXTINF: ignore
      const seg: HlsSegment = { uri: resolveOrThrow(line, base), duration, discontinuity };
      if (byteRange) {
        seg.byteRange = byteRange;
        lastRangeEnd = byteRange.end;
      }
      if (key) seg.key = key;
      if (map) seg.map = map;
      pl.segments.push(seg);
      pl.totalDuration += duration;
      if (pl.segments.length > MAX_SEGMENTS) throw new MediaForgeError('TOO_LARGE', { detail: 'Too many segments' });
      duration = undefined;
      byteRange = undefined;
      discontinuity = false;
    }
  }
  if (pl.playlistType === 'VOD') pl.endList = true;
  return pl;
}

const DRM_KEYFORMATS = /streamingkeydelivery|widevine|playready|edef8ba9|9a04f079|94ce86fb|urn:uuid|com\.apple\.fps/i;

/**
 * Classify protection signalled by a set of EXT-X-KEY / EXT-X-SESSION-KEY tags.
 * - SAMPLE-AES / DRM key formats → "drm"
 * - AES-128 (whole-segment encryption with a key that must be acquired) → "encrypted"
 * Both are unsupported: MediaForge never acquires keys or decrypts media.
 */
export function hlsProtection(keys: HlsKey[]): ProtectionStatus {
  let status: ProtectionStatus = 'none';
  for (const k of keys) {
    if (k.method === 'NONE') continue;
    if (k.method.startsWith('SAMPLE-AES') || (k.keyFormat && DRM_KEYFORMATS.test(k.keyFormat)) || (k.uri && /^skd:/i.test(k.uri))) {
      return 'drm';
    }
    status = 'encrypted';
  }
  return status;
}

/** Detect container of media segments (fMP4 when an init map exists or URIs look like fMP4). */
export function hlsSegmentContainer(pl: HlsMediaPlaylist): 'ts' | 'fmp4' | 'aac' | 'unknown' {
  if (pl.segments.some((s) => s.map)) return 'fmp4';
  const first = pl.segments[0]?.uri ?? '';
  const path = first.split('?')[0]!.toLowerCase();
  if (/\.(m4s|mp4|m4v|m4a|cmfv|cmfa)$/.test(path)) return 'fmp4';
  if (/\.(aac|adts)$/.test(path)) return 'aac';
  if (/\.ts$/.test(path)) return 'ts';
  return pl.segments.length ? 'ts' : 'unknown';
}
