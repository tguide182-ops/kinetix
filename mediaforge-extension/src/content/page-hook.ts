/**
 * Runs in the page's MAIN world at document_start (declared in the manifest).
 *
 * Observes — never modifies — media-related activity that is invisible to the
 * isolated content script:
 *   - fetch()/XMLHttpRequest response URLs and Content-Type headers
 *   - URL.createObjectURL() for Blob-backed and MediaSource-backed media
 *   - history.pushState/replaceState (SPA navigation)
 *   - EME usage (navigator.requestMediaKeySystemAccess) as a DRM hint
 *
 * It never reads request headers, request bodies, response bodies, cookies or
 * credentials, and every wrapper calls through to the original unchanged.
 */
import { HOOK_TAG, MEDIA_HINT, MEDIA_MIME_HINT, type HookMessage } from './hook-protocol';

(() => {
  const w = window as Window & { [HOOK_TAG]?: boolean };
  if (w[HOOK_TAG]) return;
  Object.defineProperty(w, HOOK_TAG, { value: true, enumerable: false });

  type Payload = HookMessage extends infer T ? (T extends unknown ? Omit<T, typeof HOOK_TAG> : never) : never;
  const post = (msg: Payload): void => {
    try {
      window.postMessage({ ...msg, [HOOK_TAG]: 1 }, '*');
    } catch {
      /* ignore */
    }
  };

  const report = (via: 'fetch' | 'xhr', url: string | null | undefined, mime: string | null | undefined): void => {
    if (!url || url.startsWith('data:')) return;
    const m = (mime ?? '').split(';')[0]!.trim();
    if (!MEDIA_HINT.test(url) && !MEDIA_MIME_HINT.test(m)) return;
    post({ kind: 'request', via, url, ...(m ? { mime: m } : {}) });
  };

  // fetch()
  const origFetch = w.fetch;
  if (typeof origFetch === 'function') {
    const wrapped = function (this: unknown, ...args: Parameters<typeof fetch>): Promise<Response> {
      const p = origFetch.apply(this, args);
      p.then(
        (res) => {
          try {
            report('fetch', res.url, res.headers.get('content-type'));
          } catch {
            /* opaque responses */
          }
        },
        () => {},
      );
      return p;
    };
    w.fetch = wrapped as typeof fetch;
  }

  // XMLHttpRequest
  const XHR = typeof XMLHttpRequest === 'function' ? XMLHttpRequest.prototype : undefined;
  if (XHR) {
    const origOpen = XHR.open;
    const seen = new WeakSet<XMLHttpRequest>();
    XHR.open = function (this: XMLHttpRequest, ...args: unknown[]) {
      if (!seen.has(this)) {
        seen.add(this);
        this.addEventListener('readystatechange', () => {
          if (this.readyState === 2) {
            try {
              report('xhr', this.responseURL, this.getResponseHeader('content-type'));
            } catch {
              /* ignore */
            }
          }
        });
      }
      return (origOpen as (...a: unknown[]) => void).apply(this, args);
    } as typeof XHR.open;
  }

  // URL.createObjectURL
  const origCreate = URL.createObjectURL;
  if (typeof origCreate === 'function') {
    URL.createObjectURL = function (obj: Blob | MediaSource): string {
      const url = origCreate.call(URL, obj);
      try {
        if (typeof MediaSource !== 'undefined' && obj instanceof MediaSource) post({ kind: 'mse', url });
        else if (obj instanceof Blob && /^(video|audio)\//i.test(obj.type)) post({ kind: 'blob', url, mime: obj.type, size: obj.size });
      } catch {
        /* ignore */
      }
      return url;
    };
  }

  // SPA navigation
  for (const name of ['pushState', 'replaceState'] as const) {
    const orig = history[name];
    history[name] = function (this: History, ...args: Parameters<History['pushState']>) {
      const r = orig.apply(this, args);
      post({ kind: 'nav' });
      return r;
    };
  }

  // EME (DRM) usage hint
  const nav = navigator as Navigator & { requestMediaKeySystemAccess?: Navigator['requestMediaKeySystemAccess'] };
  const origEme = nav.requestMediaKeySystemAccess;
  if (typeof origEme === 'function') {
    let reported = false;
    nav.requestMediaKeySystemAccess = function (this: Navigator, ...args: Parameters<Navigator['requestMediaKeySystemAccess']>) {
      if (!reported) {
        reported = true;
        post({ kind: 'eme' });
      }
      return origEme.apply(this, args);
    };
  }
})();
