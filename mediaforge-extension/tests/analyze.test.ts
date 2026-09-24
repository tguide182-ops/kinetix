import { describe, expect, it, vi } from 'vitest';
import { analyzeStream, planDash, planHls } from '../src/detector/manifest/analyze';
import type { TextFetcher } from '../src/detector/manifest/fetch-text';
import { MediaForgeError } from '../src/utils/errors';
import { fixture } from './fixtures';

function fakeFetcher(files: Record<string, string>): TextFetcher & { calls: string[] } {
  const calls: string[] = [];
  const fn = (async (url: string) => {
    calls.push(url);
    const path = new URL(url).pathname;
    const hit = Object.entries(files).find(([k]) => path.endsWith(k));
    if (!hit) throw new MediaForgeError('NOT_FOUND', { status: 404 });
    return { text: hit[1], url, contentType: '' };
  }) as TextFetcher & { calls: string[] };
  fn.calls = calls;
  return fn;
}

const hlsFiles = {
  'master.m3u8': fixture('master.m3u8'),
  '1080p/prog.m3u8': fixture('media.m3u8'),
  '720p/prog.m3u8': fixture('media.m3u8'),
  '480p/prog.m3u8': fixture('media.m3u8'),
  '360p/prog.m3u8': fixture('media.m3u8'),
  'en/prog.m3u8': fixture('media.m3u8'),
  'de/prog.m3u8': fixture('media.m3u8'),
};

describe('analyzeStream (HLS)', () => {
  it('lists variants from best to worst and audio tracks', async () => {
    const f = fakeFetcher(hlsFiles);
    const { analysis } = await analyzeStream('hls', 'https://cdn.example.com/hls/master.m3u8', f);
    expect(analysis.status).toBe('ok');
    expect(analysis.variants.map((v) => v.qualityLabel)).toEqual(['1080p', '720p', '480p', '360p']);
    expect(analysis.audioTracks.map((a) => a.language)).toEqual(['en', 'de']);
    expect(analysis.duration).toBeCloseTo(21.021);
    // Only the master and the best variant were fetched (lazy, minimal requests).
    expect(f.calls).toHaveLength(2);
  });

  it('reports protected streams', async () => {
    const f = fakeFetcher({ 'x.m3u8': fixture('media-aes128.m3u8') });
    const { analysis } = await analyzeStream('hls', 'https://a.com/x.m3u8', f);
    expect(analysis.status).toBe('protected');
    expect(analysis.protection).toBe('encrypted');
  });

  it('reports live streams', async () => {
    const f = fakeFetcher({ 'live.m3u8': fixture('media-live.m3u8') });
    const { analysis } = await analyzeStream('hls', 'https://a.com/live.m3u8', f);
    expect(analysis.status).toBe('live');
  });

  it('reports network failures and invalid manifests without throwing', async () => {
    const netFail: TextFetcher = async () => {
      throw new TypeError('Failed to fetch');
    };
    expect((await analyzeStream('hls', 'https://a.com/x.m3u8', netFail)).analysis).toMatchObject({ status: 'error', errorCode: 'NETWORK' });
    const bad = fakeFetcher({ 'x.m3u8': fixture('invalid.m3u8') });
    expect((await analyzeStream('hls', 'https://a.com/x.m3u8', bad)).analysis.errorCode).toBe('MANIFEST_PARSE');
  });
});

describe('planHls', () => {
  it('plans the requested quality with the matching audio rendition', async () => {
    const f = fakeFetcher(hlsFiles);
    const { parsed } = await analyzeStream('hls', 'https://cdn.example.com/hls/master.m3u8', f);
    const plan = await planHls(parsed!, { quality: '720p', audioQuality: 'highest' }, f);
    expect(plan.tracks.map((t) => t.kind)).toEqual(['video', 'audio']);
    expect(plan.tracks[0]!.qualityLabel).toBe('720p');
    expect(plan.tracks[0]!.segments).toHaveLength(3);
    expect(plan.tracks[0]!.container).toBe('ts');
    expect(plan.tracks[0]!.estimatedBytes).toBeGreaterThan(0);
  });

  it('plans audio only', async () => {
    const f = fakeFetcher(hlsFiles);
    const { parsed } = await analyzeStream('hls', 'https://cdn.example.com/hls/master.m3u8', f);
    const plan = await planHls(parsed!, { quality: 'audio', audioQuality: 'highest' }, f);
    expect(plan.tracks).toHaveLength(1);
    expect(plan.tracks[0]!.kind).toBe('audio');
  });

  it('refuses encrypted playlists', async () => {
    const f = fakeFetcher({ 'x.m3u8': fixture('media-aes128.m3u8') });
    const { parsed } = await analyzeStream('hls', 'https://a.com/x.m3u8', f);
    await expect(planHls(parsed!, { quality: 'highest', audioQuality: 'highest' }, f)).rejects.toMatchObject({ code: 'PROTECTED' });
  });

  it('includes fMP4 init segments', async () => {
    const f = fakeFetcher({ 'index.m3u8': fixture('media-fmp4-byterange.m3u8') });
    const { parsed } = await analyzeStream('hls', 'https://a.com/v/index.m3u8', f);
    const plan = await planHls(parsed!, { quality: 'highest', audioQuality: 'highest' }, f);
    expect(plan.tracks[0]!.init).toEqual({ url: 'https://a.com/v/video.mp4', byteRange: { start: 0, end: 719 } });
    expect(plan.tracks[0]!.extension).toBe('mp4');
  });
});

describe('DASH analysis and planning', () => {
  it('plans separate video and audio tracks', async () => {
    const f = fakeFetcher({ 'manifest.mpd': fixture('manifest-template.mpd') });
    const { analysis, parsed } = await analyzeStream('dash', 'https://a.com/manifest.mpd', f);
    expect(analysis.variants.map((v) => v.qualityLabel)).toEqual(['1080p', '720p', '480p']);
    expect(analysis.audioTracks).toHaveLength(2);
    const plan = planDash(parsed!, { quality: '480p', audioQuality: 'lowest' });
    expect(plan.tracks.map((t) => [t.kind, t.qualityLabel ?? null])).toEqual([
      ['video', '480p'],
      ['audio', null],
    ]);
    expect(plan.tracks[1]!.segments[0]!.url).toContain('/audio/a64/');
    expect(plan.tracks[0]!.init?.url).toContain('v480/init.mp4');
  });

  it('refuses DRM and live manifests', async () => {
    const drm = fakeFetcher({ 'drm.mpd': fixture('manifest-drm.mpd') });
    const r = await analyzeStream('dash', 'https://a.com/drm.mpd', drm);
    expect(r.analysis.status).toBe('protected');
    expect(() => planDash(r.parsed!, { quality: 'highest', audioQuality: 'highest' })).toThrow(/Protected media/);
    const live = fakeFetcher({ 'live.mpd': fixture('manifest-live.mpd') });
    const l = await analyzeStream('dash', 'https://a.com/live.mpd', live);
    expect(l.analysis.status).toBe('live');
    expect(() => planDash(l.parsed!, { quality: 'highest', audioQuality: 'highest' })).toThrow(MediaForgeError);
  });

  it('never calls the fetcher more than needed', async () => {
    const f = vi.fn(fakeFetcher({ 'manifest.mpd': fixture('manifest-template.mpd') }));
    await analyzeStream('dash', 'https://a.com/manifest.mpd', f);
    expect(f).toHaveBeenCalledTimes(1);
  });
});
