import { describe, expect, it } from 'vitest';
import {
  hostMatchesDomain,
  isAcceptableMediaUrl,
  isHostInList,
  isSafeImageUrl,
  normalizeDomain,
  normalizeUrl,
  resolveUrl,
  stripTracking,
} from '../src/utils/url';

describe('normalizeUrl', () => {
  it('removes fragments, tracking params and default ports; lowercases host', () => {
    expect(normalizeUrl('https://CDN.Example.com:443/v/clip.mp4?utm_source=x&fbclid=1#t=10')).toBe('//cdn.example.com/v/clip.mp4');
  });

  it('treats http and https as the same resource', () => {
    expect(normalizeUrl('http://a.com/x.mp4')).toBe(normalizeUrl('https://a.com/x.mp4'));
  });

  it('sorts remaining params so order does not matter', () => {
    expect(normalizeUrl('https://a.com/x.mp4?b=2&a=1')).toBe(normalizeUrl('https://a.com/x.mp4?a=1&b=2'));
  });

  it('ignores volatile signing/expiry/byte-range params', () => {
    const a = normalizeUrl('https://a.com/x.mp4?id=5&Expires=1&Signature=abc&range=0-100');
    const b = normalizeUrl('https://a.com/x.mp4?id=5&Expires=2&Signature=def&range=100-200');
    expect(a).toBe(b);
  });

  it('keeps meaningful params and path case so different media stay distinct', () => {
    expect(normalizeUrl('https://a.com/x.mp4?id=5')).not.toBe(normalizeUrl('https://a.com/x.mp4?id=6'));
    expect(normalizeUrl('https://a.com/Clip.mp4')).not.toBe(normalizeUrl('https://a.com/clip.mp4'));
    expect(normalizeUrl('https://a.com:8080/x.mp4')).not.toBe(normalizeUrl('https://a.com/x.mp4'));
  });

  it('normalizes percent-encoding and duplicate slashes', () => {
    expect(normalizeUrl('https://a.com//v/%7Euser/a%20b.mp4')).toBe(normalizeUrl('https://a.com/v/~user/a b.mp4'));
  });

  it('passes blob URLs through unchanged', () => {
    expect(normalizeUrl('blob:https://a.com/1234-5678')).toBe('blob:https://a.com/1234-5678');
  });
});

describe('scheme safety', () => {
  it('rejects javascript:, data:, file: and chrome: URLs', () => {
    for (const u of ['javascript:alert(1)', 'data:video/mp4;base64,AAAA', 'file:///etc/passwd', 'chrome://settings', 'blob:null/abc', '']) {
      expect(isAcceptableMediaUrl(u)).toBe(false);
    }
    expect(isAcceptableMediaUrl('https://a.com/x.mp4')).toBe(true);
    expect(isAcceptableMediaUrl('blob:https://a.com/uuid')).toBe(true);
  });

  it('resolveUrl refuses non-http results', () => {
    expect(resolveUrl('javascript:alert(1)', 'https://a.com/')).toBeNull();
    expect(resolveUrl('seg.ts', 'https://a.com/hls/index.m3u8')).toBe('https://a.com/hls/seg.ts');
  });

  it('only allows http(s) and raster data: images as posters', () => {
    expect(isSafeImageUrl('https://a.com/p.jpg')).toBe(true);
    expect(isSafeImageUrl('data:image/png;base64,AAAA')).toBe(true);
    expect(isSafeImageUrl('data:image/svg+xml;base64,AAAA')).toBe(false);
    expect(isSafeImageUrl('javascript:1')).toBe(false);
  });
});

describe('stripTracking', () => {
  it('keeps functional params', () => {
    expect(stripTracking('https://a.com/x.mp4?token=1&utm_medium=y#frag')).toBe('https://a.com/x.mp4?token=1');
  });
});

describe('domains', () => {
  it('normalizes user input', () => {
    expect(normalizeDomain(' https://WWW.Example.com/path ')).toBe('example.com');
    expect(normalizeDomain('sub.example.co.uk')).toBe('sub.example.co.uk');
    expect(normalizeDomain('not a domain')).toBeNull();
    expect(normalizeDomain('')).toBeNull();
  });

  it('matches subdomains but not look-alikes', () => {
    expect(hostMatchesDomain('video.example.com', 'example.com')).toBe(true);
    expect(hostMatchesDomain('www.example.com', 'example.com')).toBe(true);
    expect(hostMatchesDomain('badexample.com', 'example.com')).toBe(false);
    expect(isHostInList('https://m.example.com/x', ['example.com'])).toBe(true);
    expect(isHostInList(undefined, ['example.com'])).toBe(false);
  });
});
