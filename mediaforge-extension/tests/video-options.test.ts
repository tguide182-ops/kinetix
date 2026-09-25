import { describe, expect, it } from 'vitest';
import { buildVideoOptions, downloadableVideoCount } from '../src/detector/video-options';
import type { MediaResource, StreamAnalysis } from '../src/types';

function item(p: Partial<MediaResource> & { id: string; url: string }): MediaResource {
  return {
    dedupKey: p.url.replace(/^https?:/, ''),
    type: 'video',
    format: 'mp4',
    sourcePage: 'https://site.com/',
    detectionMethod: 'network',
    detectionMethods: ['network'],
    isStream: false,
    isProtected: false,
    protection: 'none',
    detectedAt: 0,
    ...p,
  };
}

const dash: StreamAnalysis = {
  kind: 'dash',
  status: 'ok',
  protection: 'none',
  isLive: false,
  duration: 600,
  variants: [
    { id: 'v1080', kind: 'video', bandwidth: 4_000_000, qualityLabel: '1080p' },
    { id: 'v720', kind: 'video', bandwidth: 2_000_000, qualityLabel: '720p' },
  ],
  audioTracks: [{ id: 'a', kind: 'audio', bandwidth: 128_000 }],
  analyzedAt: 0,
};

describe('buildVideoOptions', () => {
  it('lists each stream quality with an estimated size, plus audio only', () => {
    const r = buildVideoOptions([item({ id: 's', url: 'https://a.com/m.mpd', type: 'dash', format: 'mpd', isStream: true, analysis: dash })]);
    expect(r.options.every((o) => o.source === undefined)).toBe(true);
    expect(r.options.map((o) => [o.label, o.quality, o.size])).toEqual([
      ['1080p', '1080p', (4_128_000 / 8) * 600],
      ['720p', '720p', (2_128_000 / 8) * 600],
      ['Audio only', 'audio', (128_000 / 8) * 600],
    ]);
    expect(r.options.every((o) => o.approximate)).toBe(true);
  });

  it('lists direct files with their exact size and puts the playing one first', () => {
    const r = buildVideoOptions(
      [
        item({ id: 'a', url: 'https://a.com/other.mp4', filename: 'other', size: 5_000_000, qualityLabel: '480p' }),
        item({ id: 'b', url: 'https://a.com/playing.mp4', filename: 'Holiday clip', size: 9_000_000 }),
      ],
      'https://a.com/playing.mp4',
    );
    expect(r.options.map((o) => [o.mediaId, o.label, o.size, o.approximate])).toEqual([
      ['b', 'Original', 9_000_000, false],
      ['a', '480p', 5_000_000, false],
    ]);
    expect(r.options.map((o) => o.source)).toEqual(['Holiday clip · playing', 'other']);
  });

  it('never invents a size', () => {
    const r = buildVideoOptions([item({ id: 'a', url: 'https://a.com/x.mp4' })]);
    expect(r.options[0]!.size).toBeUndefined();
  });

  it('skips audio files and explains why nothing is available', () => {
    expect(buildVideoOptions([item({ id: 'a', url: 'https://a.com/s.mp3', type: 'audio', format: 'mp3' })]).message).toMatch(/no downloadable source/);
    const prot = buildVideoOptions([item({ id: 'p', url: 'https://a.com/d.mpd', type: 'dash', isStream: true, isProtected: true })]);
    expect(prot.options).toEqual([]);
    expect(prot.message).toBe('Protected media — downloading is not supported.');
    const live = buildVideoOptions([item({ id: 'l', url: 'https://a.com/l.m3u8', type: 'hls', isStream: true, analysis: { ...dash, kind: 'hls', status: 'live', isLive: true } })]);
    expect(live.message).toMatch(/Live streams/);
  });

  it('counts downloadable videos for showing the button', () => {
    expect(
      downloadableVideoCount([
        item({ id: 'a', url: 'https://a.com/x.mp4' }),
        item({ id: 'b', url: 'https://a.com/s.mp3', type: 'audio' }),
        item({ id: 'c', url: 'https://a.com/d.mpd', type: 'dash', isProtected: true }),
      ]),
    ).toBe(1);
  });
});
