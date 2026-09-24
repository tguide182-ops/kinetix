/** Messages posted from the MAIN-world hook to the isolated content script. */
export const HOOK_TAG = '__mediaforge_hook_v1';

export type HookMessage =
  | { [HOOK_TAG]: 1; kind: 'request'; via: 'fetch' | 'xhr'; url: string; mime?: string }
  | { [HOOK_TAG]: 1; kind: 'blob'; url: string; mime: string; size: number }
  | { [HOOK_TAG]: 1; kind: 'mse'; url: string }
  | { [HOOK_TAG]: 1; kind: 'nav' }
  | { [HOOK_TAG]: 1; kind: 'eme' };

/** Cheap pre-filter so the hook only reports plausible media traffic. */
export const MEDIA_HINT = /\.(mp4|webm|mov|m4v|m4a|ogv|oga|ogg|mp3|aac|wav|flac|opus|m3u8?|mpd)(?:[?#;/]|$)|format=(m3u8|mpd)|manifest\(format=/i;
export const MEDIA_MIME_HINT = /^(video\/|audio\/|application\/(vnd\.apple\.mpegurl|x-mpegurl|dash\+xml))/i;

/** Validate a message received through window.postMessage (the page can forge these). */
export function parseHookMessage(data: unknown): HookMessage | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as Record<string, unknown>;
  if (d[HOOK_TAG] !== 1 || typeof d.kind !== 'string') return null;
  const str = (v: unknown, max = 8192): v is string => typeof v === 'string' && v.length > 0 && v.length <= max;
  switch (d.kind) {
    case 'request':
      if (!str(d.url) || (d.via !== 'fetch' && d.via !== 'xhr')) return null;
      return { [HOOK_TAG]: 1, kind: 'request', via: d.via, url: d.url, ...(str(d.mime, 200) ? { mime: d.mime } : {}) };
    case 'blob':
      if (!str(d.url, 300) || !str(d.mime, 200) || typeof d.size !== 'number') return null;
      return { [HOOK_TAG]: 1, kind: 'blob', url: d.url, mime: d.mime, size: d.size };
    case 'mse':
      return str(d.url, 300) ? { [HOOK_TAG]: 1, kind: 'mse', url: d.url } : null;
    case 'nav':
      return { [HOOK_TAG]: 1, kind: 'nav' };
    case 'eme':
      return { [HOOK_TAG]: 1, kind: 'eme' };
    default:
      return null;
  }
}
