/**
 * Error codes and their user-facing messages. Raw technical details are kept
 * in `detail` and only surfaced when debug mode is enabled.
 */
export const ERROR_MESSAGES = {
  NO_MEDIA: 'No media detected.',
  ACCESS_DENIED: 'Media URL could not be accessed.',
  SERVER_REJECTED: 'Server rejected the download.',
  NOT_FOUND: 'The media file no longer exists on the server.',
  PROTECTED: 'Protected media — downloading is not supported.',
  LIVE_STREAM: 'Live streams are not supported. Try again once the broadcast has finished.',
  NETWORK: 'Network connection interrupted.',
  TIMEOUT: 'The server took too long to respond.',
  CANCELLED: 'Download cancelled.',
  NO_SPACE: 'Insufficient storage.',
  FILE_ERROR: 'The file could not be saved. Check the download folder setting.',
  MANIFEST_PARSE: 'Manifest could not be parsed.',
  UNSUPPORTED: 'This media type cannot be downloaded.',
  BLOB_UNAVAILABLE: 'This media is streamed through the page player and has no downloadable source.',
  TOO_LARGE: 'This stream is too large to assemble in the browser.',
  EXCLUDED_SITE: 'Scanning is disabled for this site.',
  INTERNAL: 'Something went wrong. Enable debug logging in Settings for details.',
} as const;

export type ErrorCode = keyof typeof ERROR_MESSAGES;

export class MediaForgeError extends Error {
  readonly code: ErrorCode;
  readonly transient: boolean;
  readonly detail?: string;
  readonly status?: number;

  constructor(code: ErrorCode, opts: { transient?: boolean; detail?: string; status?: number } = {}) {
    super(ERROR_MESSAGES[code]);
    this.name = 'MediaForgeError';
    this.code = code;
    this.transient = opts.transient ?? TRANSIENT_CODES.has(code);
    if (opts.detail !== undefined) this.detail = opts.detail;
    if (opts.status !== undefined) this.status = opts.status;
  }
}

const TRANSIENT_CODES = new Set<ErrorCode>(['NETWORK', 'TIMEOUT']);

export function isErrorCode(code: unknown): code is ErrorCode {
  return typeof code === 'string' && Object.prototype.hasOwnProperty.call(ERROR_MESSAGES, code);
}

export function userMessage(code: string | undefined): string {
  return isErrorCode(code) ? ERROR_MESSAGES[code] : ERROR_MESSAGES.INTERNAL;
}

/** Map an HTTP status to an error. 408/425/429/5xx are transient. */
export function errorFromStatus(status: number, url?: string): MediaForgeError {
  const detail = `HTTP ${status}${url ? ` for ${redactUrl(url)}` : ''}`;
  if (status === 401 || status === 403 || status === 451) return new MediaForgeError('ACCESS_DENIED', { status, detail });
  if (status === 404 || status === 410) return new MediaForgeError('NOT_FOUND', { status, detail });
  if (status === 408 || status === 504) return new MediaForgeError('TIMEOUT', { status, detail, transient: true });
  if (status === 425 || status === 429 || status >= 500) return new MediaForgeError('SERVER_REJECTED', { status, detail, transient: true });
  return new MediaForgeError('SERVER_REJECTED', { status, detail });
}

/** Map chrome.downloads InterruptReason strings to our codes. */
export function errorFromInterruptReason(reason: string | undefined): MediaForgeError {
  const detail = `chrome.downloads interrupt: ${reason ?? 'unknown'}`;
  switch (reason) {
    case 'USER_CANCELED':
    case 'USER_SHUTDOWN':
      return new MediaForgeError('CANCELLED', { detail });
    case 'FILE_NO_SPACE':
    case 'FILE_TOO_LARGE':
      return new MediaForgeError('NO_SPACE', { detail });
    case 'FILE_ACCESS_DENIED':
    case 'FILE_NAME_TOO_LONG':
    case 'FILE_VIRUS_INFECTED':
    case 'FILE_BLOCKED':
    case 'FILE_SECURITY_CHECK_FAILED':
    case 'FILE_FAILED':
      return new MediaForgeError('FILE_ERROR', { detail });
    case 'FILE_TRANSIENT_ERROR':
      return new MediaForgeError('FILE_ERROR', { detail, transient: true });
    case 'NETWORK_FAILED':
    case 'NETWORK_DISCONNECTED':
    case 'NETWORK_SERVER_DOWN':
    case 'SERVER_NO_RANGE':
    case 'SERVER_CONTENT_LENGTH_MISMATCH':
      return new MediaForgeError('NETWORK', { detail, transient: true });
    case 'NETWORK_TIMEOUT':
      return new MediaForgeError('TIMEOUT', { detail, transient: true });
    case 'NETWORK_INVALID_REQUEST':
    case 'SERVER_BAD_CONTENT':
      return new MediaForgeError('ACCESS_DENIED', { detail });
    case 'SERVER_UNAUTHORIZED':
    case 'SERVER_FORBIDDEN':
    case 'SERVER_CERT_PROBLEM':
    case 'SERVER_CROSS_ORIGIN_REDIRECT':
      return new MediaForgeError('ACCESS_DENIED', { detail });
    case 'SERVER_UNREACHABLE':
      return new MediaForgeError('NETWORK', { detail, transient: true });
    case 'SERVER_FAILED':
      return new MediaForgeError('SERVER_REJECTED', { detail, transient: true });
    default:
      return new MediaForgeError('SERVER_REJECTED', { detail });
  }
}

/** Normalize anything thrown into a MediaForgeError. */
export function toMediaForgeError(err: unknown): MediaForgeError {
  if (err instanceof MediaForgeError) return err;
  if (err instanceof DOMException && err.name === 'AbortError') return new MediaForgeError('CANCELLED', { detail: 'aborted' });
  if (err instanceof DOMException && err.name === 'QuotaExceededError') return new MediaForgeError('NO_SPACE', { detail: err.message });
  if (err instanceof TypeError) {
    // fetch() network failures surface as TypeError("Failed to fetch").
    return new MediaForgeError('NETWORK', { detail: err.message, transient: true });
  }
  const detail = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
  return new MediaForgeError('INTERNAL', { detail });
}

/** Strip the query string (which may carry tokens) before logging a URL. */
export function redactUrl(url: string): string {
  try {
    const u = new URL(url);
    return `${u.origin}${u.pathname}${u.search ? '?…' : ''}`;
  } catch {
    return '[invalid url]';
  }
}
