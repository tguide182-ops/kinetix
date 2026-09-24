/**
 * Core media domain model shared by every layer of the extension.
 */

export type MediaType = 'video' | 'audio' | 'hls' | 'dash' | 'unknown';

/** Container/format as far as we can tell from URL, MIME type or manifest. */
export type MediaFormat =
  | 'mp4'
  | 'webm'
  | 'mov'
  | 'm4v'
  | 'ogg'
  | 'ogv'
  | 'mp3'
  | 'aac'
  | 'm4a'
  | 'wav'
  | 'flac'
  | 'opus'
  | 'm3u8'
  | 'mpd'
  | 'unknown';

export type DetectionMethod =
  | 'dom'
  | 'media-event'
  | 'performance'
  | 'fetch'
  | 'xhr'
  | 'network'
  | 'blob'
  | 'context-menu';

/**
 * none      – no encryption signalled
 * encrypted – stream-level encryption (e.g. HLS AES-128); keys must be acquired, unsupported
 * drm       – DRM system signalled (Widevine / PlayReady / FairPlay / CENC ContentProtection)
 */
export type ProtectionStatus = 'none' | 'encrypted' | 'drm';

export interface MediaResource {
  id: string;
  url: string;
  /** Normalized URL used for deduplication. Never displayed. */
  dedupKey: string;
  type: MediaType;
  format: MediaFormat;
  mimeType?: string;
  title?: string;
  filename?: string;
  size?: number;
  duration?: number;
  width?: number;
  height?: number;
  bitrate?: number;
  fps?: number;
  codec?: string;
  /** Normalized quality label (e.g. "1080p"); absent when unknown. */
  qualityLabel?: string;
  posterUrl?: string;
  sourcePage: string;
  pageTitle?: string;
  detectionMethod: DetectionMethod;
  detectionMethods: DetectionMethod[];
  isStream: boolean;
  isProtected: boolean;
  protection: ProtectionStatus;
  /** Blob-backed media (URL.createObjectURL(Blob)) that the page itself can re-read. */
  isBlob?: boolean;
  detectedAt: number;
  /** Populated lazily once a manifest has been fetched and parsed. */
  analysis?: StreamAnalysis;
}

/**
 * Raw observation from a detector, before it is normalized into a MediaResource.
 * Everything in here is untrusted page-provided data.
 */
export interface MediaCandidate {
  url: string;
  method: DetectionMethod;
  mimeType?: string;
  title?: string;
  size?: number;
  duration?: number;
  width?: number;
  height?: number;
  posterUrl?: string;
  pageUrl?: string;
  pageTitle?: string;
  blobSize?: number;
  /** Element tag that produced this candidate, if any. */
  element?: 'video' | 'audio' | 'source' | 'a';
}

export interface VideoVariant {
  id: string;
  kind: 'video' | 'audio' | 'muxed';
  url?: string;
  bandwidth?: number;
  width?: number;
  height?: number;
  frameRate?: number;
  codecs?: string;
  qualityLabel?: string;
  audioGroup?: string;
  language?: string;
  name?: string;
  mimeType?: string;
}

export interface StreamAnalysis {
  kind: 'hls' | 'dash';
  status: 'ok' | 'protected' | 'live' | 'error';
  protection: ProtectionStatus;
  isLive: boolean;
  /** Seconds, when determinable. */
  duration?: number;
  variants: VideoVariant[];
  audioTracks: VideoVariant[];
  analyzedAt: number;
  errorCode?: string;
}

/** User-facing quality choice. */
export type QualityPreference = 'auto' | 'highest' | '2160p' | '1440p' | '1080p' | '720p' | '480p' | '360p' | 'audio';

export type AudioQualityPreference = 'highest' | 'balanced' | 'lowest';
