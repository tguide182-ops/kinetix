import { describe, expect, it } from 'vitest';
import { candidateFromResponse, sizeFromHeaders } from '../src/background/network-observer';
import { HOOK_TAG, parseHookMessage } from '../src/content/hook-protocol';

type Details = chrome.webRequest.OnHeadersReceivedDetails;
const details = (url: string, headers: Record<string, string>, extra: Partial<Details> = {}): Details =>
  ({
    url,
    method: 'GET',
    tabId: 3,
    statusCode: 200,
    type: 'media',
    responseHeaders: Object.entries(headers).map(([name, value]) => ({ name, value })),
    ...extra,
  }) as Details;

describe('network observer', () => {
  it('detects media by Content-Type and records size', () => {
    expect(candidateFromResponse(details('https://a.com/stream?id=1', { 'Content-Type': 'video/mp4', 'Content-Length': '5000000' }))).toEqual({
      url: 'https://a.com/stream?id=1',
      method: 'network',
      mimeType: 'video/mp4',
      size: 5_000_000,
    });
  });

  it('reads the total size from Content-Range on 206 responses', () => {
    expect(sizeFromHeaders([{ name: 'content-range', value: 'bytes 0-1023/52428800' }], 206)).toBe(52_428_800);
    expect(sizeFromHeaders([{ name: 'content-length', value: '1024' }], 206)).toBeUndefined();
  });

  it('detects manifests even when small', () => {
    expect(candidateFromResponse(details('https://a.com/p/master.m3u8', { 'content-type': 'application/vnd.apple.mpegurl', 'content-length': '300' }))?.url).toBe(
      'https://a.com/p/master.m3u8',
    );
  });

  it('ignores segments, tiny beacons, errors, non-GET and non-tab requests', () => {
    expect(candidateFromResponse(details('https://a.com/seg1.ts', { 'content-type': 'video/mp2t' }))).toBeNull();
    expect(candidateFromResponse(details('https://a.com/px.mp4', { 'content-type': 'video/mp4', 'content-length': '200' }))).toBeNull();
    expect(candidateFromResponse(details('https://a.com/x.mp4', { 'content-type': 'video/mp4' }, { statusCode: 403 }))).toBeNull();
    expect(candidateFromResponse(details('https://a.com/x.mp4', {}, { method: 'POST' }))).toBeNull();
    expect(candidateFromResponse(details('https://a.com/x.mp4', {}, { tabId: -1 }))).toBeNull();
    expect(candidateFromResponse(details('https://a.com/page', { 'content-type': 'text/html' }))).toBeNull();
  });
});

describe('hook message validation', () => {
  it('accepts well-formed messages', () => {
    expect(parseHookMessage({ [HOOK_TAG]: 1, kind: 'request', via: 'fetch', url: 'https://a.com/x.m3u8', mime: 'application/x-mpegurl' })).toMatchObject({ kind: 'request' });
    expect(parseHookMessage({ [HOOK_TAG]: 1, kind: 'nav' })).toMatchObject({ kind: 'nav' });
  });

  it('rejects forged or malformed page messages', () => {
    expect(parseHookMessage(null)).toBeNull();
    expect(parseHookMessage('string')).toBeNull();
    expect(parseHookMessage({ kind: 'nav' })).toBeNull();
    expect(parseHookMessage({ [HOOK_TAG]: 1, kind: 'request', via: 'evil', url: 'x' })).toBeNull();
    expect(parseHookMessage({ [HOOK_TAG]: 1, kind: 'request', via: 'fetch', url: 'x'.repeat(10_000) })).toBeNull();
    expect(parseHookMessage({ [HOOK_TAG]: 1, kind: 'blob', url: 'blob:x', mime: 'video/mp4', size: '5' })).toBeNull();
    expect(parseHookMessage({ [HOOK_TAG]: 1, kind: 'unknown' })).toBeNull();
    // Extra properties are dropped, not passed through.
    expect(parseHookMessage({ [HOOK_TAG]: 1, kind: 'eme', extra: 'x' })).toEqual({ [HOOK_TAG]: 1, kind: 'eme' });
  });
});
