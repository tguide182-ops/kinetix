// Procedurally renders the MediaForge icon (rounded gradient tile with a
// download arrow) to PNG, so no binary assets need to be committed.
import { deflateSync, crc32 } from 'node:zlib';

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function inRoundedRect(x, y, size, r) {
  const cx = Math.min(Math.max(x, r), size - r);
  const cy = Math.min(Math.max(y, r), size - r);
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
}

function inArrow(x, y, s) {
  // Coordinates normalized to a 0..1 tile.
  const u = x / s;
  const v = y / s;
  const stem = u >= 0.43 && u <= 0.57 && v >= 0.2 && v <= 0.52;
  // Arrow head: triangle with apex at (0.5, 0.7), base from (0.27, 0.46) to (0.73, 0.46).
  const head = v >= 0.46 && v <= 0.7 && Math.abs(u - 0.5) <= ((0.7 - v) / 0.24) * 0.23;
  const bar = u >= 0.25 && u <= 0.75 && v >= 0.76 && v <= 0.84;
  return stem || head || bar;
}

export function renderIcon(size) {
  const ss = 4; // supersampling factor per axis
  const px = new Uint8Array(size * size * 4);
  const radius = size * 0.22;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let tile = 0;
      let glyph = 0;
      for (let sy = 0; sy < ss; sy++) {
        for (let sx = 0; sx < ss; sx++) {
          const fx = x + (sx + 0.5) / ss;
          const fy = y + (sy + 0.5) / ss;
          if (inRoundedRect(fx, fy, size, radius)) {
            tile++;
            if (inArrow(fx, fy, size)) glyph++;
          }
        }
      }
      const n = ss * ss;
      const t = (x + y) / (2 * size);
      // Gradient #7b6bff → #4b3bd6
      let r = lerp(0x7b, 0x4b, t);
      let g = lerp(0x6b, 0x3b, t);
      let b = lerp(0xff, 0xd6, t);
      const gw = tile ? glyph / tile : 0;
      r = lerp(r, 255, gw);
      g = lerp(g, 255, gw);
      b = lerp(b, 255, gw);
      const i = (y * size + x) * 4;
      px[i] = Math.round(r);
      px[i + 1] = Math.round(g);
      px[i + 2] = Math.round(b);
      px[i + 3] = Math.round((tile / n) * 255);
    }
  }
  return encodePng(size, size, px);
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td) >>> 0);
  return Buffer.concat([len, td, crc]);
}

function encodePng(w, h, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0; // filter: none
    Buffer.from(rgba.buffer, y * w * 4, w * 4).copy(raw, y * (w * 4 + 1) + 1);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
