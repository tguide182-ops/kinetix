import { errorFromInterruptReason, MediaForgeError } from '../utils/errors';

type Waiter = { resolve: () => void; reject: (e: MediaForgeError) => void };
const waiters = new Map<number, Waiter>();

/** Must be called synchronously at service-worker start-up. */
export function installDownloadWatcher(): void {
  chrome.downloads.onChanged.addListener((delta) => {
    const w = waiters.get(delta.id);
    if (!w || !delta.state) return;
    if (delta.state.current === 'complete') {
      waiters.delete(delta.id);
      w.resolve();
    } else if (delta.state.current === 'interrupted') {
      waiters.delete(delta.id);
      void chrome.downloads.search({ id: delta.id }).then(([item]) => w.reject(errorFromInterruptReason(item?.error ?? delta.error?.current)));
    }
  });
}

/** Resolve when Chrome finishes the download; reject with a mapped error on interruption. */
export function waitForDownload(id: number, signal?: AbortSignal): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const onAbort = (): void => {
      waiters.delete(id);
      void chrome.downloads.cancel(id).catch(() => {});
      reject(new MediaForgeError('CANCELLED'));
    };
    if (signal?.aborted) return onAbort();
    signal?.addEventListener('abort', onAbort, { once: true });
    waiters.set(id, {
      resolve: () => {
        signal?.removeEventListener('abort', onAbort);
        resolve();
      },
      reject: (e) => {
        signal?.removeEventListener('abort', onAbort);
        reject(e);
      },
    });
    // The download may already have finished before we started listening.
    void chrome.downloads.search({ id }).then(([item]) => {
      if (!waiters.has(id) || !item) return;
      if (item.state === 'complete') waiters.get(id)!.resolve();
      else if (item.state === 'interrupted') waiters.get(id)!.reject(errorFromInterruptReason(item.error));
      else return;
      waiters.delete(id);
    });
  });
}

export async function startChromeDownload(opts: { url: string; filename: string; saveAs: boolean }): Promise<number> {
  try {
    return await chrome.downloads.download({ url: opts.url, filename: opts.filename, conflictAction: 'uniquify', saveAs: opts.saveAs });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/filename/i.test(msg)) throw new MediaForgeError('FILE_ERROR', { detail: msg });
    throw new MediaForgeError('ACCESS_DENIED', { detail: msg });
  }
}
