import type { ByteRange, ProtectionStatus, SegmentRef } from '../../types';
import { MediaForgeError } from '../../utils/errors';
import { qualityLabel } from '../../utils/quality';
import { resolveUrl } from '../../utils/url';
import { child, childrenNamed, parseXml, XmlParseError, type XmlElement } from './xml';

export interface DashRepresentation {
  id: string;
  bandwidth?: number;
  width?: number;
  height?: number;
  frameRate?: number;
  codecs?: string;
  mimeType?: string;
  audioSamplingRate?: number;
  qualityLabel?: string;
  init?: SegmentRef;
  segments: SegmentRef[];
  /** True when the whole representation is one addressable file (SegmentBase / bare BaseURL). */
  singleFile: boolean;
}

export interface DashAdaptationSet {
  id?: string;
  contentType: 'video' | 'audio' | 'text' | 'image' | 'other';
  mimeType?: string;
  lang?: string;
  label?: string;
  isProtected: boolean;
  representations: DashRepresentation[];
}

export interface DashPeriod {
  id?: string;
  start: number;
  duration?: number;
  adaptationSets: DashAdaptationSet[];
}

export interface DashManifest {
  type: 'static' | 'dynamic';
  duration?: number;
  periods: DashPeriod[];
  protection: ProtectionStatus;
}

const MAX_SEGMENTS = 100_000;

/** ISO-8601 duration (PT1H2M3.5S, P1DT2H) → seconds. */
export function parseIsoDuration(v: string | undefined): number | undefined {
  if (!v) return undefined;
  const m = /^P(?:(\d+(?:\.\d+)?)Y)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?)?$/.exec(v.trim());
  if (!m) return undefined;
  const [, y, mo, d, h, mi, s] = m.map((x) => (x ? Number(x) : 0)) as number[];
  return (y ?? 0) * 31_536_000 + (mo ?? 0) * 2_592_000 + (d ?? 0) * 86_400 + (h ?? 0) * 3600 + (mi ?? 0) * 60 + (s ?? 0);
}

