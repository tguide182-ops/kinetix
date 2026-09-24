import type { MediaResource } from '../types';
import { cleanPageTitle, isGenericStem } from '../utils/filename';

/** Human-friendly title for a detected media item (always rendered as text, never HTML). */
export function mediaDisplayTitle(m: MediaResource): string {
  if (m.title) return m.title;
  const page = cleanPageTitle(m.pageTitle, m.sourcePage);
  if (m.filename && !isGenericStem(m.filename)) return m.filename.replace(/[_+]+/g, ' ');
  return page || m.filename || 'Untitled media';
}

export function mediaTypeLabel(m: MediaResource): string {
  if (m.type === 'hls') return 'HLS';
  if (m.type === 'dash') return 'DASH';
  return m.format === 'unknown' ? (m.type === 'audio' ? 'Audio' : 'Video') : m.format.toUpperCase();
}
