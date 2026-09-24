export function randomId(prefix = ''): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return prefix + Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Stable short hash (FNV-1a, 32 bit) used for media ids derived from dedup keys. */
export function hashString(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}
