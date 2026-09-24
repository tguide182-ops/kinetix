import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

export function fixture(name: string): string {
  return readFileSync(join(here, name), 'utf8');
}

/** Minimal valid-looking file headers used by the container sniffing tests. */
export const MP4_HEADER = new Uint8Array([0, 0, 0, 0x20, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d, 0, 0, 2, 0]); // ....ftypisom
export const WEBM_HEADER = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x86, 0x81, 0x01]);
export const TS_PACKETS = (() => {
  const b = new Uint8Array(188 * 3);
  b[0] = 0x47;
  b[188] = 0x47;
  b[376] = 0x47;
  return b;
})();
export const MP3_ID3_HEADER = new Uint8Array([0x49, 0x44, 0x33, 3, 0, 0, 0, 0, 0, 0]);
export const HTML_ERROR_PAGE = new TextEncoder().encode('<!DOCTYPE html><html><body>403 Forbidden</body></html>');
