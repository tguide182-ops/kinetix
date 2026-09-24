import type { QualityPreference, VideoVariant } from '../types';

export const STANDARD_HEIGHTS = [4320, 2160, 1440, 1080, 720, 480, 360, 240, 144] as const;

/** Tolerance so that e.g. 1920x1036 or 1280x696 still map to 1080p/720p. */
const TOLERANCE = 0.92;

function bucket(lines: number): number | undefined {
  for (const h of STANDARD_HEIGHTS) {
    if (lines >= h * TOLERANCE) return h;
  }
  return undefined;
}

/**
 * Normalize a resolution to a standard label (2160p, 1080p, ...).
 * Uses the short side for portrait video and the long side (as a 16:9
 * equivalent) for letterboxed/ultrawide video so 1920x800 is still "1080p".
 * Returns undefined when the resolution is unknown — never invents a value.
 */
export function qualityLabel(width?: number, height?: number): string | undefined {
  const w = valid(width);
  const h = valid(height);
  if (!w && !h) return undefined;
  if (!w || !h) {
    const b = bucket(h ?? Math.round((w! * 9) / 16));
    return b ? `${b}p` : undefined;
  }
  const short = Math.min(w, h);
  const longEquivalent = Math.round((Math.max(w, h) * 9) / 16);
  const b = bucket(Math.max(short, Math.min(longEquivalent, short * 2)));
  return b ? `${b}p` : undefined;
}

function valid(n: number | undefined): number | undefined {
  return typeof n === 'number' && Number.isFinite(n) && n > 0 && n < 100_000 ? n : undefined;
}

/** Parse an explicit quality token from a filename, e.g. "clip_720p.mp4" → "720p". */
export function qualityFromText(text: string): string | undefined {
  const m = /(?:^|[^0-9a-z])(4320|2160|1440|1080|720|480|360|240|144)p(?:[^0-9a-z]|$)/i.exec(text);
  if (m) return `${m[1]}p`;
  if (/(?:^|[^0-9a-z])(4k|uhd)(?:[^0-9a-z]|$)/i.test(text)) return '2160p';
  return undefined;
}

export function heightFromLabel(label: string | undefined): number | undefined {
  const m = label ? /^(\d{3,4})p$/.exec(label) : null;
  return m ? Number(m[1]) : undefined;
}

export function displayQuality(label: string | undefined): string {
  return label ?? 'Unknown quality';
}

function score(v: VideoVariant): number {
  const h = heightFromLabel(v.qualityLabel) ?? v.height ?? 0;
  return h * 1e9 + (v.bandwidth ?? 0);
}

/** Sort video variants from best to worst. */
export function sortVariants(variants: VideoVariant[]): VideoVariant[] {
  return [...variants].sort((a, b) => score(b) - score(a));
}

/**
 * Choose a video variant for a preference.
 * - highest/auto → best available
 * - "720p" → exact label; else best below it; else the lowest above it
 */
export function selectVideoVariant(variants: VideoVariant[], pref: QualityPreference): VideoVariant | undefined {
  const video = sortVariants(variants.filter((v) => v.kind !== 'audio'));
  if (!video.length) return undefined;
  if (pref === 'auto' || pref === 'highest' || pref === 'audio') return video[0];
  const target = heightFromLabel(pref);
  if (!target) return video[0];
  const exact = video.find((v) => v.qualityLabel === pref);
  if (exact) return exact;
  const below = video.find((v) => (heightFromLabel(v.qualityLabel) ?? v.height ?? 0) <= target && (v.qualityLabel || v.height));
  return below ?? video[video.length - 1];
}

export function selectAudioVariant(
  tracks: VideoVariant[],
  pref: 'highest' | 'balanced' | 'lowest',
  language?: string,
): VideoVariant | undefined {
  let pool = tracks.filter((t) => t.kind === 'audio');
  if (!pool.length) return undefined;
  if (language) {
    const lang = pool.filter((t) => t.language === language);
    if (lang.length) pool = lang;
  }
  const sorted = [...pool].sort((a, b) => (b.bandwidth ?? 0) - (a.bandwidth ?? 0));
  if (pref === 'lowest') return sorted[sorted.length - 1];
  if (pref === 'balanced') return sorted[Math.floor((sorted.length - 1) / 2)];
  return sorted[0];
}
