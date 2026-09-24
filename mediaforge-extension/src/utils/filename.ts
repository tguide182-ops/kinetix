import { hostnameOf, lastPathSegment } from './url';
import { stemFromUrl } from './mime';

const ILLEGAL = /[/\\:*?"<>|]/g;
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩﻿]/g;
const RESERVED = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\..*)?$/i;
const MAX_STEM = 120;

/** Truncate without splitting a surrogate pair. */
function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  let out = s.slice(0, max);
  const last = out.charCodeAt(out.length - 1);
  if (last >= 0xd800 && last <= 0xdbff) out = out.slice(0, -1);
  return out;
}

/**
 * Make an arbitrary string safe to use as a single path component on
 * Windows, macOS and Linux. Never returns an empty string, "." or "..".
 */
export function sanitizeFilenamePart(input: string, fallback = 'media'): string {
  let s = String(input ?? '')
    .normalize('NFC')
    .replace(CONTROL, '')
    .replace(ILLEGAL, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  s = s.replace(/^[.\s-]+/, '').replace(/[.\s]+$/, '');
  s = truncate(s, MAX_STEM).trim().replace(/[.\s]+$/, '');
  if (!s || s === '.' || s === '..') s = fallback;
  if (RESERVED.test(s)) s = `_${s}`;
  return s;
}

export function sanitizeExtension(ext: string): string {
  const e = ext.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5);
  return e || 'bin';
}

/** Sanitize a relative folder like "Videos/MediaForge"; strips traversal and absolute paths. */
export function sanitizeFolder(input: string): string {
  return String(input ?? '')
    .split(/[/\\]+/)
    .map((p) => p.trim())
    .filter((p) => p && p !== '.' && p !== '..')
    .map((p) => sanitizeFilenamePart(p, ''))
    .filter(Boolean)
    .slice(0, 8)
    .join('/');
}

/**
 * Remove site-name suffixes/prefixes like "Great Talk | Example" or
 * "Example - Great Talk" when the removed part matches the site's host.
 */
export function cleanPageTitle(title: string | undefined, pageUrl?: string): string {
  let t = (title ?? '').replace(CONTROL, '').replace(/\s+/g, ' ').trim();
  t = t.replace(/^\(\d+\+?\)\s*/, ''); // notification counters like "(3) "
  if (!t) return '';
  const host = hostnameOf(pageUrl).replace(/^www\./, '');
  const siteWords = host.split('.').slice(0, -1).join(' ').toLowerCase();
  const parts = t.split(/\s+[|–—·•-]\s+/);
  if (parts.length > 1 && siteWords) {
    const matchesSite = (p: string): boolean => {
      const n = p.toLowerCase().replace(/[^a-z0-9]/g, '');
      return n.length > 0 && n.length <= 40 && siteWords.replace(/[^a-z0-9]/g, '').includes(n);
    };
    if (matchesSite(parts[parts.length - 1]!)) parts.pop();
    else if (matchesSite(parts[0]!)) parts.shift();
    t = parts.join(' - ');
  }
  return t.trim();
}

export interface FilenameInput {
  mediaTitle?: string;
  pageTitle?: string;
  pageUrl?: string;
  mediaUrl: string;
  qualityLabel?: string;
  extension: string;
  template?: string;
  date?: Date;
  /** Added before the extension, e.g. "audio". */
  suffix?: string;
}

const GENERIC_STEMS = /^(index|video|audio|media|master|playlist|manifest|stream|file|download|play|source|default|main|output|chunklist.*|[0-9a-f]{16,}|[0-9a-z_-]{24,})$/i;

/** True for URL file names that say nothing about the content ("master", "index", hashes). */
export function isGenericStem(stem: string): boolean {
  return !stem || GENERIC_STEMS.test(stem);
}

/**
 * Build a clean, safe filename such as "Example Documentary - 1080p.mp4".
 * Title priority: media title → page title → URL filename (query parameters are
 * never used) → host name.
 */
export function buildFilename(input: FilenameInput): string {
  const urlStem = stemFromUrl(input.mediaUrl);
  const usableStem = !isGenericStem(urlStem) ? urlStem.replace(/[_+]+/g, ' ') : '';
  const title =
    cleanPageTitle(input.mediaTitle, input.pageUrl) ||
    cleanPageTitle(input.pageTitle, input.pageUrl) ||
    usableStem ||
    hostnameOf(input.pageUrl || input.mediaUrl).replace(/^www\./, '') ||
    'media';
  const site = hostnameOf(input.pageUrl || input.mediaUrl).replace(/^www\./, '');
  const date = (input.date ?? new Date()).toISOString().slice(0, 10);
  const template = input.template?.trim() || '{title} - {quality}';

  // Avoid "Clip 720p - 720p" when the title already carries the quality.
  const quality = input.qualityLabel && !title.toLowerCase().includes(input.qualityLabel.toLowerCase()) ? input.qualityLabel : '';

  let stem = template
    .replace(/\{title\}/g, title)
    .replace(/\{quality\}/g, quality)
    .replace(/\{site\}/g, site)
    .replace(/\{date\}/g, date);
  // Collapse separators left dangling by empty tokens: "Title - " → "Title".
  stem = stem.replace(/(\s*[-_|•]\s*)+$/g, '').replace(/^(\s*[-_|•]\s*)+/g, '').replace(/(\s[-_|•]\s)(\s*[-_|•]\s*)+/g, '$1');
  if (input.suffix) stem = `${stem} (${input.suffix})`;
  return `${sanitizeFilenamePart(stem)}.${sanitizeExtension(input.extension)}`;
}

/**
 * Tracks filenames handed out during this session so two downloads started
 * in quick succession do not collide ("Clip.mp4", "Clip (2).mp4").
 * Chrome's conflictAction:"uniquify" additionally protects existing files.
 */
export class FilenameRegistry {
  private readonly used = new Set<string>();

  reserve(path: string): string {
    const key = (p: string): string => p.toLowerCase();
    if (!this.used.has(key(path))) {
      this.used.add(key(path));
      return path;
    }
    const m = /^(.*?)(\.[^./]+)?$/.exec(path)!;
    const stem = m[1] ?? path;
    const ext = m[2] ?? '';
    for (let i = 2; i < 10_000; i++) {
      const candidate = `${stem} (${i})${ext}`;
      if (!this.used.has(key(candidate))) {
        this.used.add(key(candidate));
        return candidate;
      }
    }
    return path;
  }

  release(path: string): void {
    this.used.delete(path.toLowerCase());
  }
}

export function joinDownloadPath(folder: string, filename: string): string {
  const f = sanitizeFolder(folder);
  return f ? `${f}/${filename}` : filename;
}

export { lastPathSegment };
