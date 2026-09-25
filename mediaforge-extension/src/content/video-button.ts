import type { Result, VideoOption, VideoOptionsResponse } from '../types';
import { clear, h } from '../utils/dom';
import { formatBytes } from '../utils/format';
import { isHttpUrl } from '../utils/url';

const STYLE = `
:host { all: initial; }
.wrap { position: fixed; z-index: 2147483646; font: 13px/1.35 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; display: none; }
.wrap.show { display: block; }
.btn { display: inline-flex; align-items: center; gap: 6px; padding: 7px 12px; border: 0; border-radius: 999px; cursor: pointer;
  background: rgba(18, 18, 26, 0.86); color: #fff; font: inherit; font-weight: 700; letter-spacing: .01em;
  box-shadow: 0 2px 10px rgba(0,0,0,.35); opacity: .82; }
.btn:hover, .btn[aria-expanded="true"], .btn:focus-visible { opacity: 1; background: #6d5dfc; }
.btn:focus-visible, .opt:focus-visible, .link:focus-visible { outline: 2px solid #b3a9ff; outline-offset: 2px; }
.arrow { font-size: 14px; }
.menu { position: absolute; right: 0; top: calc(100% + 6px); width: 290px; max-height: 340px; overflow: auto; border-radius: 12px;
  background: #16161d; color: #ececf4; border: 1px solid #2c2c3a; box-shadow: 0 10px 30px rgba(0,0,0,.45); padding: 6px; }
.menu[hidden] { display: none; }
.head { padding: 6px 8px 8px; font-size: 11px; letter-spacing: .08em; text-transform: uppercase; color: #9a9ab0; }
.opt { width: 100%; display: flex; align-items: center; gap: 10px; padding: 9px 10px; border: 0; border-radius: 8px; background: none;
  color: inherit; font: inherit; cursor: pointer; text-align: left; }
.opt:hover { background: #24243a; }
.q { font-weight: 700; min-width: 64px; }
.d { flex: 1; color: #a9a9bd; font-size: 12px; min-width: 0; }
.src { display: block; color: #7d7d95; font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.s { font-weight: 600; font-variant-numeric: tabular-nums; }
.s.unknown { color: #83839a; font-weight: 400; font-size: 12px; }
.msg { padding: 10px; color: #c9c9da; }
.msg.err { color: #ff8a9a; }
.msg.ok { color: #6fdca6; }
.foot { display: flex; justify-content: flex-end; border-top: 1px solid #2c2c3a; margin-top: 4px; padding-top: 4px; }
.link { border: 0; background: none; color: #9a9ab0; font: inherit; font-size: 12px; cursor: pointer; padding: 6px 8px; border-radius: 6px; }
.link:hover { color: #fff; background: #24243a; }
`;

const MIN_WIDTH = 200;
const MIN_HEIGHT = 112;

export interface VideoButtonActions {
  getOptions(src?: string): Promise<VideoOptionsResponse>;
  download(mediaId: string, quality: string): Promise<Result<unknown>>;
  hideOnPage(): void;
}

/**
 * A small "Download" pill pinned to the top-right corner of the largest
 * visible video. Clicking it lists the available qualities with sizes.
 * Positioning is event-driven (scroll/resize/fullscreen/ResizeObserver), no polling.
 */
