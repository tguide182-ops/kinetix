/**
 * URL helpers. Every URL discovered on a page is untrusted input: parse it,
 * restrict schemes and never hand it to anything that could execute it.
 */

/** Query parameters that only carry tracking/analytics information. */
const TRACKING_PARAMS = new Set([
  'fbclid', 'gclid', 'dclid', 'gbraid', 'wbraid', 'msclkid', 'yclid', 'twclid', 'ttclid', 'li_fat_id',
  'mc_cid', 'mc_eid', 'igshid', 'si', '_ga', '_gl', '_hsenc', '_hsmi', 'mkt_tok', 'ref_src', 'ref_url',
  'spm', 'vero_id', 'oly_anon_id', 'oly_enc_id', 'rb_clickid', 's_cid', 'cmpid', 'campaign_id',
]);
const TRACKING_PREFIXES = ['utm_', 'pk_', 'mtm_', 'hsa_'];

/**
 * Parameters whose values change between requests for the *same* resource
 * (signed-URL expiry, cache busters, byte ranges). They are excluded from the
 * dedup key but always kept in the URL used to download.
 */
const VOLATILE_PARAMS = new Set([
  'expires', 'expiry', 'exp', 'signature', 'sig', 'policy', 'key-pair-id', 'token', 'hdnts', 'hdnea',
  'hmac', 'auth', 'x-amz-algorithm', 'x-amz-credential', 'x-amz-date', 'x-amz-expires',
  'x-amz-signedheaders', 'x-amz-signature', 'x-amz-security-token', 'x-goog-algorithm',
  'x-goog-credential', 'x-goog-date', 'x-goog-expires', 'x-goog-signedheaders', 'x-goog-signature',
  'range', 'bytestart', 'byteend', 'byterange', '_', 'cb', 'cachebust', 'nocache', 'rand', 'timestamp',
]);

/** Query parameter names that must never appear in anything we display or persist as a name. */
const SENSITIVE_PARAM_PATTERN = /(token|auth|sig|key|session|pass|secret|credential|policy|hmac|jwt|cookie)/i;

export function isTrackingParam(name: string): boolean {
  const n = name.toLowerCase();
  return TRACKING_PARAMS.has(n) || TRACKING_PREFIXES.some((p) => n.startsWith(p));
}

export function isVolatileParam(name: string): boolean {
  return VOLATILE_PARAMS.has(name.toLowerCase());
}

export function isSensitiveParam(name: string): boolean {
  return SENSITIVE_PARAM_PATTERN.test(name);
}

export function safeParseUrl(raw: string, base?: string): URL | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > 16_384) return null;
  try {
    return base ? new URL(trimmed, base) : new URL(trimmed);
  } catch {
    return null;
  }
}

/** Only http(s) URLs may be fetched or handed to chrome.downloads. */
export function isHttpUrl(raw: string): boolean {
  const u = safeParseUrl(raw);
  return !!u && (u.protocol === 'http:' || u.protocol === 'https:');
}

export function isBlobUrl(raw: string): boolean {
  return typeof raw === 'string' && raw.startsWith('blob:');
}

/** Accepts http(s) and blob: URLs; rejects javascript:, data:, file:, chrome: etc. */
export function isAcceptableMediaUrl(raw: string): boolean {
  if (isBlobUrl(raw)) {
    const inner = safeParseUrl(raw.slice(5));
    return !!inner && (inner.protocol === 'http:' || inner.protocol === 'https:');
  }
  return isHttpUrl(raw);
}

/** Posters/thumbnails may be http(s) or an inline raster image. */
export function isSafeImageUrl(raw: string | undefined): raw is string {
  if (!raw) return false;
  if (/^data:image\/(png|jpe?g|gif|webp|avif);base64,/i.test(raw)) return raw.length < 200_000;
  return isHttpUrl(raw);
}

