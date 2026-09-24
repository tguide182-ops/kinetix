/**
 * Minimal non-validating XML parser for DASH manifests.
 *
 * MV3 service workers have no DOMParser, so we parse MPDs ourselves. The
 * parser only builds a plain object tree: no DTDs, no external entities, no
 * entity expansion beyond the five predefined entities and numeric references
 * (so "billion laughs"/XXE style inputs are inert). Namespace prefixes are
 * stripped from element and attribute names ("cenc:pssh" → "pssh").
 */
export interface XmlElement {
  name: string;
  attrs: Record<string, string>;
  children: XmlElement[];
  text: string;
}

export class XmlParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'XmlParseError';
  }
}

const MAX_INPUT = 20 * 1024 * 1024;
const MAX_DEPTH = 64;
const MAX_ELEMENTS = 500_000;

function localName(qname: string): string {
  const i = qname.indexOf(':');
  return i >= 0 ? qname.slice(i + 1) : qname;
}

export function decodeEntities(s: string): string {
  if (!s.includes('&')) return s;
  return s.replace(/&(#x[0-9a-f]+|#[0-9]+|amp|lt|gt|quot|apos);/gi, (_, e: string) => {
    const lower = e.toLowerCase();
    if (lower === 'amp') return '&';
    if (lower === 'lt') return '<';
    if (lower === 'gt') return '>';
    if (lower === 'quot') return '"';
    if (lower === 'apos') return "'";
    const code = lower.startsWith('#x') ? parseInt(lower.slice(2), 16) : parseInt(lower.slice(1), 10);
    return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '';
  });
}

const ATTR_RE = /([^\s=/>]+)\s*=\s*("([^"]*)"|'([^']*)')/g;

export function parseXml(input: string): XmlElement {
  if (typeof input !== 'string') throw new XmlParseError('Input is not a string');
  if (input.length > MAX_INPUT) throw new XmlParseError('Document too large');
  const src = input.replace(/^﻿/, '');
  const root: XmlElement = { name: '#document', attrs: {}, children: [], text: '' };
  const stack: XmlElement[] = [root];
  let i = 0;
  let count = 0;

  while (i < src.length) {
    const lt = src.indexOf('<', i);
    const current = stack[stack.length - 1]!;
    if (lt === -1) {
      current.text += decodeEntities(src.slice(i));
      break;
    }
    if (lt > i) current.text += decodeEntities(src.slice(i, lt));

    if (src.startsWith('<!--', lt)) {
      const end = src.indexOf('-->', lt + 4);
      if (end === -1) throw new XmlParseError('Unterminated comment');
      i = end + 3;
    } else if (src.startsWith('<![CDATA[', lt)) {
      const end = src.indexOf(']]>', lt + 9);
      if (end === -1) throw new XmlParseError('Unterminated CDATA');
      current.text += src.slice(lt + 9, end);
      i = end + 3;
    } else if (src.startsWith('<?', lt)) {
      const end = src.indexOf('?>', lt + 2);
      if (end === -1) throw new XmlParseError('Unterminated processing instruction');
      i = end + 2;
    } else if (src.startsWith('<!', lt)) {
      // DOCTYPE and other declarations are skipped; internal subsets are rejected.
      const end = src.indexOf('>', lt + 2);
      if (end === -1) throw new XmlParseError('Unterminated declaration');
      if (src.slice(lt, end).includes('[')) throw new XmlParseError('DTD internal subsets are not supported');
      i = end + 1;
    } else if (src[lt + 1] === '/') {
      const end = src.indexOf('>', lt + 2);
      if (end === -1) throw new XmlParseError('Unterminated closing tag');
      const name = localName(src.slice(lt + 2, end).trim());
      if (stack.length <= 1 || current.name !== name) throw new XmlParseError(`Unexpected closing tag </${name}>`);
      current.text = current.text.trim();
      stack.pop();
      i = end + 1;
    } else {
      // Find the end of the tag, respecting quoted attribute values.
      let j = lt + 1;
      let quote: string | null = null;
      for (; j < src.length; j++) {
        const c = src[j];
        if (quote) {
          if (c === quote) quote = null;
        } else if (c === '"' || c === "'") quote = c;
        else if (c === '>') break;
      }
      if (j >= src.length) throw new XmlParseError('Unterminated tag');
      let body = src.slice(lt + 1, j);
      const selfClosing = body.endsWith('/');
      if (selfClosing) body = body.slice(0, -1);
      const nameMatch = /^([^\s/>]+)/.exec(body);
      if (!nameMatch) throw new XmlParseError('Invalid tag');
      const el: XmlElement = { name: localName(nameMatch[1]!), attrs: {}, children: [], text: '' };
      ATTR_RE.lastIndex = 0;
      const attrSrc = body.slice(nameMatch[1]!.length);
      let m: RegExpExecArray | null;
      while ((m = ATTR_RE.exec(attrSrc))) {
        const key = m[1]!;
        if (key.startsWith('xmlns')) continue;
        el.attrs[localName(key)] = decodeEntities(m[3] ?? m[4] ?? '');
      }
      if (++count > MAX_ELEMENTS) throw new XmlParseError('Too many elements');
      current.children.push(el);
      if (!selfClosing) {
        if (stack.length > MAX_DEPTH) throw new XmlParseError('Document nested too deeply');
        stack.push(el);
      }
      i = j + 1;
    }
  }
  if (stack.length !== 1) throw new XmlParseError(`Unclosed element <${stack[stack.length - 1]!.name}>`);
  root.text = root.text.trim();
  if (!root.children.length) throw new XmlParseError('No root element');
  return root;
}

export function child(el: XmlElement, name: string): XmlElement | undefined {
  return el.children.find((c) => c.name === name);
}

export function childrenNamed(el: XmlElement, name: string): XmlElement[] {
  return el.children.filter((c) => c.name === name);
}
