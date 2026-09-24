// Validates dist/: manifest structure, referenced files, minimal permissions,
// no remote code, and well-formed icons. Exits non-zero on any problem.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const errors = [];
const ok = (msg) => console.log(`  ✓ ${msg}`);
const fail = (msg) => errors.push(msg);

if (!existsSync(join(dist, 'manifest.json'))) {
  console.error('dist/manifest.json not found — run `npm run build` first.');
  process.exit(1);
}
const m = JSON.parse(readFileSync(join(dist, 'manifest.json'), 'utf8'));

// --- structure ---
if (m.manifest_version !== 3) fail('manifest_version must be 3');
for (const k of ['name', 'version', 'description', 'icons', 'action', 'background']) if (!m[k]) fail(`missing "${k}"`);
if (!/^\d+(\.\d+){0,3}$/.test(m.version ?? '')) fail(`invalid version "${m.version}"`);
if ((m.description ?? '').length > 132) fail('description exceeds 132 characters');
if (!m.background?.service_worker) fail('background.service_worker missing');
if ('browser_action' in m || 'page_action' in m || m.background?.scripts || m.background?.persistent !== undefined) fail('Manifest V2 keys present');
ok('Manifest V3 structure');

// --- permissions ---
const ALLOWED = new Set(['storage', 'downloads', 'webRequest', 'contextMenus', 'offscreen', 'notifications']);
const FORBIDDEN = ['webRequestBlocking', 'cookies', 'history', 'tabs', 'debugger', 'management', 'proxy', 'privacy', 'nativeMessaging', 'scripting', 'declarativeNetRequest', 'declarativeNetRequestWithHostAccess', 'webNavigation', 'clipboardRead', '<all_urls>'];
for (const p of m.permissions ?? []) {
  if (!ALLOWED.has(p)) fail(`unexpected permission "${p}"`);
  if (FORBIDDEN.includes(p)) fail(`forbidden permission "${p}"`);
}
for (const h of m.host_permissions ?? []) if (!['http://*/*', 'https://*/*'].includes(h)) fail(`unexpected host permission "${h}"`);
if (m.optional_permissions?.length) fail('unexpected optional permissions');
ok(`permissions: ${(m.permissions ?? []).join(', ')}; hosts: ${(m.host_permissions ?? []).join(', ')}`);

// --- CSP ---
const csp = m.content_security_policy?.extension_pages ?? '';
if (!/script-src 'self'/.test(csp) || /unsafe-eval|unsafe-inline|https?:/.test(csp)) fail(`weak extension_pages CSP: "${csp}"`);
ok('strict extension CSP');

// --- referenced files ---
const referenced = new Set([
  m.background.service_worker,
  m.action?.default_popup,
  m.options_ui?.page,
  ...Object.values(m.icons ?? {}),
  ...Object.values(m.action?.default_icon ?? {}),
  ...(m.content_scripts ?? []).flatMap((c) => [...(c.js ?? []), ...(c.css ?? [])]),
  'offscreen/offscreen.html',
  'manager/manager.html',
]);
for (const f of referenced) if (f && !existsSync(join(dist, f))) fail(`referenced file missing: ${f}`);
// Files referenced from HTML pages.
for (const html of ['popup/popup.html', 'options/options.html', 'manager/manager.html', 'offscreen/offscreen.html']) {
  const text = readFileSync(join(dist, html), 'utf8');
  for (const [, ref] of text.matchAll(/(?:src|href)="([^"]+)"/g)) {
    if (/^https?:/.test(ref)) fail(`${html} loads remote resource ${ref}`);
    else if (!existsSync(join(dist, dirname(html), ref))) fail(`${html} references missing ${ref}`);
  }
  if (/<script(?![^>]*src=)[^>]*>/.test(text)) fail(`${html} contains an inline script`);
}
ok(`${referenced.size} referenced files present`);

// --- content scripts ---
for (const cs of m.content_scripts ?? []) {
  if ((cs.matches ?? []).some((x) => !/^https?:\/\/\*\/\*$/.test(x))) fail(`content script matches too broad/unexpected: ${cs.matches}`);
}
const mainWorld = (m.content_scripts ?? []).filter((c) => c.world === 'MAIN');
if (mainWorld.length !== 1) fail('expected exactly one MAIN-world content script (the hook)');
ok('content scripts restricted to http/https');

// --- icons ---
for (const [size, file] of Object.entries(m.icons)) {
  const buf = readFileSync(join(dist, file));
  const sig = buf.subarray(0, 8).toString('hex');
  if (sig !== '89504e470d0a1a0a') fail(`${file} is not a PNG`);
  const w = buf.readUInt32BE(16);
  const h = buf.readUInt32BE(20);
  if (w !== Number(size) || h !== Number(size)) fail(`${file} is ${w}x${h}, expected ${size}x${size}`);
}
ok('icons are valid PNGs with correct dimensions');

// --- no remote code / eval ---
function walk(dir) {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}
const js = walk(dist).filter((f) => f.endsWith('.js'));
for (const f of js) {
  const text = readFileSync(f, 'utf8');
  if (/\beval\s*\(|new\s+Function\s*\(/.test(text)) fail(`${f.slice(dist.length + 1)} uses eval/new Function`);
  if (/importScripts\s*\(\s*['"]https?:|import\s*\(\s*['"]https?:/.test(text)) fail(`${f.slice(dist.length + 1)} loads remote code`);
  if (/\.innerHTML\s*=|insertAdjacentHTML|document\.write\s*\(/.test(text)) fail(`${f.slice(dist.length + 1)} writes HTML strings`);
}
ok(`${js.length} scripts free of eval, remote code and HTML-string injection`);

const total = walk(dist).reduce((s, f) => s + statSync(f).size, 0);
ok(`package size ${(total / 1024).toFixed(1)} KB`);

if (errors.length) {
  console.error('\nManifest verification FAILED:');
  for (const e of errors) console.error(`  ✗ ${e}`);
  process.exit(1);
}
console.log('\nManifest verification passed.');
