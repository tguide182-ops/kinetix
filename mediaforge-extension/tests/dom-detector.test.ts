// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { candidatesFromPerformance, findPoster, scanRoot, type BlobRegistry } from '../src/content/dom-detector';

const registry = (): BlobRegistry => ({ blobs: new Map(), mse: new Set() });

function setBody(html: string): void {
  // Test fixture markup only (trusted); the extension itself never uses innerHTML.
  document.body.innerHTML = html;
}

describe('DOM detection', () => {
  it('finds <video src>, <source> children and media links, resolving relative URLs', () => {
    setBody(`
      <video src="/v/clip.mp4" poster="/p.jpg" title="My Clip"></video>
      <video><source src="movie.webm" type="video/webm"><source src="movie.mp4" type="video/mp4"></video>
      <audio src="https://cdn.example.com/a/song.mp3"></audio>
      <a href="/files/talk.m4a" download="Talk">Download talk</a>
      <a href="/about.html">About</a>`);
    const c = scanRoot(document, registry());
    const urls = c.map((x) => x.url.replace(location.origin, ''));
    expect(urls).toEqual(expect.arrayContaining(['/v/clip.mp4', '/movie.webm', '/movie.mp4', 'https://cdn.example.com/a/song.mp3', '/files/talk.m4a']));
    expect(urls).not.toContain('/about.html');
    const clip = c.find((x) => x.url.endsWith('/v/clip.mp4'))!;
    expect(clip).toMatchObject({ method: 'dom', element: 'video', title: 'My Clip' });
    expect(clip.posterUrl).toMatch(/\/p\.jpg$/);
    expect(c.find((x) => x.url.endsWith('movie.webm'))).toMatchObject({ element: 'video', mimeType: 'video/webm' });
    expect(c.find((x) => x.url.endsWith('talk.m4a'))!.title).toBe('Talk');
  });

  it('ignores javascript: and data: sources', () => {
    setBody(`<video src="javascript:alert(1)"></video><a href="javascript:void('.mp4')">x.mp4</a><video src="data:video/mp4;base64,AAAA"></video>`);
    expect(scanRoot(document, registry())).toEqual([]);
  });

  it('only reports blob: media known to be Blob-backed (not MediaSource)', () => {
    const reg = registry();
    reg.blobs.set('blob:http://localhost:3000/aaa', { mime: 'video/mp4', size: 1234 });
    reg.mse.add('blob:http://localhost:3000/bbb');
    setBody(`<video src="blob:http://localhost:3000/aaa"></video><video src="blob:http://localhost:3000/bbb"></video>`);
    const c = scanRoot(document, reg);
    expect(c).toHaveLength(1);
    expect(c[0]).toMatchObject({ method: 'blob', blobSize: 1234, mimeType: 'video/mp4' });
  });

  it('keeps untrusted titles as plain data (no markup interpretation)', () => {
    setBody(`<video src="/x.mp4" title="<img src=x onerror=alert(1)>"></video>`);
    expect(scanRoot(document, registry())[0]!.title).toBe('<img src=x onerror=alert(1)>');
  });

  it('scans a single inserted subtree', () => {
    setBody('<div id="host"></div>');
    const div = document.createElement('div');
    const v = document.createElement('video');
    v.src = '/late.mp4';
    div.append(v);
    document.getElementById('host')!.append(div);
    expect(scanRoot(div, registry()).map((x) => x.url)).toEqual([`${location.origin}/late.mp4`]);
  });

  it('finds a poster hint', () => {
    setBody('<video poster="/thumb.jpg"></video>');
    expect(findPoster(document)).toBe(`${location.origin}/thumb.jpg`);
  });
});

describe('performance entries', () => {
  const entry = (name: string, extra: Record<string, unknown> = {}): PerformanceEntry =>
    ({ name, entryType: 'resource', initiatorType: 'fetch', decodedBodySize: 0, startTime: 0, ...extra }) as unknown as PerformanceEntry;

  it('keeps media, drops segments and non-media', () => {
    const c = candidatesFromPerformance([
      entry('https://a.com/master.m3u8'),
      entry('https://a.com/seg-1.ts'),
      entry('https://a.com/app.js'),
      entry('https://a.com/x', { contentType: 'video/mp4', decodedBodySize: 5000 }),
    ]);
    expect(c.map((x) => x.url)).toEqual(['https://a.com/master.m3u8', 'https://a.com/x']);
    expect(c[1]).toMatchObject({ method: 'performance', mimeType: 'video/mp4', size: 5000 });
  });
});
