import type { BackgroundToOffscreen } from '../types';
import { createLogger } from '../utils/logger';

const log = createLogger('offscreen-client');
const OFFSCREEN_PATH = 'offscreen/offscreen.html';

let creating: Promise<void> | undefined;

async function hasDocument(): Promise<boolean> {
  const url = chrome.runtime.getURL(OFFSCREEN_PATH);
  if ('getContexts' in chrome.runtime) {
    const ctx = await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT' as chrome.runtime.ContextType], documentUrls: [url] });
    return ctx.length > 0;
  }
  return false;
}

/**
 * The offscreen document downloads and assembles stream segments. It exists
 * because MV3 service workers cannot create blob: URLs for chrome.downloads.
 */
export async function ensureOffscreen(): Promise<void> {
  if (await hasDocument()) return;
  creating ??= chrome.offscreen
    .createDocument({
      url: OFFSCREEN_PATH,
      reasons: ['BLOBS' as chrome.offscreen.Reason],
      justification: 'Assemble downloaded HLS/DASH segments into a file the user asked to save.',
    })
    .catch((e: unknown) => {
      // A concurrent caller may have created it first.
      if (!String(e).includes('Only a single offscreen')) throw e;
    })
    .finally(() => {
      creating = undefined;
    });
  await creating;
}

export async function closeOffscreen(): Promise<void> {
  try {
    if (await hasDocument()) await chrome.offscreen.closeDocument();
  } catch (e) {
    log.debug('closeDocument failed', e);
  }
}

export async function sendToOffscreen(msg: BackgroundToOffscreen): Promise<void> {
  await chrome.runtime.sendMessage(msg);
}
