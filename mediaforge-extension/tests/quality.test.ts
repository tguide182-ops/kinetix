import { describe, expect, it } from 'vitest';
import { displayQuality, qualityFromText, qualityLabel, selectAudioVariant, selectVideoVariant } from '../src/utils/quality';
import type { VideoVariant } from '../src/types';

describe('qualityLabel', () => {
  it.each([
    [3840, 2160, '2160p'],
    [2560, 1440, '1440p'],
    [1920, 1080, '1080p'],
    [1280, 720, '720p'],
    [854, 480, '480p'],
    [640, 360, '360p'],
    [426, 240, '240p'],
    [1920, 800, '1080p'], // letterboxed cinema
    [1080, 1920, '1080p'], // portrait
    [1440, 1080, '1080p'], // 4:3
    [1280, 696, '720p'], // slightly cropped
  ])('%ix%i → %s', (w, h, label) => {
    expect(qualityLabel(w, h)).toBe(label);
  });

  it('never invents a value', () => {
    expect(qualityLabel(undefined, undefined)).toBeUndefined();
    expect(qualityLabel(0, 0)).toBeUndefined();
    expect(qualityLabel(NaN, 720)).toBe('720p');
    expect(qualityLabel(100, 60)).toBeUndefined();
    expect(displayQuality(undefined)).toBe('Unknown quality');
  });

  it('reads explicit quality tokens from text', () => {
    expect(qualityFromText('clip_720p')).toBe('720p');
    expect(qualityFromText('movie.4K.HDR')).toBe('2160p');
    expect(qualityFromText('track1080')).toBeUndefined();
  });
});

const v = (id: string, height: number, bandwidth: number): VideoVariant => ({ id, kind: 'video', height, bandwidth, qualityLabel: `${height}p` });

describe('variant selection', () => {
  const variants = [v('a', 360, 1), v('b', 1080, 5), v('c', 720, 3), v('d', 480, 2)];

  it('picks highest for auto/highest', () => {
    expect(selectVideoVariant(variants, 'highest')?.id).toBe('b');
    expect(selectVideoVariant(variants, 'auto')?.id).toBe('b');
  });

  it('picks exact matches, then the best lower one, then the lowest', () => {
    expect(selectVideoVariant(variants, '720p')?.id).toBe('c');
    expect(selectVideoVariant([v('a', 360, 1), v('b', 1080, 5)], '720p')?.id).toBe('a');
    expect(selectVideoVariant([v('b', 1080, 5), v('x', 1440, 9)], '720p')?.id).toBe('b');
  });

  it('selects audio by preference and language', () => {
    const audio: VideoVariant[] = [
      { id: 'hi', kind: 'audio', bandwidth: 256, language: 'en' },
      { id: 'mid', kind: 'audio', bandwidth: 128, language: 'en' },
      { id: 'lo', kind: 'audio', bandwidth: 64, language: 'en' },
      { id: 'de', kind: 'audio', bandwidth: 512, language: 'de' },
    ];
    expect(selectAudioVariant(audio, 'highest')?.id).toBe('de');
    expect(selectAudioVariant(audio, 'highest', 'en')?.id).toBe('hi');
    expect(selectAudioVariant(audio, 'lowest', 'en')?.id).toBe('lo');
    expect(selectAudioVariant(audio, 'balanced', 'en')?.id).toBe('mid');
    expect(selectAudioVariant([], 'highest')).toBeUndefined();
  });
});
