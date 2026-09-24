import type { AudioQualityPreference, QualityPreference, StreamAnalysis, StreamPlan, TrackPlan, VideoVariant } from '../../types';
import { MediaForgeError, toMediaForgeError } from '../../utils/errors';
import { selectAudioVariant, selectVideoVariant, sortVariants } from '../../utils/quality';
import { hlsProtection, hlsSegmentContainer, parseM3u8, type HlsMasterPlaylist, type HlsMediaPlaylist, type HlsPlaylist } from './hls';
import { dashContainerFor, parseMpd, type DashManifest, type DashRepresentation } from './dash';
import type { TextFetcher } from './fetch-text';

/* ------------------------------------------------------------------ */
/* Analysis: turn a manifest into a user-presentable StreamAnalysis    */
/* ------------------------------------------------------------------ */

function hlsVariantsOf(master: HlsMasterPlaylist): { variants: VideoVariant[]; audio: VideoVariant[] } {
  const variants: VideoVariant[] = master.variants.map((v, i) => {
    const out: VideoVariant = { id: `v${i}`, kind: v.width || v.height ? 'video' : 'muxed', url: v.uri };
    if (v.bandwidth !== undefined) out.bandwidth = v.averageBandwidth ?? v.bandwidth;
    if (v.width !== undefined) out.width = v.width;
    if (v.height !== undefined) out.height = v.height;
    if (v.frameRate !== undefined) out.frameRate = v.frameRate;
    if (v.codecs) out.codecs = v.codecs;
    if (v.qualityLabel) out.qualityLabel = v.qualityLabel;
    if (v.audioGroup) out.audioGroup = v.audioGroup;
    // Audio-only variants (codec list without video codecs, no resolution).
    if (!v.width && !v.height && v.codecs && !/avc|hvc|hev|vp0?9|av01|vp8/i.test(v.codecs)) out.kind = 'audio';
    return out;
  });
  const audio: VideoVariant[] = master.renditions
    .filter((r) => r.type === 'AUDIO' && r.uri)
    .map((r, i) => {
      const out: VideoVariant = { id: `a${i}`, kind: 'audio', url: r.uri!, audioGroup: r.groupId };
      if (r.name) out.name = r.name;
      if (r.language) out.language = r.language;
      // Rendition bandwidth is not signalled; borrow the max of variants in its group as a rough ordering key.
      const bw = Math.max(0, ...master.variants.filter((v) => v.audioGroup === r.groupId).map((v) => v.bandwidth ?? 0));
      if (bw) out.bandwidth = bw;
      return out;
    });
  // Include audio-only variants as audio tracks too.
  for (const v of variants) if (v.kind === 'audio') audio.push({ ...v });
  return { variants: sortVariants(variants.filter((v) => v.kind !== 'audio')), audio };
}

function dashRepToVariant(rep: DashRepresentation, kind: 'video' | 'audio', extra: Partial<VideoVariant> = {}): VideoVariant {
  const out: VideoVariant = { id: rep.id, kind, ...extra };
  if (rep.bandwidth !== undefined) out.bandwidth = rep.bandwidth;
  if (rep.width !== undefined) out.width = rep.width;
  if (rep.height !== undefined) out.height = rep.height;
  if (rep.frameRate !== undefined) out.frameRate = rep.frameRate;
  if (rep.codecs) out.codecs = rep.codecs;
  if (rep.qualityLabel) out.qualityLabel = rep.qualityLabel;
  if (rep.mimeType) out.mimeType = rep.mimeType;
  return out;
}

function dashVariantsOf(m: DashManifest): { variants: VideoVariant[]; audio: VideoVariant[] } {
  const first = m.periods[0];
  const variants: VideoVariant[] = [];
  const audio: VideoVariant[] = [];
  for (const as of first?.adaptationSets ?? []) {
    for (const rep of as.representations) {
      if (as.contentType === 'video') variants.push(dashRepToVariant(rep, 'video'));
      else if (as.contentType === 'audio') {
        const extra: Partial<VideoVariant> = {};
        if (as.lang) extra.language = as.lang;
        if (as.label) extra.name = as.label;
        audio.push(dashRepToVariant(rep, 'audio', extra));
      }
    }
  }
  return { variants: sortVariants(variants), audio };
}

export interface ParsedStream {
  kind: 'hls' | 'dash';
  manifestUrl: string;
  hls?: HlsPlaylist;
  /** First media playlist examined (for protection/duration of a master playlist). */
  hlsSample?: HlsMediaPlaylist;
  dash?: DashManifest;
}

/**
 * Fetch and analyse a manifest. For an HLS master playlist, the best variant's
 * media playlist is also read so encryption signalled only there is detected.
 */
