import type { MediaResource, VideoOption, VideoOptionsResponse } from '../types';
import { ERROR_MESSAGES } from '../utils/errors';
import { formatBitrate } from '../utils/format';
import { normalizeUrl } from '../utils/url';

function isVideoLike(m: MediaResource): boolean {
  return m.type === 'video' || m.type === 'hls' || m.type === 'dash';
}

/**
 * Build the quality menu for the on-video Download button.
 * Sizes come from Content-Length for files, and are estimated as
 * bitrate × duration for streams (flagged approximate). Unknown sizes stay unknown.
 */
export function buildVideoOptions(items: MediaResource[], playingSrc?: string): VideoOptionsResponse {
  const playingKey = playingSrc ? normalizeUrl(playingSrc) : undefined;
  const ordered = [...items].sort((a, b) => Number(b.dedupKey === playingKey) - Number(a.dedupKey === playingKey));
  const options: VideoOption[] = [];
  let protectedSeen = false;
  let liveSeen = false;

  for (const m of ordered) {
    if (!isVideoLike(m)) continue;
    if (m.isProtected) {
      protectedSeen = true;
      continue;
    }
    if (!m.isStream) {
      const o: VideoOption = { mediaId: m.id, quality: 'auto', label: m.qualityLabel ?? 'Original', detail: m.format === 'unknown' ? 'Video' : m.format.toUpperCase(), approximate: false };
      if (m.size) o.size = m.size;
      options.push(o);
      continue;
    }
    const a = m.analysis;
    if (!a) continue;
    if (a.status === 'protected') {
      protectedSeen = true;
      continue;
    }
    if (a.status === 'live') {
      liveSeen = true;
      continue;
    }
    if (a.status !== 'ok') continue;
    const bestAudio = Math.max(0, ...a.audioTracks.map((t) => (a.kind === 'dash' ? t.bandwidth ?? 0 : 0)));
    const seen = new Set<string>();
    for (const v of a.variants) {
      const label = v.qualityLabel ?? (v.bandwidth ? formatBitrate(v.bandwidth) : 'Best');
      if (seen.has(label)) continue;
      seen.add(label);
      const o: VideoOption = {
        mediaId: m.id,
        quality: v.qualityLabel ?? 'highest',
        label,
        detail: a.kind === 'dash' ? (bestAudio ? 'MP4 + audio file' : 'MP4') : 'HLS video',
        approximate: true,
      };
      // HLS variant bandwidth already includes its audio; DASH audio is a separate track.
      if (v.bandwidth && a.duration) o.size = Math.round(((v.bandwidth + bestAudio) / 8) * a.duration);
      options.push(o);
    }
    if (a.audioTracks.length) {
      const o: VideoOption = { mediaId: m.id, quality: 'audio', label: 'Audio only', detail: 'M4A', approximate: true };
      if (bestAudio && a.duration) o.size = Math.round((bestAudio / 8) * a.duration);
      options.push(o);
    }
  }

  // Label rows by video when options come from more than one source.
  if (new Set(options.map((o) => o.mediaId)).size > 1) {
    const byId = new Map(items.map((m) => [m.id, m]));
    for (const o of options) {
      const m = byId.get(o.mediaId);
      if (!m) continue;
      const name = m.isBlob ? 'In-page video' : m.isStream ? `${m.type.toUpperCase()} stream` : m.title ?? m.filename ?? 'Video';
      o.source = name.length > 40 ? `${name.slice(0, 39)}…` : name;
    }
    if (playingKey) {
      const playing = ordered.find((m) => m.dedupKey === playingKey);
      for (const o of options) if (playing && o.mediaId === playing.id) o.source = `${o.source ?? 'Video'} · playing`;
    }
  }
  if (options.length) return { options };
  return {
    options,
    message: protectedSeen ? ERROR_MESSAGES.PROTECTED : liveSeen ? ERROR_MESSAGES.LIVE_STREAM : "This player's video has no downloadable source.",
  };
}

/** Count of video items the on-video button could offer (used to decide whether to show it). */
export function downloadableVideoCount(items: MediaResource[]): number {
  return items.filter((m) => isVideoLike(m) && !m.isProtected && m.analysis?.status !== 'live' && m.analysis?.status !== 'error').length;
}
