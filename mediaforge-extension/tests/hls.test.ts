import { describe, expect, it } from 'vitest';
import { hlsProtection, hlsSegmentContainer, parseAttributes, parseM3u8, type HlsMasterPlaylist, type HlsMediaPlaylist } from '../src/detector/manifest/hls';
import { MediaForgeError } from '../src/utils/errors';
import { fixture } from './fixtures';

const BASE = 'https://cdn.example.com/hls/master.m3u8';

describe('parseAttributes', () => {
  it('handles quoted values containing commas', () => {
    expect(parseAttributes('BANDWIDTH=1,CODECS="avc1.64001f,mp4a.40.2",RESOLUTION=1280x720')).toEqual({
      BANDWIDTH: '1',
      CODECS: 'avc1.64001f,mp4a.40.2',
      RESOLUTION: '1280x720',
    });
  });
});

describe('HLS master playlist', () => {
  const pl = parseM3u8(fixture('master.m3u8'), BASE) as HlsMasterPlaylist;

  it('is identified as master', () => {
    expect(pl.type).toBe('master');
  });

  it('extracts variants with resolution, bandwidth, codecs, frame rate and audio group', () => {
    expect(pl.variants).toHaveLength(4);
    const hd = pl.variants.find((v) => v.height === 1080)!;
    expect(hd).toMatchObject({ width: 1920, bandwidth: 5_000_000, frameRate: 30, codecs: 'avc1.640028,mp4a.40.2', audioGroup: 'aac', qualityLabel: '1080p' });
    expect(pl.variants.map((v) => v.qualityLabel).sort()).toEqual(['1080p', '360p', '480p', '720p']);
  });

  it('resolves relative and absolute variant URIs and keeps their query', () => {
    expect(pl.variants.find((v) => v.height === 360)!.uri).toBe('https://cdn.example.com/hls/360p/prog.m3u8');
    expect(pl.variants.find((v) => v.height === 1080)!.uri).toBe('https://cdn.example.com/hls/1080p/prog.m3u8?session=abc');
    expect(pl.variants.find((v) => v.height === 720)!.uri).toBe('https://cdn.example.com/hls/720p/prog.m3u8');
  });

  it('extracts audio renditions and skips I-frame playlists', () => {
    expect(pl.renditions).toHaveLength(2);
    expect(pl.renditions[0]).toMatchObject({ type: 'AUDIO', groupId: 'aac', language: 'en', isDefault: true, uri: 'https://cdn.example.com/hls/audio/en/prog.m3u8' });
    expect(pl.variants.some((v) => v.uri.includes('iframe'))).toBe(false);
  });

  it('is unprotected', () => {
    expect(hlsProtection(pl.sessionKeys)).toBe('none');
  });
});

describe('HLS media playlist', () => {
  it('parses TS segments, durations and ENDLIST', () => {
    const pl = parseM3u8(fixture('media.m3u8'), 'https://a.com/v/index.m3u8') as HlsMediaPlaylist;
    expect(pl.type).toBe('media');
    expect(pl.endList).toBe(true);
    expect(pl.targetDuration).toBe(10);
    expect(pl.segments.map((s) => s.uri)).toEqual(['https://a.com/v/segment0.ts', 'https://a.com/v/segment1.ts', 'https://other.example.com/segment2.ts?x=1']);
    expect(pl.segments[2]!.discontinuity).toBe(true);
    expect(pl.totalDuration).toBeCloseTo(21.021, 3);
    expect(hlsSegmentContainer(pl)).toBe('ts');
    expect(hlsProtection(pl.keys)).toBe('none');
  });

  it('parses fMP4 init maps and chained byte ranges', () => {
    const pl = parseM3u8(fixture('media-fmp4-byterange.m3u8'), 'https://a.com/v/index.m3u8') as HlsMediaPlaylist;
    expect(hlsSegmentContainer(pl)).toBe('fmp4');
    expect(pl.segments[0]!.map).toEqual({ uri: 'https://a.com/v/video.mp4', byteRange: { start: 0, end: 719 } });
    expect(pl.segments.map((s) => s.byteRange)).toEqual([
      { start: 720, end: 100719 },
      { start: 100720, end: 220719 },
      { start: 220720, end: 270719 },
    ]);
  });

  it('flags live playlists (no ENDLIST)', () => {
    const pl = parseM3u8(fixture('media-live.m3u8'), 'https://a.com/live.m3u8') as HlsMediaPlaylist;
    expect(pl.endList).toBe(false);
    expect(pl.mediaSequence).toBe(1043);
  });
});

describe('HLS protection detection', () => {
  it('AES-128 is reported as encrypted (unsupported, never decrypted)', () => {
    const pl = parseM3u8(fixture('media-aes128.m3u8'), 'https://a.com/x.m3u8') as HlsMediaPlaylist;
    expect(hlsProtection(pl.keys)).toBe('encrypted');
    expect(pl.segments[0]!.key?.method).toBe('AES-128');
  });

  it('FairPlay SAMPLE-AES is DRM', () => {
    const pl = parseM3u8(fixture('media-fairplay.m3u8'), 'https://a.com/x.m3u8') as HlsMediaPlaylist;
    expect(hlsProtection(pl.keys)).toBe('drm');
  });

  it('Widevine session keys in a master playlist are DRM', () => {
    const pl = parseM3u8(fixture('master-widevine-session.m3u8'), 'https://a.com/x.m3u8') as HlsMasterPlaylist;
    expect(hlsProtection(pl.sessionKeys)).toBe('drm');
  });

  it('METHOD=NONE is not protection', () => {
    expect(hlsProtection([{ method: 'NONE' }])).toBe('none');
  });
});

describe('invalid HLS', () => {
  it('rejects documents without #EXTM3U', () => {
    expect(() => parseM3u8(fixture('invalid.m3u8'), BASE)).toThrow(MediaForgeError);
    try {
      parseM3u8('', BASE);
    } catch (e) {
      expect((e as MediaForgeError).code).toBe('MANIFEST_PARSE');
    }
  });

  it('rejects master playlists pointing to javascript: URIs', () => {
    expect(() => parseM3u8('#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1\njavascript:alert(1)\n', BASE)).toThrow(MediaForgeError);
  });
});
