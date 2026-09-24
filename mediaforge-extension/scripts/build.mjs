// Builds the extension into dist/ (load it via chrome://extensions → "Load unpacked").
import * as esbuild from 'esbuild';
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderIcon } from './icons.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'src');
const dist = join(root, 'dist');
const dev = process.argv.includes('--dev');
const watch = process.argv.includes('--watch');

const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));

function copyStatic() {
  const manifest = JSON.parse(readFileSync(join(src, 'manifest.json'), 'utf8'));
  manifest.version = pkg.version;
  writeFileSync(join(dist, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  for (const [from, to] of [
    ['popup/popup.html', 'popup/popup.html'],
    ['popup/popup.css', 'popup/popup.css'],
    ['options/options.html', 'options/options.html'],
    ['options/options.css', 'options/options.css'],
    ['manager/manager.html', 'manager/manager.html'],
    ['manager/manager.css', 'manager/manager.css'],
    ['offscreen/offscreen.html', 'offscreen/offscreen.html'],
    ['ui/base.css', 'ui/base.css'],
  ]) {
    mkdirSync(dirname(join(dist, to)), { recursive: true });
    cpSync(join(src, from), join(dist, to));
  }
  mkdirSync(join(dist, 'icons'), { recursive: true });
  for (const size of [16, 32, 48, 128]) writeFileSync(join(dist, 'icons', `icon-${size}.png`), renderIcon(size));
}

const common = {
  bundle: true,
  target: ['chrome116'],
  minify: !dev,
  sourcemap: dev ? 'linked' : false,
  legalComments: 'none',
  logLevel: 'info',
  define: { 'process.env.NODE_ENV': JSON.stringify(dev ? 'development' : 'production') },
};

const builds = [
  // Service worker is declared as an ES module in the manifest.
  { ...common, entryPoints: { background: join(src, 'background/index.ts') }, outdir: dist, format: 'esm' },
  // Content scripts must be classic scripts.
  {
    ...common,
    entryPoints: { 'content/content': join(src, 'content/index.ts'), 'content/page-hook': join(src, 'content/page-hook.ts') },
    outdir: dist,
    format: 'iife',
  },
  {
    ...common,
    entryPoints: {
      'popup/popup': join(src, 'popup/popup.ts'),
      'options/options': join(src, 'options/options.ts'),
      'manager/manager': join(src, 'manager/manager.ts'),
      'offscreen/offscreen': join(src, 'offscreen/main.ts'),
    },
    outdir: dist,
    format: 'esm',
  },
];

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });
copyStatic();

if (watch) {
  for (const b of builds) {
    const ctx = await esbuild.context(b);
    await ctx.watch();
  }
  console.log('Watching for changes… (static files are copied on start)');
} else {
  await Promise.all(builds.map((b) => esbuild.build(b)));
  console.log(`Built MediaForge ${pkg.version} (${dev ? 'development' : 'production'}) → ${dist}`);
}