export class VideoButton {
  private host = document.createElement('mediaforge-video-button');
  private root: ShadowRoot;
  private wrap: HTMLDivElement;
  private btn: HTMLButtonElement;
  private menu: HTMLDivElement;
  private target: HTMLVideoElement | null = null;
  private frame = 0;
  private resizeObs = new ResizeObserver(() => this.schedule());
  private closeTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(private readonly actions: VideoButtonActions) {
    this.root = this.host.attachShadow({ mode: 'closed' });
    const style = document.createElement('style');
    style.textContent = STYLE;
    this.btn = h('button', { class: 'btn', type: 'button', aria: { haspopup: 'menu', expanded: 'false', label: 'Download this video with MediaForge' } }, h('span', { class: 'arrow', text: '⬇' }), 'Download');
    this.menu = h('div', { class: 'menu', role: 'menu', hidden: true });
    this.wrap = h('div', { class: 'wrap' }, this.btn, this.menu);
    this.root.append(style, this.wrap);
    (document.body ?? document.documentElement).appendChild(this.host);

    this.btn.addEventListener('click', () => (this.menu.hidden ? void this.open() : this.close()));
    this.wrap.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.close();
        this.btn.focus();
      }
    });
    window.addEventListener('scroll', this.schedule, { capture: true, passive: true });
    window.addEventListener('resize', this.schedule, { passive: true });
    document.addEventListener('fullscreenchange', this.onFullscreen);
    document.addEventListener('loadedmetadata', this.schedule, true);
    document.addEventListener('play', this.schedule, true);
    document.addEventListener('pointerdown', this.onOutside, true);
    this.schedule();
  }

  destroy(): void {
    cancelAnimationFrame(this.frame);
    this.resizeObs.disconnect();
    window.removeEventListener('scroll', this.schedule, { capture: true });
    window.removeEventListener('resize', this.schedule);
    document.removeEventListener('fullscreenchange', this.onFullscreen);
    document.removeEventListener('loadedmetadata', this.schedule, true);
    document.removeEventListener('play', this.schedule, true);
    document.removeEventListener('pointerdown', this.onOutside, true);
    this.host.remove();
  }

  /** Re-evaluate which video to attach to (called when new media appears). */
  refresh(): void {
    this.schedule();
  }

  private readonly schedule = (): void => {
    if (this.frame) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      this.position();
    });
  };

  private readonly onFullscreen = (): void => {
    // Elements outside the fullscreen element are not rendered; move inside it when possible.
    const fs = document.fullscreenElement;
    const parent = fs && !(fs instanceof HTMLVideoElement) ? fs : document.body ?? document.documentElement;
    if (this.host.parentNode !== parent) parent.appendChild(this.host);
    this.schedule();
  };

  private readonly onOutside = (e: Event): void => {
    if (!this.menu.hidden && !e.composedPath().includes(this.host)) this.close();
  };

  private pickVideo(): HTMLVideoElement | null {
    let best: HTMLVideoElement | null = null;
    let bestArea = 0;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    for (const v of Array.from(document.getElementsByTagName('video'))) {
      const r = v.getBoundingClientRect();
      if (r.width < MIN_WIDTH || r.height < MIN_HEIGHT) continue;
      const visW = Math.min(r.right, vw) - Math.max(r.left, 0);
      const visH = Math.min(r.bottom, vh) - Math.max(r.top, 0);
      if (visW < MIN_WIDTH / 2 || visH < MIN_HEIGHT / 2) continue;
      const style = getComputedStyle(v);
      if (style.visibility === 'hidden' || style.display === 'none' || Number(style.opacity) === 0) continue;
      const area = visW * visH;
      if (area > bestArea) {
        best = v;
        bestArea = area;
      }
    }
    return best;
  }

  private position(): void {
    const v = this.pickVideo();
    if (v !== this.target) {
      if (this.target) this.resizeObs.unobserve(this.target);
      this.target = v;
      if (v) this.resizeObs.observe(v);
      if (!v) this.close();
    }
    if (!v) {
      this.wrap.classList.remove('show');
      return;
    }
    const r = v.getBoundingClientRect();
    const top = Math.max(r.top, 0) + 10;
    const right = Math.max(window.innerWidth - Math.min(r.right, window.innerWidth), 0) + 10;
    this.wrap.style.top = `${Math.round(top)}px`;
    this.wrap.style.right = `${Math.round(right)}px`;
    this.wrap.classList.add('show');
  }

  private close(): void {
    this.menu.hidden = true;
    this.btn.setAttribute('aria-expanded', 'false');
    clearTimeout(this.closeTimer);
  }

  private async open(): Promise<void> {
    this.menu.hidden = false;
    this.btn.setAttribute('aria-expanded', 'true');
    clear(this.menu);
    this.menu.append(h('div', { class: 'msg', text: 'Finding available qualities…' }));
    const src = this.target?.currentSrc;
    const res = await this.actions.getOptions(src && isHttpUrl(src) ? src : undefined).catch(() => ({ options: [], message: 'MediaForge is unavailable. Reload the page.' }) as VideoOptionsResponse);
    if (this.menu.hidden) return;
    this.renderOptions(res);
  }

  private renderOptions(res: VideoOptionsResponse): void {
    clear(this.menu);
    if (!res.options.length) {
      this.menu.append(h('div', { class: 'msg', text: res.message ?? 'No downloadable video found.' }));
    } else {
      this.menu.append(h('div', { class: 'head', text: 'Choose quality' }));
      for (const o of res.options) this.menu.append(this.optionRow(o));
    }
    this.menu.append(h('div', { class: 'foot' }, h('button', { class: 'link', type: 'button', text: 'Hide button on this page', on: { click: () => this.actions.hideOnPage() } })));
    (this.menu.querySelector('.opt') as HTMLElement | null)?.focus();
  }

  private optionRow(o: VideoOption): HTMLButtonElement {
    const size = o.size ? formatBytes(o.size, o.approximate) : 'Size unknown';
    const row = h(
      'button',
      { class: 'opt', type: 'button', role: 'menuitem', aria: { label: `Download ${o.label}, ${o.detail}${o.source ? `, ${o.source}` : ''}, ${size}` } },
      h('span', { class: 'q', text: o.label }),
      h('span', { class: 'd' }, o.detail, o.source ? h('span', { class: 'src', text: o.source }) : null),
      h('span', { class: `s ${o.size ? '' : 'unknown'}`, text: size }),
    );
    row.addEventListener('click', async () => {
      clear(this.menu);
      this.menu.append(h('div', { class: 'msg', text: `Starting ${o.label} download…` }));
      const r = await this.actions.download(o.mediaId, o.quality).catch(() => ({ ok: false, errorCode: 'INTERNAL', message: 'Something went wrong.' }) as Result<unknown>);
      clear(this.menu);
      this.menu.append(h('div', { class: `msg ${r.ok ? 'ok' : 'err'}`, text: r.ok ? '✓ Added to downloads' : r.message }));
      this.closeTimer = setTimeout(() => this.close(), r.ok ? 1800 : 4000);
    });
    return row;
  }
}
