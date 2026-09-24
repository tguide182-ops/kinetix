import type { BackgroundPush, Result, UiToBackground } from '../types';

/** Typed request/response to the background service worker. */
export async function request<T>(msg: UiToBackground): Promise<Result<T>> {
  try {
    const res = (await chrome.runtime.sendMessage(msg)) as Result<T> | undefined;
    return res ?? { ok: false, errorCode: 'INTERNAL', message: 'No response from MediaForge.' };
  } catch {
    return { ok: false, errorCode: 'INTERNAL', message: 'MediaForge is restarting. Please try again.' };
  }
}

/** Live updates (downloads, tab media) over a long-lived port; reconnects if the worker restarts. */
export function subscribe(onMessage: (m: BackgroundPush) => void): () => void {
  let port: chrome.runtime.Port | undefined;
  let closed = false;
  const connect = (): void => {
    port = chrome.runtime.connect({ name: 'mf-ui' });
    port.onMessage.addListener((m: BackgroundPush) => onMessage(m));
    port.onDisconnect.addListener(() => {
      port = undefined;
      if (!closed) setTimeout(connect, 500);
    });
  };
  connect();
  return () => {
    closed = true;
    port?.disconnect();
  };
}
