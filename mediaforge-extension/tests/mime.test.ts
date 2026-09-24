import { describe, expect, it } from 'vitest';
import { classifyMedia, extensionForFormat, isSegmentUrl } from '../src/utils/mime';
import { looksLikeErrorBody, sniffContainer } from '../src/download/sniff';
import { HTML_ERROR_PAGE, MP3_ID3_HEADER, MP4_HEADER, TS_PACKETS, WEBM_HEADER } from './fixtures';

describe('classifyMedia', () => {
  it.each([
    ['https://a.com/v.mp4', 'video', 'mp4'],
    ['https://a.com/v.webm', 'video', 'webm'],
    ['https://a.com/v.MOV', 'video', 'mov'],
    ['https://a.com/v.m4v', 'video', 'm4v'],
    ['https://a.com/v.ogv', 'video', 'ogv'],
    ['https://a.com/a.ogg', 'audio', 'ogg'],
    ['https://a.com/a.mp3?x=1', 'audio', 'mp3'],
    ['https://a.com/a.aac', 'audio', 'aac'],
    ['https://a.com/a.wav', 'audio', 'wav'],
    ['https://a.com/a.flac', 'audio', 'flac'],
    ['https://a.com/a.m4a', 'audio', 'm4a'],
    ['https://a.com/s/master.m3u8', 'hls', 'm3u8'],
    ['https://a.com/s/manifest.mpd', 'dash', 'mpd'],
  ])('%s → %s/%s', (url, type, format) => {
    const c = classifyMedia(url);
    expect(c?.type).toBe(type);
    expect(c?.format).toBe(format);
  });

  it('uses the MIME type when the URL has no extension', () => {
    expect(classifyMedia('https://a.com/stream?id=1', 'video/mp4; codecs="avc1"')).toMatchObject({ type: 'video', format: 'mp4' });
    expect(classifyMedia('https://a.com/p', 'application/vnd.apple.mpegurl')).toMatchObject({ type: 'hls', isStream: true });
    expect(classifyMedia('https://a.com/p', 'application/dash+xml')).toMatchObject({ type: 'dash', isStream: true });
    expect(classifyMedia('https://a.com/p', 'audio/x-something')).toMatchObject({ type: 'audio', format: 'unknown' });
  });

  it('recognizes manifests served as text/plain by URL', () => {
    expect(classifyMedia('https://a.com/live/index.m3u8?token=1', 'text/plain')?.type).toBe('hls');
    expect(classifyMedia('https://a.com/v/Manifest(format=mpd-time-csf)', null)?.type).toBe('dash');
  });

  it('uses element context for ambiguous containers', () => {
    expect(classifyMedia('https://a.com/a.webm', undefined, 'audio')?.type).toBe('audio');
    expect(classifyMedia('https://a.com/noext', undefined, 'video')?.type).toBe('video');
  });

  it('returns null for non-media', () => {
    expect(classifyMedia('https://a.com/app.js', 'text/javascript')).toBeNull();
    expect(classifyMedia('https://a.com/page.html')).toBeNull();
    expect(classifyMedia('https://a.com/pic.jpg', 'image/jpeg')).toBeNull();
  });

  it('flags stream fragments as segments', () => {
    expect(classifyMedia('https://a.com/hls/segment12.ts')?.isSegment).toBe(true);
    expect(classifyMedia('https://a.com/x', 'video/mp2t')?.isSegment).toBe(true);
    expect(isSegmentUrl('https://a.com/dash/chunk-stream0-00012.m4s')).toBe(true);
    expect(isSegmentUrl('https://a.com/audio/000123.aac')).toBe(true);
    expect(isSegmentUrl('https://a.com/v/QualityLevels(1)/Fragments(video=0)')).toBe(true);
    // Regular files that merely contain numbers are not segments.
    expect(isSegmentUrl('https://a.com/movies/my-movie-part1.mp4')).toBe(false);
    expect(isSegmentUrl('https://a.com/2024/clip.mp4')).toBe(false);
  });

  it('maps formats to download extensions', () => {
    expect(extensionForFormat('webm', 'video')).toBe('webm');
    expect(extensionForFormat('unknown', 'audio')).toBe('m4a');
    expect(extensionForFormat('m3u8', 'hls')).toBe('mp4');
  });
});

describe('sniffContainer (MP4/WebM mocks)', () => {
  it('identifies media containers', () => {
    expect(sniffContainer(MP4_HEADER)).toBe('mp4');
    expect(sniffContainer(WEBM_HEADER)).toBe('webm');
    expect(sniffContainer(TS_PACKETS)).toBe('ts');
    expect(sniffContainer(MP3_ID3_HEADER)).toBe('mp3');
  });

  it('detects HTML error pages returned instead of media', () => {
    expect(sniffContainer(HTML_ERROR_PAGE)).toBe('html');
    expect(looksLikeErrorBody(HTML_ERROR_PAGE)).toBe(true);
    expect(looksLikeErrorBody(MP4_HEADER)).toBe(false);
  });
});
