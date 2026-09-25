import { describe, expect, it } from 'vitest';
import { candidateToResource, MediaCollection } from '../src/detector/collection';
import type { MediaCandidate, StreamAnalysis } from '../src/types';

const ctx = { pageUrl: 'https://site.com/watch', pageTitle: 'Page' };

describe('candidateToResource', () => {
  it('rejects unsafe or non-media URLs and segments', () => {
    expect(candidateToResource({ url: 'javascript:alert(1)//.mp4', method: 'dom' }, ctx)).toBeNull();
    expect(candidateToResource({ url: 'https://a.com/app.js', method: 'network', mimeType: 'text/javascript' }, ctx)).toBeNull();
    expect(candidateToResource({ url: 'https://a.com/seg-12.ts', method: 'network' }, ctx)).toBeNull();
  });

  it('strips tracking params and sanitizes metadata', () => {
    const r = candidateToResource(
      { url: 'https://a.com/clip.mp4?utm_source=x', method: 'dom', title: ' My\u0000 <b>clip</b> ', width: 1280, height: 720, size: -5 },
      ctx,
    )!;
    expect(r.url).toBe('https://a.com/clip.mp4');
    expect(r.title).toBe('My <b>clip</b>'); // kept as text; rendered via textContent
    expect(r.qualityLabel).toBe('720p');
    expect(r.size).toBeUndefined();
  });

  it('drops unsafe poster URLs', () => {
    const r = candidateToResource({ url: 'https://a.com/clip.mp4', method: 'dom', posterUrl: 'javascript:alert(1)' }, ctx)!;
    expect(r.posterUrl).toBeUndefined();
  });
});

describe('MediaCollection deduplication', () => {
  it('merges the same resource seen by several detectors', () => {
    const c = new MediaCollection();
    const cands: MediaCandidate[] = [
      { url: 'https://cdn.a.com/v/clip.mp4?Expires=1&Signature=a', method: 'network', mimeType: 'video/mp4', size: 100_000 },
      { url: 'http://CDN.a.com/v/clip.mp4?Expires=2&Signature=b#t=5', method: 'dom', title: 'Clip', width: 1920, height: 1080 },
      { url: 'https://cdn.a.com/v/clip.mp4?utm_campaign=z', method: 'performance' },
    ];
    const res = c.addCandidates(cands, ctx);
    expect(res.added).toHaveLength(1);
    expect(c.size).toBe(1);
    const item = c.list()[0]!;
    expect(item.detectionMethods.sort()).toEqual(['dom', 'network', 'performance']);
    expect(item).toMatchObject({ title: 'Clip', size: 100_000, qualityLabel: '1080p' });
  });

  it('does not merge genuinely different media', () => {
    const c = new MediaCollection();
    c.addCandidates(
      [
        { url: 'https://a.com/v/clip.mp4?id=1', method: 'network' },
        { url: 'https://a.com/v/clip.mp4?id=2', method: 'network' },
        { url: 'https://a.com/v/Clip.mp4', method: 'network' },
        { url: 'https://b.com/v/clip.mp4', method: 'network' },
      ],
      ctx,
    );
    expect(c.size).toBe(4);
  });

  it('drops interface sounds and beacons once their small size is known', () => {
    const c = new MediaCollection();
    // Seen first without a size (e.g. Resource Timing on a cross-origin file)...
    c.addCandidates([{ url: 'https://www.gstatic.com/sounds/success.mp3', method: 'performance' }], ctx);
    expect(c.size).toBe(1);
    // ...then the network observer reports 12 KB: it is removed and stays hidden.
    const r = c.addCandidates([{ url: 'https://www.gstatic.com/sounds/success.mp3', method: 'network', size: 12_000 }], ctx);
    expect(r.updated).toHaveLength(1);
    expect(c.size).toBe(0);
    c.addCandidates([{ url: 'https://www.gstatic.com/sounds/success.mp3', method: 'dom' }], ctx);
    expect(c.size).toBe(0);
    // Streams are never dropped for being small (manifests are tiny).
    c.addCandidates([{ url: 'https://a.com/master.m3u8', method: 'network', size: 400 }], ctx);
    expect(c.size).toBe(1);
  });

  it('reports no change for identical re-detections', () => {
    const c = new MediaCollection();
    c.addCandidates([{ url: 'https://a.com/a.mp3', method: 'network' }], ctx, 1);
    const again = c.addCandidates([{ url: 'https://a.com/a.mp3', method: 'network' }], ctx, 2);
    expect(again.added).toHaveLength(0);
    expect(again.updated).toHaveLength(0);
  });

  it('hides variant playlists once a master playlist is analysed', () => {
    const c = new MediaCollection();
    c.addCandidates(
      [
        { url: 'https://a.com/hls/master.m3u8', method: 'network' },
        { url: 'https://a.com/hls/720p/prog.m3u8', method: 'network' },
      ],
      ctx,
    );
    const master = c.findByUrl('https://a.com/hls/master.m3u8')!;
    const analysis: StreamAnalysis = {
      kind: 'hls',
      status: 'ok',
      protection: 'none',
      isLive: false,
      variants: [{ id: 'v0', kind: 'video', url: 'https://a.com/hls/720p/prog.m3u8', height: 720, width: 1280, qualityLabel: '720p' }],
      audioTracks: [],
      analyzedAt: 0,
    };
    c.setAnalysis(master.id, analysis);
    expect(c.size).toBe(1);
    expect(c.list()[0]!.qualityLabel).toBe('720p');
    c.addCandidates([{ url: 'https://a.com/hls/720p/prog.m3u8', method: 'xhr' }], ctx);
    expect(c.size).toBe(1);
  });

  it('marks protected streams from analysis', () => {
    const c = new MediaCollection();
    c.addCandidates([{ url: 'https://a.com/x.mpd', method: 'network' }], ctx);
    const it0 = c.list()[0]!;
    c.setAnalysis(it0.id, { kind: 'dash', status: 'protected', protection: 'drm', isLive: false, variants: [], audioTracks: [], analyzedAt: 0 });
    expect(c.get(it0.id)).toMatchObject({ isProtected: true, protection: 'drm' });
  });

  it('clears stale items on SPA navigation but keeps very recent ones', () => {
    const c = new MediaCollection();
    c.addCandidates([{ url: 'https://a.com/old.mp4', method: 'network' }], ctx, 1000);
    c.addCandidates([{ url: 'https://a.com/new.mp4', method: 'network' }], ctx, 5000);
    c.clear(4000);
    expect(c.list().map((i) => i.url)).toEqual(['https://a.com/new.mp4']);
  });

  it('round-trips through JSON snapshots', () => {
    const c = new MediaCollection();
    c.addCandidates([{ url: 'https://a.com/a.webm', method: 'dom' }], ctx);
    const copy = new MediaCollection(JSON.parse(JSON.stringify(c.toJSON())));
    expect(copy.list()).toEqual(c.list());
  });

  it('sorts streams and higher quality first', () => {
    const c = new MediaCollection();
    c.addCandidates(
      [
        { url: 'https://a.com/a.mp3', method: 'network' },
        { url: 'https://a.com/low.mp4', method: 'dom', height: 360, width: 640 },
        { url: 'https://a.com/m.m3u8', method: 'network' },
        { url: 'https://a.com/hi.mp4', method: 'dom', height: 1080, width: 1920 },
      ],
      ctx,
    );
    expect(c.list().map((i) => i.url.split('/').pop())).toEqual(['m.m3u8', 'hi.mp4', 'low.mp4', 'a.mp3']);
  });
});
