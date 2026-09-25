// End-to-end smoke test: loads dist/ into Chromium and exercises detection,
// analysis, downloads, UI pages, SPA handling and exclusions against a local
// fixture site. Requires Playwright (not a dependency — see README):
//   npm i -D playwright && npx playwright install chromium && npm run e2e
// Set PLAYWRIGHT_MODULE=/path/to/node_modules/playwright to use a global install
// and SHOTS=<dir> to save screenshots.
import { createRequire } from 'node:module';
import { mkdtempSync, readdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { start } from './fixture-server.mjs';

async function loadPlaywright() {
  if (process.env.PLAYWRIGHT_MODULE) return createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE);
  try {
    return await import('playwright');
  } catch {
    console.error('Playwright not found. Install it with `npm i -D playwright && npx playwright install chromium`, or set PLAYWRIGHT_MODULE.');
    process.exit(2);
  }
}
const { chromium } = await loadPlaywright();
const EXT = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const shots = process.env.SHOTS;
const shot = (p, name) => (shots ? p.screenshot({ path: join(shots, name), fullPage: true }) : Promise.resolve());

const { server, port, hits } = await start();
const base = `http://127.0.0.1:${port}`;
const userData = mkdtempSync(join(tmpdir(), 'mf-'));
const downloadsDir = mkdtempSync(join(tmpdir(), 'mf-dl-'));
const ctx = await chromium.launchPersistentContext(userData, {
  channel: 'chromium',
  headless: true,
  acceptDownloads: true,
  downloadsPath: downloadsDir,
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
});
let [sw] = ctx.serviceWorkers();
sw ??= await ctx.waitForEvent('serviceworker');
const extId = new URL(sw.url()).host;
console.log('extension id', extId);

const results = [];
const check = (name, cond, extra = '') => { results.push([name, !!cond]); console.log(`${cond ? 'PASS' : 'FAIL'} ${name} ${extra}`); };

const page = await ctx.newPage();
page.on('console', (m) => { if (m.type() === 'error') console.log('[page error]', m.text()); });
await page.goto(`${base}/index.html`);
await page.waitForTimeout(2500);

// Find the tab id via an extension page.
const ui = await ctx.newPage();
await ui.goto(`chrome-extension://${extId}/manager/manager.html`);
const tabId = await ui.evaluate(async (u) => (await chrome.tabs.query({})).find((t) => t.url?.startsWith(u))?.id, base);
const send = (msg) => ui.evaluate((m) => chrome.runtime.sendMessage(m), msg);

let r = await send({ type: 'GET_TAB_MEDIA', tabId });
const urls = r.data.media.map((m) => `${m.type}:${m.url.replace(base, '')}:${m.detectionMethods.join('+')}`);
console.log(urls.join('\n'));
const find = (s) => r.data.media.find((m) => m.url.includes(s));
check('direct mp4 detected (DOM + network, tracking param stripped)', find('/media/clip.mp4') && !find('utm_source') && find('/media/clip.mp4').detectionMethods.length >= 2);
check('mp4 title from element', find('/media/clip.mp4')?.title === 'Example Documentary');
check('poster captured', find('/media/clip.mp4')?.posterUrl?.endsWith('/poster.png'));
check('media link (mp3) detected', find('/media/song.mp3')?.type === 'audio');
check('dynamically inserted webm detected', find('/media/late.webm'));
check('HLS via fetch detected', find('/hls/master.m3u8')?.type === 'hls');
check('DASH via XHR detected', find('/dash/manifest.mpd')?.type === 'dash');
check('blob-backed media detected', r.data.media.some((m) => m.isBlob));
check('tiny UI sounds (YouTube-style) are not listed', hits.some((h) => h.startsWith('/sounds/')) && !r.data.media.some((m) => m.url.includes('/sounds/')), hits.filter((h) => h.startsWith('/sounds/')).join(','));
check('no segments listed', !r.data.media.some((m) => /seg\d|\.m4s/.test(m.url)));
check('page title', r.data.pageTitle?.startsWith('Example Documentary'));

