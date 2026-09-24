import type { DownloadJob, DownloadRequest, StreamPlan } from './download';
import type { MediaCandidate, MediaResource } from './media';

/** Messages from content scripts to the background service worker. */
export type ContentToBackground =
  | { type: 'MEDIA_CANDIDATES'; candidates: MediaCandidate[]; pageUrl: string; pageTitle: string; posterHint?: string }
  | { type: 'PAGE_NAVIGATED'; url: string; title: string }
  | { type: 'PAGE_EME_ACTIVE' }
  | { type: 'PANEL_DOWNLOAD'; mediaId: string }
  | { type: 'PANEL_GET_MEDIA' }
  | { type: 'OPEN_POPUP_MANAGER' };

/** Messages from extension UI pages (popup/options/manager) to the background. */
export type UiToBackground =
  | { type: 'GET_TAB_MEDIA'; tabId: number }
  | { type: 'RESCAN_TAB'; tabId: number }
  | { type: 'ANALYZE_MEDIA'; tabId: number; mediaId: string }
  | { type: 'DOWNLOAD'; request: DownloadRequest }
  | { type: 'DOWNLOAD_ALL'; tabId: number; quality?: DownloadRequest['quality'] }
  | { type: 'GET_DOWNLOADS' }
  | { type: 'DOWNLOAD_ACTION'; jobId: string; action: 'pause' | 'resume' | 'cancel' | 'retry' | 'remove' | 'show' }
  | { type: 'CLEAR_FINISHED_DOWNLOADS' }
  | { type: 'GET_DEBUG_LOG' }
  | { type: 'CLEAR_DEBUG_LOG' };

/** Messages between the background and the offscreen stream worker. */
export type BackgroundToOffscreen =
  | { target: 'offscreen'; type: 'STREAM_START'; jobId: string; plan: StreamPlan; concurrency: number; maxRetries: number }
  | { target: 'offscreen'; type: 'STREAM_PAUSE'; jobId: string }
  | { target: 'offscreen'; type: 'STREAM_RESUME'; jobId: string }
  | { target: 'offscreen'; type: 'STREAM_CANCEL'; jobId: string }
  | { target: 'offscreen'; type: 'RELEASE_BLOB'; blobUrl: string }
  | { target: 'offscreen'; type: 'PING' };

export interface StreamTrackOutput {
  blobUrl: string;
  size: number;
  extension: string;
  kind: 'video' | 'audio' | 'muxed';
}

export type OffscreenToBackground =
  | { target: 'background'; type: 'STREAM_PROGRESS'; jobId: string; bytesReceived: number; totalBytes?: number; segmentsDone: number; segmentsTotal: number }
  | { target: 'background'; type: 'STREAM_DONE'; jobId: string; outputs: StreamTrackOutput[] }
  | { target: 'background'; type: 'STREAM_FAILED'; jobId: string; errorCode: string; detail?: string; transient: boolean };

/** Messages pushed from the background to UI ports. */
export type BackgroundPush =
  | { type: 'DOWNLOADS_UPDATED'; jobs: DownloadJob[] }
  | { type: 'TAB_MEDIA_UPDATED'; tabId: number; media: MediaResource[] };

/** Messages from the background into a tab's content script. */
export type BackgroundToContent =
  | { type: 'RESCAN' }
  | { type: 'DOWNLOAD_BLOB'; url: string; filename: string }
  | { type: 'PANEL_MEDIA'; media: MediaResource[] };

export interface TabMediaResponse {
  tabId: number;
  pageUrl?: string;
  pageTitle?: string;
  media: MediaResource[];
  excluded: boolean;
  emeActive: boolean;
}

export type Result<T> = { ok: true; data: T } | { ok: false; errorCode: string; message: string; detail?: string };