function num(v: string | undefined): number | undefined {
  if (v === undefined || v === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function frameRate(v: string | undefined): number | undefined {
  if (!v) return undefined;
  const [a, b] = v.split('/');
  const n = num(a);
  const d = b !== undefined ? num(b) : 1;
  return n !== undefined && d ? Math.round((n / d) * 1000) / 1000 : undefined;
}

function range(v: string | undefined): ByteRange | undefined {
  const m = v ? /^(\d+)-(\d+)$/.exec(v.trim()) : null;
  return m ? { start: Number(m[1]), end: Number(m[2]) } : undefined;
}

function resolveBase(el: XmlElement | undefined, base: string): string {
  if (!el) return base;
  const b = child(el, 'BaseURL');
  if (!b || !b.text) return base;
  return resolveUrl(b.text, base) ?? base;
}

/** Substitute $RepresentationID$, $Number%05d$, $Bandwidth$, $Time$, $$ in a SegmentTemplate URL. */
export function fillTemplate(tpl: string, vars: { RepresentationID: string; Bandwidth?: number; Number?: number; Time?: number }): string {
  return tpl.replace(/\$(RepresentationID|Number|Bandwidth|Time)(?:%0(\d+)d)?\$|\$\$/g, (whole, name?: string, width?: string) => {
    if (whole === '$$') return '$';
    const value = vars[name as keyof typeof vars];
    if (value === undefined) return whole;
    const s = String(value);
    return width ? s.padStart(Number(width), '0') : s;
  });
}

/** Merge attributes of a SegmentTemplate chain (Period → AdaptationSet → Representation). */
function mergedAttrs(chain: XmlElement[] | undefined): Record<string, string> {
  return Object.assign({}, ...(chain ?? []).map((e) => e.attrs)) as Record<string, string>;
}

function lastWith(chain: XmlElement[] | undefined, name: string): XmlElement | undefined {
  if (!chain) return undefined;
  for (let i = chain.length - 1; i >= 0; i--) {
    const c = child(chain[i]!, name);
    if (c) return c;
  }
  return undefined;
}

function checkedUrl(u: string | null): string {
  if (!u) throw new MediaForgeError('MANIFEST_PARSE', { detail: 'Manifest references a non-http(s) URI' });
  return u;
}

function templateSegments(
  chain: XmlElement[],
  rep: { id: string; bandwidth?: number },
  base: string,
  periodDuration: number | undefined,
): { init?: SegmentRef; segments: SegmentRef[] } {
  const a = mergedAttrs(chain);
  const timescale = num(a.timescale) ?? 1;
  const startNumber = num(a.startNumber) ?? 1;
  const vars = { RepresentationID: rep.id, ...(rep.bandwidth !== undefined ? { Bandwidth: rep.bandwidth } : {}) };
  const out: { init?: SegmentRef; segments: SegmentRef[] } = { segments: [] };
  if (a.initialization) out.init = { url: checkedUrl(resolveUrl(fillTemplate(a.initialization, vars), base)) };
  if (!a.media) return out;

  const timeline = lastWith(chain, 'SegmentTimeline');
  if (timeline) {
    let t = 0;
    let n = startNumber;
    const entries = childrenNamed(timeline, 'S');
    for (let idx = 0; idx < entries.length; idx++) {
      const s = entries[idx]!;
      const d = num(s.attrs.d);
      if (!d) continue;
      if (s.attrs.t !== undefined) t = num(s.attrs.t) ?? t;
      let r = num(s.attrs.r) ?? 0;
      if (r < 0) {
        // r=-1: repeat until the next S@t or the end of the period.
        const nextT = num(entries[idx + 1]?.attrs.t);
        const end = nextT ?? (periodDuration !== undefined ? periodDuration * timescale : t + d);
        r = Math.max(0, Math.ceil((end - t) / d) - 1);
      }
      for (let k = 0; k <= r; k++) {
        out.segments.push({ url: checkedUrl(resolveUrl(fillTemplate(a.media, { ...vars, Number: n, Time: t }), base)), duration: d / timescale });
        t += d;
        n++;
        if (out.segments.length > MAX_SEGMENTS) throw new MediaForgeError('TOO_LARGE', { detail: 'Too many segments' });
      }
    }
    return out;
  }

  const d = num(a.duration);
  if (d && periodDuration !== undefined) {
    const segDur = d / timescale;
    const count = Math.ceil(periodDuration / segDur - 1e-9);
    if (count > MAX_SEGMENTS) throw new MediaForgeError('TOO_LARGE', { detail: 'Too many segments' });
    for (let k = 0; k < count; k++) {
      out.segments.push({
        url: checkedUrl(resolveUrl(fillTemplate(a.media, { ...vars, Number: startNumber + k, Time: k * d }), base)),
        duration: segDur,
      });
    }
  }
  return out;
}

function listSegments(chain: XmlElement[], base: string): { init?: SegmentRef; segments: SegmentRef[] } {
  const out: { init?: SegmentRef; segments: SegmentRef[] } = { segments: [] };
  const a = mergedAttrs(chain);
  const timescale = num(a.timescale) ?? 1;
  const d = num(a.duration);
  const init = lastWith(chain, 'Initialization');
  if (init) {
    const ref: SegmentRef = { url: checkedUrl(resolveUrl(init.attrs.sourceURL ?? '', base)) };
    const r = range(init.attrs.range);
    if (r) ref.byteRange = r;
    out.init = ref;
  }
  const last = chain[chain.length - 1];
  const holder = [...chain].reverse().find((c) => childrenNamed(c, 'SegmentURL').length) ?? last;
  for (const s of holder ? childrenNamed(holder, 'SegmentURL') : []) {
    const ref: SegmentRef = { url: checkedUrl(resolveUrl(s.attrs.media ?? '', base)) };
    const r = range(s.attrs.mediaRange);
    if (r) ref.byteRange = r;
    if (d) ref.duration = d / timescale;
    out.segments.push(ref);
  }
  return out;
}

function contentTypeOf(as: XmlElement, firstRep: XmlElement | undefined): DashAdaptationSet['contentType'] {
  const ct = (as.attrs.contentType ?? '').toLowerCase();
  const mime = (as.attrs.mimeType ?? firstRep?.attrs.mimeType ?? '').toLowerCase();
  const t = ct || mime.split('/')[0] || '';
  if (t === 'video' || t === 'audio' || t === 'text' || t === 'image') return t;
  if (mime.includes('mp4') && firstRep?.attrs.width) return 'video';
  return 'other';
}

export function isMpdText(text: string): boolean {
  return /<MPD[\s>]/.test(text.slice(0, 4096)) || /<(?:\w+:)?MPD[\s>]/.test(text.slice(0, 4096));
}

export function parseMpd(text: string, baseUrl: string): DashManifest {
  let doc: XmlElement;
  try {
    doc = parseXml(text);
  } catch (e) {
    throw new MediaForgeError('MANIFEST_PARSE', { detail: e instanceof XmlParseError ? e.message : 'XML error' });
  }
  const mpd = doc.children.find((c) => c.name === 'MPD');
  if (!mpd) throw new MediaForgeError('MANIFEST_PARSE', { detail: 'Missing <MPD> root' });

  const type = mpd.attrs.type === 'dynamic' ? 'dynamic' : 'static';
  const total = parseIsoDuration(mpd.attrs.mediaPresentationDuration);
  const mpdBase = resolveBase(mpd, baseUrl);
  const periodsEl = childrenNamed(mpd, 'Period');
  if (!periodsEl.length) throw new MediaForgeError('MANIFEST_PARSE', { detail: 'No <Period> elements' });

  let anyProtected = childrenNamed(mpd, 'ContentProtection').length > 0;
  const periods: DashPeriod[] = [];
  let cursor = 0;

  periodsEl.forEach((p, pi) => {
    const start = parseIsoDuration(p.attrs.start) ?? cursor;
    const nextStart = parseIsoDuration(periodsEl[pi + 1]?.attrs.start);
    const duration =
      parseIsoDuration(p.attrs.duration) ?? (nextStart !== undefined ? nextStart - start : total !== undefined ? total - start : undefined);
    cursor = start + (duration ?? 0);
    const pBase = resolveBase(p, mpdBase);
    const period: DashPeriod = { start, adaptationSets: [] };
    if (p.attrs.id) period.id = p.attrs.id;
    if (duration !== undefined) period.duration = duration;

    for (const as of childrenNamed(p, 'AdaptationSet')) {
      const asBase = resolveBase(as, pBase);
      const repsEl = childrenNamed(as, 'Representation');
      const asProtected = childrenNamed(as, 'ContentProtection').length > 0;
      const set: DashAdaptationSet = {
        contentType: contentTypeOf(as, repsEl[0]),
        isProtected: asProtected,
        representations: [],
      };
      if (as.attrs.id) set.id = as.attrs.id;
      if (as.attrs.mimeType) set.mimeType = as.attrs.mimeType;
      if (as.attrs.lang) set.lang = as.attrs.lang;
      const label = child(as, 'Label')?.text;
      if (label) set.label = label;

      for (const r of repsEl) {
        const rBase = resolveBase(r, asBase);
        const repProtected = childrenNamed(r, 'ContentProtection').length > 0;
        if (repProtected) set.isProtected = true;
        const rep: DashRepresentation = { id: r.attrs.id ?? String(set.representations.length), segments: [], singleFile: false };
        const bw = num(r.attrs.bandwidth);
        if (bw !== undefined) rep.bandwidth = bw;
        const w = num(r.attrs.width ?? as.attrs.width);
        const h = num(r.attrs.height ?? as.attrs.height);
        if (w !== undefined) rep.width = w;
        if (h !== undefined) rep.height = h;
        const label = qualityLabel(w, h);
        if (label) rep.qualityLabel = label;
        const fr = frameRate(r.attrs.frameRate ?? as.attrs.frameRate);
        if (fr !== undefined) rep.frameRate = fr;
        const codecs = r.attrs.codecs ?? as.attrs.codecs;
        if (codecs) rep.codecs = codecs;
        const mime = r.attrs.mimeType ?? as.attrs.mimeType;
        if (mime) rep.mimeType = mime;
        const sr = num(r.attrs.audioSamplingRate ?? as.attrs.audioSamplingRate);
        if (sr !== undefined) rep.audioSamplingRate = sr;

        if (type === 'static') {
          const tplChain = [p, as, r].map((e) => child(e, 'SegmentTemplate')).filter((e): e is XmlElement => !!e);
          const listChain = [p, as, r].map((e) => child(e, 'SegmentList')).filter((e): e is XmlElement => !!e);
          const hasBase = [p, as, r].some((e) => child(e, 'SegmentBase'));
          if (tplChain.length) {
            Object.assign(rep, templateSegments(tplChain, rep, rBase, duration));
          } else if (listChain.length) {
            Object.assign(rep, listSegments(listChain, rBase));
          } else if (hasBase || child(r, 'BaseURL') || child(as, 'BaseURL')) {
            // SegmentBase (sidx-indexed) or a bare BaseURL: the representation is a complete file.
            rep.segments = [{ url: rBase }];
            rep.singleFile = true;
          }
        }
        set.representations.push(rep);
      }
      if (set.isProtected) anyProtected = true;
      period.adaptationSets.push(set);
    }
    periods.push(period);
  });

  const manifest: DashManifest = { type, periods, protection: anyProtected ? 'drm' : 'none' };
  const dur = total ?? (periods.every((p) => p.duration !== undefined) ? periods.reduce((s, p) => s + (p.duration ?? 0), 0) : undefined);
  if (dur !== undefined) manifest.duration = dur;
  return manifest;
}

export function dashContainerFor(mime: string | undefined): 'fmp4' | 'unknown' {
  return mime && /mp4/i.test(mime) ? 'fmp4' : 'unknown';
}
