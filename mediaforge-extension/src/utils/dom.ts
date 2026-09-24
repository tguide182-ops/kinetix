/**
 * Tiny, safe DOM builder. Text is always assigned via textContent and
 * attributes via setAttribute with an allow-list, so untrusted page data can
 * never become markup or script. innerHTML is intentionally never used.
 */
type Child = Node | string | number | null | undefined | false;

export interface Props {
  class?: string;
  text?: string;
  title?: string;
  role?: string;
  id?: string;
  type?: string;
  value?: string;
  name?: string;
  for?: string;
  placeholder?: string;
  checked?: boolean;
  disabled?: boolean;
  selected?: boolean;
  hidden?: boolean;
  tabIndex?: number;
  src?: string;
  alt?: string;
  min?: string;
  max?: string;
  aria?: Record<string, string>;
  data?: Record<string, string>;
  style?: Partial<Record<'width' | 'height' | 'display', string>>;
  on?: Partial<{ [K in keyof HTMLElementEventMap]: (ev: HTMLElementEventMap[K]) => void }>;
}

const SAFE_ATTRS = ['title', 'role', 'id', 'type', 'name', 'for', 'placeholder', 'alt', 'min', 'max'] as const;

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, props: Props = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (props.class) el.className = props.class;
  for (const attr of SAFE_ATTRS) {
    const v = props[attr];
    if (v !== undefined) el.setAttribute(attr, String(v));
  }
  if (props.src !== undefined) {
    // Only http(s)/data:image sources for images; callers must validate first.
    if (/^(https?:|data:image\/)/i.test(props.src)) el.setAttribute('src', props.src);
  }
  if (props.value !== undefined && 'value' in el) (el as HTMLInputElement).value = props.value;
  if (props.checked !== undefined && 'checked' in el) (el as HTMLInputElement).checked = props.checked;
  if (props.disabled !== undefined && 'disabled' in el) (el as HTMLButtonElement).disabled = props.disabled;
  if (props.selected !== undefined && 'selected' in el) (el as HTMLOptionElement).selected = props.selected;
  if (props.hidden) el.hidden = true;
  if (props.tabIndex !== undefined) el.tabIndex = props.tabIndex;
  if (props.aria) for (const [k, v] of Object.entries(props.aria)) el.setAttribute(`aria-${k.replace(/[^a-z-]/g, '')}`, v);
  if (props.data) for (const [k, v] of Object.entries(props.data)) el.dataset[k.replace(/[^a-zA-Z0-9]/g, '')] = v;
  if (props.style) for (const [k, v] of Object.entries(props.style)) if (v !== undefined) el.style.setProperty(k, v);
  if (props.on) {
    for (const [evt, handler] of Object.entries(props.on)) {
      if (handler) el.addEventListener(evt, handler as EventListener);
    }
  }
  if (props.text !== undefined) el.textContent = props.text;
  append(el, children);
  return el;
}

export function append(parent: Node, children: Child[]): void {
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    parent.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
  }
}

export function clear(el: Node): void {
  while (el.firstChild) el.removeChild(el.firstChild);
}

/** Apply the theme preference to <html data-theme>. */
export function applyTheme(theme: 'system' | 'dark' | 'light', root: HTMLElement = document.documentElement): void {
  const resolved = theme === 'system' ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : theme;
  root.dataset.theme = resolved;
}