// Analyze streams
const hls = find('/hls/master.m3u8');
const a1 = await send({ type: 'ANALYZE_MEDIA', tabId, mediaId: hls.id });
check('HLS analysis ok', a1.ok && a1.data.analysis.status === 'ok' && a1.data.analysis.variants.map((v) => v.qualityLabel).join(',') === '720p,360p', JSON.stringify(a1.data?.analysis?.variants?.map((v) => v.qualityLabel)));
const dash = find('/dash/manifest.mpd');
const a2 = await send({ type: 'ANALYZE_MEDIA', tabId, mediaId: dash.id });
check('DASH analysis ok', a2.ok && a2.data.analysis.variants.length === 2 && a2.data.analysis.audioTracks.length === 1);
const drm = find('/drm/manifest.mpd');
const a3 = await send({ type: 'ANALYZE_MEDIA', tabId, mediaId: drm.id });
check('DRM detected', a3.ok && a3.data.isProtected && a3.data.analysis.status === 'protected');
const d3 = await send({ type: 'DOWNLOAD', request: { tabId, mediaId: drm.id } });
check('DRM download refused with message', !d3.ok && d3.message === 'Protected media — downloading is not supported.', d3.message);

r = await send({ type: 'GET_TAB_MEDIA', tabId });
check('variant playlists suppressed after analysis', !r.data.media.some((m) => m.url.includes('/720/index.m3u8')));

// Downloads
const d1 = await send({ type: 'DOWNLOAD', request: { tabId, mediaId: find('/media/clip.mp4').id } });
check('direct download queued', d1.ok, d1.data?.filename ?? d1.message);
const d2 = await send({ type: 'DOWNLOAD', request: { tabId, mediaId: hls.id, quality: '360p' } });
check('HLS download queued', d2.ok, d2.data?.filename ?? d2.message);
const d4 = await send({ type: 'DOWNLOAD', request: { tabId, mediaId: dash.id, quality: '480p' } });
check('DASH download queued', d4.ok, d4.data?.filename ?? d4.message);
const d5 = await send({ type: 'DOWNLOAD', request: { tabId, url: `${base}/media/forbidden.mp4` } });
check('forbidden url queued (will fail)', d5.ok);

let jobs = [];
for (let i = 0; i < 40; i++) {
  await ui.waitForTimeout(500);
  jobs = (await send({ type: 'GET_DOWNLOADS' })).data;
  if (jobs.every((j) => ['completed', 'failed', 'cancelled'].includes(j.status))) break;
}
for (const j of jobs) console.log(`  job ${j.filename} ${j.status} ${j.bytesReceived}/${j.totalBytes ?? '?'} ${j.errorMessage ?? ''} ${j.errorDetail ?? ''}`);
const byName = (s) => jobs.find((j) => j.filename.endsWith(s));
check('direct download completed', jobs.some((j) => j.filename.endsWith('/Example Documentary.mp4') && j.status === 'completed' && j.mode === 'direct'));
check('HLS stream completed', jobs.some((j) => j.mode === 'stream' && j.mediaType === 'hls' && j.status === 'completed'));
check('DASH stream completed', jobs.some((j) => j.mode === 'stream' && j.mediaType === 'dash' && j.status === 'completed'));
check('403 reported as access error', jobs.some((j) => j.status === 'failed' && j.errorMessage === 'Media URL could not be accessed.'));
check('filename format', jobs.some((j) => j.filename === 'MediaForge/Example Documentary.mp4'), jobs.map((j) => j.filename).join(' | '));

// On-video Download button: click it, pick the first quality, expect a new job.
await page.bringToFront();
await page.setViewportSize({ width: 1100, height: 700 });
await page.waitForTimeout(800);
check('download button attached to the video', (await page.locator('mediaforge-video-button').count()) === 1);
const vr = await page.locator('#v1').boundingBox();
const before = (await send({ type: 'GET_DOWNLOADS' })).data.length;
await page.mouse.click(vr.x + vr.width - 60, vr.y + 26);
await page.waitForTimeout(1500);
await shot(page, 'video-button.png');
await page.mouse.click(vr.x + vr.width - 150, vr.y + 26 + 24 + 6 + 30 + 18);
await page.waitForTimeout(1500);
const afterJobs = (await send({ type: 'GET_DOWNLOADS' })).data;
check('choosing a quality from the video button starts a download', afterJobs.length === before + 1, afterJobs[0]?.filename);

