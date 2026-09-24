import { describe, expect, it } from 'vitest';
import { fillTemplate, parseIsoDuration, parseMpd } from '../src/detector/manifest/dash';
import { parseXml, XmlParseError } from '../src/detector/manifest/xml';
import { MediaForgeError } from '../src/utils/errors';
import { fixture } from './fixtures';

describe('xml parser', () => {
  it('parses attributes, entities, CDATA and strips namespace prefixes', () => {
    const doc = parseXml('<?xml version="1.0"?><a x="1 &amp; 2"><cenc:b y=\'q\'>t&lt;<![CDATA[<raw>]]></cenc:b><c/></a>');
    const a = doc.children[0]!;
    expect(a.attrs.x).toBe('1 & 2');
    expect(a.children[0]).toMatchObject({ name: 'b', attrs: { y: 'q' }, text: 't<<raw>' });
    expect(a.children[1]!.name).toBe('c');
  });

  it('rejects malformed documents and DTD internal subsets', () => {
    expect(() => parseXml('<a><b></a>')).toThrow(XmlParseError);
    expect(() => parseXml('<a>')).toThrow(XmlParseError);
    expect(() => parseXml('<!DOCTYPE x [<!ENTITY a "b">]><x/>')).toThrow(XmlParseError);
    expect(() => parseXml('')).toThrow(XmlParseError);
  });
});

describe('DASH helpers', () => {
  it('parses ISO-8601 durations', () => {
    expect(parseIsoDuration('PT0H0M30.000S')).toBe(30);
    expect(parseIsoDuration('PT1H2M3.5S')).toBe(3723.5);
    expect(parseIsoDuration('P1DT1S')).toBe(86401);
    expect(parseIsoDuration('garbage')).toBeUndefined();
  });

  it('fills SegmentTemplate identifiers with width formatting', () => {
    expect(fillTemplate('$RepresentationID$/$Number%05d$-$Bandwidth$-$Time$$$.m4s', { RepresentationID: 'v1', Number: 7, Bandwidth: 800, Time: 9000 })).toBe(
      'v1/00007-800-9000$.m4s',
    );
  });
});

describe('DASH SegmentTemplate manifest', () => {
  const m = parseMpd(fixture('manifest-template.mpd'), 'https://site.example.com/player/manifest.mpd');
  const video = m.periods[0]!.adaptationSets[0]!;
  const audio = m.periods[0]!.adaptationSets[1]!;

  it('reads MPD, Period and AdaptationSet metadata', () => {
    expect(m.type).toBe('static');
    expect(m.duration).toBe(30);
    expect(m.protection).toBe('none');
    expect(video.contentType).toBe('video');
    expect(audio).toMatchObject({ contentType: 'audio', lang: 'en', label: 'English & Commentary' });
  });

  it('reads Representation resolution, bitrate, codecs and frame rate', () => {
    expect(video.representations.map((r) => r.qualityLabel)).toEqual(['1080p', '720p', '480p']);
    expect(video.representations[0]).toMatchObject({ id: 'v1080', bandwidth: 4_500_000, codecs: 'avc1.640028', frameRate: 29.97 });
  });

  it('expands duration-based templates across the period using BaseURL', () => {
    const r = video.representations[1]!;
    expect(r.init?.url).toBe('https://media.example.com/vod/v720/init.mp4');
    expect(r.segments).toHaveLength(8); // ceil(30 / 4)
    expect(r.segments[0]!.url).toBe('https://media.example.com/vod/v720/seg-00001.m4s');
    expect(r.segments[7]!.url).toBe('https://media.example.com/vod/v720/seg-00008.m4s');
  });

  it('expands SegmentTimeline with repeats using $Time$', () => {
    const r = audio.representations[0]!;
    expect(r.segments).toHaveLength(8);
    expect(r.segments[0]!.url).toBe('https://media.example.com/vod/audio/a128/0.m4s');
    expect(r.segments[1]!.url).toBe('https://media.example.com/vod/audio/a128/192000.m4s');
    expect(r.segments[7]!.url).toBe('https://media.example.com/vod/audio/a128/1344000.m4s');
    expect(r.segments.reduce((s, x) => s + (x.duration ?? 0), 0)).toBeCloseTo(30);
  });
});

describe('DASH SegmentList / SegmentBase manifest', () => {
  const m = parseMpd(fixture('manifest-list.mpd'), 'https://a.com/content/stream.mpd');
  it('handles SegmentList with Initialization and mediaRange', () => {
    const r = m.periods[0]!.adaptationSets[0]!.representations[0]!;
    expect(r.init).toEqual({ url: 'https://a.com/content/video/init.mp4', byteRange: { start: 0, end: 499 } });
    expect(r.segments).toEqual([
      { url: 'https://a.com/content/video/s1.m4s', duration: 4 },
      { url: 'https://a.com/content/video/s2.m4s', byteRange: { start: 500, end: 999 }, duration: 4 },
    ]);
  });
  it('treats SegmentBase representations as single files', () => {
    const r = m.periods[0]!.adaptationSets[1]!.representations[0]!;
    expect(r.singleFile).toBe(true);
    expect(r.segments).toEqual([{ url: 'https://a.com/content/audio.mp4' }]);
    expect(m.periods[0]!.adaptationSets[1]!.contentType).toBe('audio');
  });
});

describe('DASH protection, live and invalid manifests', () => {
  it('detects ContentProtection as DRM', () => {
    const m = parseMpd(fixture('manifest-drm.mpd'), 'https://a.com/drm.mpd');
    expect(m.protection).toBe('drm');
    expect(m.periods[0]!.adaptationSets[0]!.isProtected).toBe(true);
  });

  it('detects dynamic (live) manifests and does not expand segments', () => {
    const m = parseMpd(fixture('manifest-live.mpd'), 'https://a.com/live.mpd');
    expect(m.type).toBe('dynamic');
    expect(m.periods[0]!.adaptationSets[0]!.representations[0]!.segments).toHaveLength(0);
  });

  it('reports malformed XML as a manifest parse error', () => {
    expect(() => parseMpd(fixture('invalid.mpd'), 'https://a.com/x.mpd')).toThrow(MediaForgeError);
    expect(() => parseMpd('<html></html>', 'https://a.com/x.mpd')).toThrow(/Manifest could not be parsed/);
  });
});
