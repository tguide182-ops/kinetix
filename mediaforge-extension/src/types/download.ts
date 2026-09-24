import type { MediaFormat, MediaType, QualityPreference } from './media';

export type DownloadStatus = 'queued' | 'active' | 'paused' | 'completed' | 'failed' | 'cancelled';

export interface ByteRange {
  start: number;
  /** Inclusive end offset. */
  end: number;
}

export interface SegmentRef {
  url: string;
  byteRange?: ByteRange;
  /** Seconds. */
  duration?: number;
}

export type SegmentContainer = 'ts' | 'fmp4' | 'aac' | 'unknown';

export interface TrackPlan {
  kind: 'video' | 'audio' | 'muxed';
  container: SegmentContainer;
  init?: SegmentRef;
  segments: SegmentRef[];
  /** Estimated total bytes, when derivable from bandwidth * duration. */
  estimatedBytes?: number;
  extension: string;
  mimeType: string;
  qualityLabel?: string;
}

export interface StreamPlan {
  kind: 'hls' | 'dash';
  manifestUrl: string;
  tracks: TrackPlan[];
}

export interface DownloadJob {
  id: string;
  mediaId?: string;
  tabId?: number;
  url: string;
  filename: string;
  mediaType: MediaType;
  format: MediaFormat;
  qualityLabel?: string;
  quality?: QualityPreference;
  status: DownloadStatus;
  /** Direct file or segmented stream. */
  mode: 'direct' | 'stream' | 'blob';
  plan?: StreamPlan;
  bytesReceived: number;
  totalBytes?: number;
  /** Bytes per second (smoothed). */
  speed?: number;
  /** Seconds remaining. */
  eta?: number;
  attempts: number;
  maxRetries: number;
  nextRetryAt?: number;
  errorCode?: string;
  errorMessage?: string;
  /** Technical diagnostics, only shown in debug mode. */
  errorDetail?: string;
  chromeDownloadIds: number[];
  createdAt: number;
  startedAt?: number;
  finishedAt?: number;
  canPause: boolean;
}

export interface DownloadRequest {
  mediaId?: string;
  tabId?: number;
  quality?: QualityPreference;
  /** Direct URL (e.g. from the context menu) when no detected media id exists. */
  url?: string;
}