const files = readdirSync(downloadsDir).map((f) => `${f} ${statSync(join(downloadsDir, f)).size}`);
console.log('downloaded files:', files);
check('segments were fetched', hits.filter((h) => /seg\d\.ts/.test(h)).length === 3 && hits.filter((h) => /v480\/\d\.m4s|a128\/\d\.m4s/.test(h)).length === 4);

// Popup UI render
const popup = await ctx.newPage();
await popup.setViewportSize({ width: 390, height: 600 });
await page.bringToFront();
await popup.goto(`chrome-extension://${extId}/popup/popup.html?tab=${tabId}`);
await popup.waitForTimeout(1200);
await shot(popup, 'popup.png');
const cards = await popup.locator('article.media').count();
check('popup renders media cards', cards >= 5, String(cards));
check('popup shows protected message', (await popup.locator('text=Protected media — downloading is not supported.').count()) === 1);
check('popup shows stream chips', (await popup.locator('.chip').count()) >= 4);

await popup.emulateMedia({ colorScheme: 'dark' });
await popup.reload();
await popup.waitForTimeout(1000);
await shot(popup, 'popup-dark.png');

await ui.reload();
await ui.waitForTimeout(800);
await ui.setViewportSize({ width: 900, height: 700 });
await shot(ui, 'manager.png');

const opts = await ctx.newPage();
await opts.goto(`chrome-extension://${extId}/options/options.html`);
await opts.setViewportSize({ width: 900, height: 900 });
await opts.waitForTimeout(500);
await opts.fill('#excluded-input', 'https://www.Example.org/path');
await opts.click('#excluded-add');
await opts.waitForTimeout(300);
check('options adds normalized excluded domain', (await opts.locator('#excluded-list li', { hasText: 'example.org' }).count()) === 1);
await opts.check('#showFloatingPanel');
await opts.waitForTimeout(800);
await shot(opts, 'options.png');

// Floating panel appears on page after enabling
await page.bringToFront();
await page.reload();
await page.waitForTimeout(2500);
const panelHost = await page.locator('mediaforge-panel').count();
check('floating panel rendered', panelHost === 1);
await shot(page, 'panel.png');

// SPA navigation
const spa = await ctx.newPage();
await spa.goto(`${base}/spa/home`);
await spa.waitForTimeout(1500);
const spaTab = await ui.evaluate(async (u) => (await chrome.tabs.query({})).find((t) => t.url?.includes('/spa/'))?.id, base);
let s1 = await send({ type: 'GET_TAB_MEDIA', tabId: spaTab });
check('SPA initial media', s1.data.media.some((m) => m.url.endsWith('/media/home.mp4')));
await spa.evaluate(() => window.go());
await spa.waitForTimeout(3000);
s1 = await send({ type: 'GET_TAB_MEDIA', tabId: spaTab });
console.log('spa after nav:', s1.data.media.map((m) => m.url.replace(base, '')));
check('SPA navigation: stale media cleared, new media found', s1.data.media.some((m) => m.url.endsWith('/media/two.mp4')) && !s1.data.media.some((m) => m.url.endsWith('/media/home.mp4')));

// Excluded site
await opts.fill('#excluded-input', '127.0.0.1');
await opts.click('#excluded-add');
await opts.waitForTimeout(500);
const ex = await ctx.newPage();
await ex.goto(`${base}/index.html`);
await ex.waitForTimeout(2000);
const exId = await ui.evaluate(async (u) => (await chrome.tabs.query({})).filter((t) => t.url?.startsWith(u + '/index')).map((t) => t.id).pop(), base);
const e1 = await send({ type: 'GET_TAB_MEDIA', tabId: exId });
check('excluded site not scanned', e1.data.excluded && e1.data.media.length === 0, String(e1.data.media.length));

await ctx.close();
server.close();
const failed = results.filter(([, ok]) => !ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
