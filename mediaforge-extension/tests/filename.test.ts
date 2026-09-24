import { describe, expect, it } from 'vitest';
import { buildFilename, cleanPageTitle, FilenameRegistry, joinDownloadPath, sanitizeFilenamePart, sanitizeFolder } from '../src/utils/filename';

describe('sanitizeFilenamePart', () => {
  it('removes characters illegal on Windows/macOS/Linux', () => {
    expect(sanitizeFilenamePart('a/b\\c:d*e?f"g<h>i|j')).toBe('a b c d e f g h i j');
  });

  it('strips control and bidi-override characters', () => {
    expect(sanitizeFilenamePart('evil‮gnp.exe\u0000')).toBe('evilgnp.exe');
  });

  it('prevents traversal, hidden files and empty names', () => {
    expect(sanitizeFilenamePart('..')).toBe('media');
    expect(sanitizeFilenamePart('../../etc/passwd')).toBe('etc passwd');
    expect(sanitizeFilenamePart('.bashrc')).toBe('bashrc');
    expect(sanitizeFilenamePart('   ')).toBe('media');
    expect(sanitizeFilenamePart('trailing dots...')).toBe('trailing dots');
  });

  it('escapes reserved Windows device names', () => {
    expect(sanitizeFilenamePart('CON')).toBe('_CON');
    expect(sanitizeFilenamePart('lpt1')).toBe('_lpt1');
  });

  it('truncates long names without splitting surrogate pairs', () => {
    const s = sanitizeFilenamePart('a'.repeat(119) + '😀😀');
    expect(s.length).toBeLessThanOrEqual(120);
    expect(s.endsWith('\ud83d')).toBe(false);
  });
});

describe('sanitizeFolder', () => {
  it('keeps safe relative folders and drops traversal/absolute parts', () => {
    expect(sanitizeFolder('Videos/MediaForge')).toBe('Videos/MediaForge');
    expect(sanitizeFolder('../../Windows/System32')).toBe('Windows/System32');
    expect(sanitizeFolder('/abs\\path:x')).toBe('abs/path x');
    expect(sanitizeFolder('')).toBe('');
    expect(joinDownloadPath('MF', 'a.mp4')).toBe('MF/a.mp4');
    expect(joinDownloadPath('', 'a.mp4')).toBe('a.mp4');
  });
});

describe('cleanPageTitle', () => {
  it('drops a trailing site-name suffix', () => {
    expect(cleanPageTitle('Example Documentary | ExampleTube', 'https://www.exampletube.com/watch')).toBe('Example Documentary');
    expect(cleanPageTitle('(3) Great Talk - Vimeo', 'https://vimeo.com/1')).toBe('Great Talk');
  });
  it('keeps titles whose parts are not the site name', () => {
    expect(cleanPageTitle('Part 1 - The Beginning', 'https://example.com')).toBe('Part 1 - The Beginning');
  });
});

describe('buildFilename', () => {
  it('builds "Title - 1080p.mp4" from page title and quality', () => {
    expect(
      buildFilename({ pageTitle: 'Example Documentary', pageUrl: 'https://site.com/v', mediaUrl: 'https://cdn.site.com/a/master.m3u8', qualityLabel: '1080p', extension: 'mp4' }),
    ).toBe('Example Documentary - 1080p.mp4');
  });

  it('never leaks query parameters (tokens) into the filename', () => {
    const name = buildFilename({ mediaUrl: 'https://cdn.x.com/files/holiday_clip.mp4?token=SECRET&sig=abc', extension: 'mp4' });
    expect(name).toBe('holiday clip.mp4');
    expect(name).not.toContain('SECRET');
  });

  it('omits the quality when unknown and avoids duplicating it', () => {
    expect(buildFilename({ mediaTitle: 'Clip', mediaUrl: 'https://a.com/x.mp4', extension: 'mp4' })).toBe('Clip.mp4');
    expect(buildFilename({ mediaTitle: 'Clip 720p', mediaUrl: 'https://a.com/x.mp4', qualityLabel: '720p', extension: 'mp4' })).toBe('Clip 720p.mp4');
  });

  it('falls back to host name for generic URL stems', () => {
    expect(buildFilename({ mediaUrl: 'https://media.example.org/hls/playlist.m3u8', pageUrl: 'https://www.example.org/', extension: 'mp4' })).toBe(
      'example.org.mp4',
    );
  });

  it('supports templates with {site} and {date}', () => {
    const name = buildFilename({
      mediaTitle: 'Talk',
      pageUrl: 'https://www.example.org/',
      mediaUrl: 'https://a.com/x.mp4',
      qualityLabel: '720p',
      extension: 'mp4',
      template: '{site}_{title}_{quality}_{date}',
      date: new Date('2026-01-02T00:00:00Z'),
    });
    expect(name).toBe('example.org_Talk_720p_2026-01-02.mp4');
  });

  it('sanitizes hostile titles and extensions', () => {
    const name = buildFilename({ mediaTitle: '<script>alert(1)</script>/../x', mediaUrl: 'https://a.com/v.mp4', extension: 'mp4/../exe' });
    expect(name).not.toMatch(/[<>/\\]/);
    expect(name.endsWith('.mp4ex')).toBe(true);
  });
});

describe('FilenameRegistry', () => {
  it('prevents collisions within a session', () => {
    const r = new FilenameRegistry();
    expect(r.reserve('MF/Clip.mp4')).toBe('MF/Clip.mp4');
    expect(r.reserve('MF/clip.mp4')).toBe('MF/clip (2).mp4');
    expect(r.reserve('MF/Clip.mp4')).toBe('MF/Clip (3).mp4');
    r.release('MF/Clip.mp4');
    expect(r.reserve('MF/Clip.mp4')).toBe('MF/Clip.mp4');
  });
});
