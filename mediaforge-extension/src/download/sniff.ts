export type SniffedContainer = 'mp4' | 'webm' | 'ts' | 'mp3' | 'aac' | 'ogg' | 'flac' | 'wav' | 'html' | 'text' | 'unknown';

/**
 * Identify a container from its first bytes. Used to reject error pages that
 * servers sometimes return with a 200 status instead of media data.
 */
export function sniffContainer(bytes: Uint8Array): SniffedContainer {
  const b = bytes;
  const at = (i: number): number => b[i] ?? -1;
  const ascii = (start: number, s: string): boolean => [...s].every((ch, i) => at(start + i) === ch.charCodeAt(0));
  if (b.length >= 8 && (ascii(4, 'ftyp') || ascii(4, 'styp') || ascii(4, 'moof') || ascii(4, 'moov') || ascii(4, 'sidx') || ascii(4, 'free'))) return 'mp4';
  if (at(0) === 0x1a && at(1) === 0x45 && at(2) === 0xdf && at(3) === 0xa3) return 'webm';
  if (at(0) === 0x47 && (b.length < 189 || at(188) === 0x47)) return 'ts';
  if (ascii(0, 'ID3')) return 'mp3';
  if (at(0) === 0xff && (at(1) & 0xf6) === 0xf0) return 'aac';
  if (at(0) === 0xff && (at(1) & 0xe0) === 0xe0) return 'mp3';
  if (ascii(0, 'OggS')) return 'ogg';
  if (ascii(0, 'fLaC')) return 'flac';
  if (ascii(0, 'RIFF') && ascii(8, 'WAVE')) return 'wav';
  const head = new TextDecoder().decode(b.subarray(0, 256)).trimStart().toLowerCase();
  if (head.startsWith('<!doctype html') || head.startsWith('<html') || head.startsWith('<?xml') || head.startsWith('<error')) return 'html';
  if (head.startsWith('{') || head.startsWith('#extm3u')) return 'text';
  return 'unknown';
}

/** True when a segment body is clearly not media (HTML/JSON error page). */
export function looksLikeErrorBody(bytes: Uint8Array): boolean {
  const c = sniffContainer(bytes);
  return c === 'html' || c === 'text';
}
