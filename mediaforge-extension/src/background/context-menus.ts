export const MENU = {
  video: 'mf-download-video',
  audio: 'mf-download-audio',
  link: 'mf-download-link',
  page: 'mf-scan-page',
} as const;

const MEDIA_LINK_PATTERNS = ['mp4', 'webm', 'mov', 'm4v', 'ogv', 'ogg', 'mp3', 'aac', 'm4a', 'wav', 'flac', 'opus', 'm3u8', 'mpd'].flatMap((ext) => [
  `*://*/*.${ext}`,
  `*://*/*.${ext}?*`,
  `*://*/*.${ext.toUpperCase()}`,
]);

/** Menus persist across browser sessions, so they are (re)created on install/update. */
export function createContextMenus(): void {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: MENU.video, title: 'Download video with MediaForge', contexts: ['video'] });
    chrome.contextMenus.create({ id: MENU.audio, title: 'Download audio with MediaForge', contexts: ['audio'] });
    chrome.contextMenus.create({ id: MENU.link, title: 'Download media with MediaForge', contexts: ['link'], targetUrlPatterns: MEDIA_LINK_PATTERNS });
    chrome.contextMenus.create({ id: MENU.page, title: 'Scan page for media', contexts: ['page'] });
  });
}