/** Resolve a possibly-relative URL; returns null for unusable/unsafe schemes. */
export function resolveUrl(raw: string, base: string): string | null {
  if (isBlobUrl(raw)) return isAcceptableMediaUrl(raw) ? raw : null;
  const u = safeParseUrl(raw, base);
  if (!u || (u.protocol !== 'http:' && u.protocol !== 'https:')) return null;
  return u.href;
}

/** Remove tracking parameters and the fragment; keeps everything needed to fetch. */
export function stripTracking(raw: string): string {
  const u = safeParseUrl(raw);
  if (!u) return raw;
  u.hash = '';
  for (const key of [...u.searchParams.keys()]) {
    if (isTrackingParam(key)) u.searchParams.delete(key);
  }
  return u.href;
}

/**
 * Canonical key for deduplication.
 * - scheme-insensitive (http/https of the same resource are the same media)
 * - lower-case host, default port removed, fragment removed
 * - tracking and volatile params removed, remaining params sorted
 * - path is kept case-sensitive (different paths are genuinely different media)
 */
export function normalizeUrl(raw: string): string {
  if (isBlobUrl(raw)) return raw;
  const u = safeParseUrl(raw);
  if (!u) return raw.trim();
  const host = u.hostname.toLowerCase().replace(/\.$/, '');
  const port = u.port && !((u.protocol === 'http:' && u.port === '80') || (u.protocol === 'https:' && u.port === '443')) ? `:${u.port}` : '';
  let path = u.pathname.replace(/\/{2,}/g, '/');
  try {
    // Normalize percent-encoding differences (%7E vs ~) without changing meaning.
    path = encodeURI(decodeURI(path));
  } catch {
    /* keep original on malformed encoding */
  }
  const params = [...u.searchParams.entries()]
    .filter(([k]) => !isTrackingParam(k) && !isVolatileParam(k))
    .sort(([a, av], [b, bv]) => (a === b ? av.localeCompare(bv) : a.localeCompare(b)));
  const query = params.length ? `?${params.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&')}` : '';
  return `//${host}${port}${path}${query}`;
}

export function hostnameOf(raw: string | undefined): string {
  if (!raw) return '';
  const u = safeParseUrl(raw);
  return u ? u.hostname.toLowerCase() : '';
}

/** Last path segment without query/fragment, decoded; '' when none. */
export function lastPathSegment(raw: string): string {
  const u = safeParseUrl(isBlobUrl(raw) ? raw.slice(5) : raw);
  if (!u) return '';
  const seg = u.pathname.split('/').filter(Boolean).pop() ?? '';
  try {
    return decodeURIComponent(seg);
  } catch {
    return seg;
  }
}

export function extensionOf(raw: string): string {
  const seg = lastPathSegment(raw);
  const m = /\.([a-z0-9]{1,5})$/i.exec(seg);
  return m?.[1] ? m[1].toLowerCase() : '';
}

/** A user-entered domain like "https://www.Example.com/x" → "example.com". */
export function normalizeDomain(input: string): string | null {
  let s = input.trim().toLowerCase();
  if (!s) return null;
  if (!/^[a-z][a-z0-9+.-]*:\/\//.test(s)) s = `https://${s}`;
  const u = safeParseUrl(s);
  if (!u || !u.hostname) return null;
  const host = u.hostname.replace(/^www\./, '').replace(/\.$/, '');
  if (!/^(?=.{1,253}$)([a-z0-9-]{1,63}\.)*[a-z0-9-]{1,63}$/.test(host) && !/^\[[0-9a-f:]+\]$/.test(host)) return null;
  return host;
}

/** True when `hostname` equals `domain` or is a subdomain of it. */
export function hostMatchesDomain(hostname: string, domain: string): boolean {
  const h = hostname.toLowerCase().replace(/^www\./, '');
  const d = domain.toLowerCase();
  return h === d || h.endsWith(`.${d}`);
}

export function isHostInList(pageUrl: string | undefined, domains: readonly string[]): boolean {
  const host = hostnameOf(pageUrl);
  if (!host) return false;
  return domains.some((d) => hostMatchesDomain(host, d));
}