export async function analyzeStream(kind: 'hls' | 'dash', url: string, fetcher: TextFetcher, signal?: AbortSignal): Promise<{ analysis: StreamAnalysis; parsed?: ParsedStream }> {
  const now = Date.now();
  try {
    const res = await fetcher(url, signal);
    if (kind === 'hls') {
      const pl = parseM3u8(res.text, res.url);
      const parsed: ParsedStream = { kind, manifestUrl: res.url, hls: pl };
      let sample: HlsMediaPlaylist;
      let variants: VideoVariant[] = [];
      let audio: VideoVariant[] = [];
      let protection = 'none' as StreamAnalysis['protection'];
      if (pl.type === 'master') {
        ({ variants, audio } = hlsVariantsOf(pl));
        protection = hlsProtection(pl.sessionKeys);
        const best = variants[0]?.url ?? pl.variants[0]!.uri;
        const sub = await fetcher(best, signal);
        const media = parseM3u8(sub.text, sub.url);
        if (media.type !== 'media') throw new MediaForgeError('MANIFEST_PARSE', { detail: 'Nested master playlist' });
        sample = media;
      } else {
        sample = pl;
        variants = [{ id: 'v0', kind: 'muxed', url: res.url }];
      }
      parsed.hlsSample = sample;
      const sampleProt = hlsProtection(sample.keys);
      if (sampleProt === 'drm' || (sampleProt === 'encrypted' && protection === 'none')) protection = sampleProt;
      const isLive = !sample.endList;
      const analysis: StreamAnalysis = {
        kind,
        status: protection !== 'none' ? 'protected' : isLive ? 'live' : 'ok',
        protection,
        isLive,
        variants,
        audioTracks: audio,
        analyzedAt: now,
      };
      if (!isLive && sample.totalDuration > 0) analysis.duration = Math.round(sample.totalDuration * 1000) / 1000;
      return { analysis, parsed };
    }

    const mpd = parseMpd(res.text, res.url);
    const { variants, audio } = dashVariantsOf(mpd);
    const isLive = mpd.type === 'dynamic';
    const analysis: StreamAnalysis = {
      kind,
      status: mpd.protection !== 'none' ? 'protected' : isLive ? 'live' : 'ok',
      protection: mpd.protection,
      isLive,
      variants,
      audioTracks: audio,
      analyzedAt: now,
    };
    if (mpd.duration !== undefined) analysis.duration = mpd.duration;
    return { analysis, parsed: { kind, manifestUrl: res.url, dash: mpd } };
  } catch (e) {
    const err = toMediaForgeError(e);
    return {
      analysis: { kind, status: 'error', protection: 'none', isLive: false, variants: [], audioTracks: [], analyzedAt: now, errorCode: err.code },
    };
  }
}

/* ------------------------------------------------------------------ */
/* Planning: pick concrete tracks/segments for a quality preference    */
/* ------------------------------------------------------------------ */

export interface PlanOptions {
  quality: QualityPreference;
  audioQuality: AudioQualityPreference;
}

function assertDownloadable(analysis: Pick<StreamAnalysis, 'protection' | 'isLive'>): void {
  if (analysis.protection !== 'none') throw new MediaForgeError('PROTECTED');
  if (analysis.isLive) throw new MediaForgeError('LIVE_STREAM');
}

function hlsTrack(pl: HlsMediaPlaylist, kind: TrackPlan['kind'], bandwidth?: number, qualityLabel?: string): TrackPlan {
  const prot = hlsProtection(pl.keys);
  if (prot !== 'none') throw new MediaForgeError('PROTECTED');
  if (!pl.endList) throw new MediaForgeError('LIVE_STREAM');
  if (!pl.segments.length) throw new MediaForgeError('MANIFEST_PARSE', { detail: 'Media playlist has no segments' });
  const container = hlsSegmentContainer(pl);
  const track: TrackPlan = {
    kind,
    container,
    segments: pl.segments.map((s) => (s.byteRange ? { url: s.uri, byteRange: s.byteRange, duration: s.duration } : { url: s.uri, duration: s.duration })),
    extension: container === 'ts' ? 'ts' : container === 'aac' ? 'aac' : kind === 'audio' ? 'm4a' : 'mp4',
    mimeType: container === 'ts' ? 'video/mp2t' : container === 'aac' ? 'audio/aac' : kind === 'audio' ? 'audio/mp4' : 'video/mp4',
  };
  const map = pl.segments.find((s) => s.map)?.map;
  if (map) track.init = map.byteRange ? { url: map.uri, byteRange: map.byteRange } : { url: map.uri };
  if (bandwidth && pl.totalDuration) track.estimatedBytes = Math.round((bandwidth / 8) * pl.totalDuration);
  if (qualityLabel) track.qualityLabel = qualityLabel;
  return track;
}

