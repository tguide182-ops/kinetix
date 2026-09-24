import type { MediaResource, Result } from '../types';
import { formatBytes } from '../utils/format';
import { displayQuality } from '../utils/quality';
import { h, clear } from '../utils/dom';
import { mediaDisplayTitle, mediaTypeLabel } from '../ui/labels';

const STYLE = `
:host { all: initial; }
.mf { position: fixed; right: 16px; bottom: 16px; z-index: 2147483646; width: 330px; max-width: calc(100vw - 32px);
  font: 13px/1.4 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; color: #e8e8f0; background: #16161d;
  border: 1px solid #2c2c3a; border-radius: 12px; box-shadow: 0 8px 28px rgba(0,0,0,.35); overflow: hidden; }
.mf.min { width: auto; }
header { display: flex; align-items: center; gap: 8px; padding: 8px 10px; background: #1d1d27; }
.brand { font-weight: 700; letter-spacing: .06em; font-size: 12px; }
.count { color: #a5a5b8; font-size: 12px; flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
button { font: inherit; color: inherit; background: none; border: 0; cursor: pointer; border-radius: 6px; padding: 4px 6px; }
button:hover { background: #2a2a38; }
button:focus-visible { outline: 2px solid #8b7dff; outline-offset: 1px; }
.icon { width: 24px; height: 24px; padding: 0; font-size: 15px; line-height: 24px; }
ul { list-style: none; margin: 0; padding: 4px 0; max-height: 260px; overflow: auto; }
li { display: flex; align-items: center; gap: 8px; padding: 6px 10px; }
.meta { flex: 1; min-width: 0; }
.title { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.sub { color: #a5a5b8; font-size: 11px; }
.dl { background: #6d5dfc; color: #fff; padding: 4px 10px; font-weight: 600; }
.dl:hover { background: #5b4be8; }
.dl:disabled { background: #3a3a4a; color: #9a9aad; cursor: default; }
.status { font-size: 11px; color: #a5a5b8; padding: 0 10px 6px; min-height: 0; }
footer { display: flex; justify-content: space-between; padding: 6px 10px; border-top: 1px solid #2c2c3a; }
footer button { font-size: 12px; color: #a5a5b8; }
@media (prefers-color-scheme: light) {
  .mf { background: #fff; color: #1b1b26; border-color: #dedee8; box-shadow: 0 8px 28px rgba(20,20,40,.18); }
  header { background: #f4f4f9; }
  .count, .sub, .status, footer button { color: #5d5d72; }
  button:hover { background: #e9e9f2; }
  footer { border-color: #e6e6ef; }
}
@media (prefers-reduced-motion: no-preference) { .mf { transition: opacity .15s ease; } }
`;

export interface PanelActions {
  download(mediaId: string): Promise<Result<unknown>>;
  disableOnSite(): void;
  openManager(): void;
}

function summary(media: MediaResource[]): string {
  const videos = media.filter((m) => m.type === 'video' || m.type === 'hls' || m.type === 'dash').length;
  const audio = media.filter((m) => m.type === 'audio').length;
  const parts: string[] = [];
  if (videos) parts.push(`${videos} video${videos === 1 ? '' : 's'}`);
  if (audio) parts.push(`${audio} audio stream${audio === 1 ? '' : 's'}`);
  return parts.join(' · ') || 'No media';
}

function describe(m: MediaResource): string {
  return [displayQuality(m.qualityLabel), mediaTypeLabel(m), formatBytes(m.size)].filter(Boolean).join(' • ');
}

/** Optional in-page panel. Lives in a closed shadow root so page CSS/JS cannot restyle or read it. */
export class FloatingPanel {
  private host: HTMLElement;
  private root: ShadowRoot;
  private box: HTMLDivElement;
  private minimized = false;
  private media: MediaResource[] = [];

  constructor(private readonly actions: PanelActions) {
    this.host = document.createElement('mediaforge-panel');
    this.root = this.host.attachShadow({ mode: 'closed' });
    const style = document.createElement('style');
    style.textContent = STYLE;
    this.box = h('div', { class: 'mf', role: 'region', aria: { label: 'MediaForge detected media' } });
    this.root.append(style, this.box);
    (document.body ?? document.documentElement).appendChild(this.host);
  }

  update(media: MediaResource[]): void {
    this.media = media.filter((m) => !m.isProtected);
    if (!this.media.length) {
      this.host.style.display = 'none';
      return;
    }
    this.host.style.display = '';
    this.render();
  }

  destroy(): void {
    this.host.remove();
  }

  private render(): void {
    clear(this.box);
    this.box.classList.toggle('min', this.minimized);
    const header = h(
      'header',
      {},
      h('span', { class: 'brand', text: 'MEDIAFORGE' }),
      h('span', { class: 'count', text: this.minimized ? String(this.media.length) : summary(this.media), title: summary(this.media) }),
      h('button', {
        class: 'icon',
        title: this.minimized ? 'Expand' : 'Minimize',
        aria: { label: this.minimized ? 'Expand panel' : 'Minimize panel', expanded: String(!this.minimized) },
        text: this.minimized ? '▴' : '▾',
        on: { click: () => ((this.minimized = !this.minimized), this.render()) },
      }),
      h('button', { class: 'icon', title: 'Close', aria: { label: 'Close panel' }, text: '×', on: { click: () => this.destroy() } }),
    );
    this.box.append(header);
    if (this.minimized) return;

    const status = h('div', { class: 'status', role: 'status', aria: { live: 'polite' } });
    const list = h('ul');
    for (const m of this.media.slice(0, 20)) {
      const btn = h('button', { class: 'dl', text: 'Download', aria: { label: `Download ${mediaDisplayTitle(m)}` } });
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        status.textContent = 'Starting download…';
        const r = await this.actions.download(m.id).catch(() => ({ ok: false, message: 'Something went wrong.' }) as Result<unknown>);
        status.textContent = r.ok ? 'Added to downloads.' : r.message;
        btn.disabled = false;
      });
      list.append(
        h('li', {}, h('div', { class: 'meta' }, h('div', { class: 'title', text: mediaDisplayTitle(m), title: mediaDisplayTitle(m) }), h('div', { class: 'sub', text: describe(m) })), btn),
      );
    }
    const footer = h(
      'footer',
      {},
      h('button', { text: 'Disable on this site', on: { click: () => this.actions.disableOnSite() } }),
      h('button', { text: 'Download manager', on: { click: () => this.actions.openManager() } }),
    );
    this.box.append(list, status, footer);
  }
}
