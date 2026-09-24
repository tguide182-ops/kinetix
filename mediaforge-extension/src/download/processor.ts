import type { TrackPlan } from '../types';

export interface AssembledTrack {
  kind: TrackPlan['kind'];
  blob: Blob;
  extension: string;
  mimeType: string;
}

/**
 * Extension point for local media processing (remuxing TS → MP4, merging
 * separate DASH/HLS video and audio into one file).
 *
 * The default build ships without a muxer so that the extension stays small
 * and contains no remotely-loaded or large binary code. A WASM-based processor
 * (e.g. an ffmpeg.wasm or mp4box.js build bundled into the extension package)
 * can be added by implementing this interface and registering it with
 * `registerMediaProcessor()` in src/offscreen/main.ts. Processors run entirely
 * locally inside the offscreen document; they must never decrypt protected media.
 */
export interface MediaProcessor {
  readonly name: string;
  canMerge(tracks: AssembledTrack[]): boolean;
  merge(tracks: AssembledTrack[], signal: AbortSignal): Promise<AssembledTrack>;
}

let processor: MediaProcessor | undefined;

export function registerMediaProcessor(p: MediaProcessor | undefined): void {
  processor = p;
}

export function getMediaProcessor(): MediaProcessor | undefined {
  return processor;
}

/** Concatenate an optional init segment and media segments into one track. */
export function assembleTrack(track: TrackPlan, init: Blob | undefined, parts: Blob[]): AssembledTrack {
  return {
    kind: track.kind,
    blob: new Blob(init ? [init, ...parts] : parts, { type: track.mimeType }),
    extension: track.extension,
    mimeType: track.mimeType,
  };
}

/** Merge tracks when a processor is available; otherwise keep them as separate files. */
export async function finalizeTracks(tracks: AssembledTrack[], signal: AbortSignal): Promise<AssembledTrack[]> {
  if (tracks.length > 1 && processor?.canMerge(tracks)) {
    return [await processor.merge(tracks, signal)];
  }
  return tracks;
}