/** Build an HLS download plan; fetches the chosen media playlist(s). */
export async function planHls(parsed: ParsedStream, opts: PlanOptions, fetcher: TextFetcher, signal?: AbortSignal): Promise<StreamPlan> {
  const pl = parsed.hls;
  if (!pl) throw new MediaForgeError('MANIFEST_PARSE');
  const plan: StreamPlan = { kind: 'hls', manifestUrl: parsed.manifestUrl, tracks: [] };
  if (pl.type === 'media') {
    plan.tracks.push(hlsTrack(pl, 'muxed'));
    return plan;
  }
  if (hlsProtection(pl.sessionKeys) !== 'none') throw new MediaForgeError('PROTECTED');
  const { variants, audio } = hlsVariantsOf(pl);

  const loadMedia = async (url: string): Promise<HlsMediaPlaylist> => {
    const r = await fetcher(url, signal);
    const m = parseM3u8(r.text, r.url);
    if (m.type !== 'media') throw new MediaForgeError('MANIFEST_PARSE', { detail: 'Expected a media playlist' });
    return m;
  };

  if (opts.quality === 'audio') {
    const a = selectAudioVariant(audio, opts.audioQuality);
    if (a?.url) {
      plan.tracks.push(hlsTrack(await loadMedia(a.url), 'audio', a.bandwidth));
      return plan;
    }
    // No separate audio: fall back to the lowest muxed variant (audio + smallest video).
    const lowest = variants[variants.length - 1];
    if (!lowest?.url) throw new MediaForgeError('UNSUPPORTED', { detail: 'No audio rendition available' });
    plan.tracks.push(hlsTrack(await loadMedia(lowest.url), 'muxed', lowest.bandwidth, lowest.qualityLabel));
    return plan;
  }

  const v = selectVideoVariant(variants, opts.quality);
  if (!v?.url) throw new MediaForgeError('MANIFEST_PARSE', { detail: 'No playable variant' });
  const groupAudio = v.audioGroup ? audio.filter((a) => a.audioGroup === v.audioGroup) : [];
  const a = groupAudio.length ? selectAudioVariant(groupAudio, opts.audioQuality) : undefined;
  plan.tracks.push(hlsTrack(await loadMedia(v.url), a ? 'video' : 'muxed', v.bandwidth, v.qualityLabel));
  if (a?.url && a.url !== v.url) plan.tracks.push(hlsTrack(await loadMedia(a.url), 'audio', a.bandwidth));
  return plan;
}

function dashTrack(parsed: DashManifest, repId: string, kind: 'video' | 'audio', contentType: 'video' | 'audio'): TrackPlan {
  const segments: TrackPlan['segments'] = [];
  let init: TrackPlan['init'];
  let rep: DashRepresentation | undefined;
  let chosenHeight: number | undefined;
  for (const period of parsed.periods) {
    const sets = period.adaptationSets.filter((s) => s.contentType === contentType);
    const reps = sets.flatMap((s) => s.representations);
    // Same id across periods when possible; otherwise the closest height / bandwidth.
    const match =
      reps.find((r) => r.id === repId) ??
      (chosenHeight !== undefined ? [...reps].sort((a, b) => Math.abs((a.height ?? 0) - chosenHeight!) - Math.abs((b.height ?? 0) - chosenHeight!))[0] : reps[0]);
    if (!match) continue;
    rep ??= match;
    chosenHeight ??= match.height;
    if (!init && match.init) init = match.init;
    segments.push(...match.segments);
  }
  if (!rep || !segments.length) throw new MediaForgeError('MANIFEST_PARSE', { detail: 'Representation has no addressable segments' });
  const mime = rep.mimeType ?? (kind === 'audio' ? 'audio/mp4' : 'video/mp4');
  const isWebm = /webm/i.test(mime);
  const track: TrackPlan = {
    kind,
    container: rep.singleFile ? 'unknown' : dashContainerFor(mime),
    segments,
    extension: isWebm ? 'webm' : kind === 'audio' ? 'm4a' : 'mp4',
    mimeType: mime,
  };
  if (init) track.init = init;
  if (rep.qualityLabel) track.qualityLabel = rep.qualityLabel;
  if (rep.bandwidth && parsed.duration) track.estimatedBytes = Math.round((rep.bandwidth / 8) * parsed.duration);
  return track;
}

/** Build a DASH download plan (video + audio downloaded as separate tracks). */
export function planDash(parsed: ParsedStream, opts: PlanOptions): StreamPlan {
  const m = parsed.dash;
  if (!m) throw new MediaForgeError('MANIFEST_PARSE');
  assertDownloadable({ protection: m.protection, isLive: m.type === 'dynamic' });
  const { variants, audio } = dashVariantsOf(m);
  const plan: StreamPlan = { kind: 'dash', manifestUrl: parsed.manifestUrl, tracks: [] };
  if (opts.quality !== 'audio') {
    const v = selectVideoVariant(variants, opts.quality);
    if (v) plan.tracks.push(dashTrack(m, v.id, 'video', 'video'));
  }
  const a = selectAudioVariant(audio, opts.audioQuality);
  if (a) plan.tracks.push(dashTrack(m, a.id, 'audio', 'audio'));
  if (!plan.tracks.length) throw new MediaForgeError('UNSUPPORTED', { detail: 'No video or audio representations' });
  return plan;
}
