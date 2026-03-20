#!/usr/bin/env node
'use strict';
/**
 * scripts/pack.js — EficacIA Extension: build + package
 * ──────────────────────────────────────────────────────
 * 1. Cleans dist/ (removes stale generated files & stale root icons)
 * 2. Compiles TypeScript with esbuild  →  dist/assets/
 * 3. Compiles CSS with Tailwind CLI    →  dist/assets/popup.css
 * 4. Copies icons/  from eficacia-extension/public/icons/
 * 5. Copies manifest.json, index.html, service-worker-loader.js to dist root
 * 6. Zips dist/ contents (manifest.json at zip root, no parent dir)
 * 7. Writes  ../public/eficacia-extension.zip   (overwrite)
 *
 * Usage:
 *   node scripts/pack.js          (direct)
 *   npm run build:zip              (via package.json)
 */

const { execSync }   = require('child_process');
const path           = require('path');
const fs             = require('fs');
const archiver       = require('archiver');

// ── Paths ─────────────────────────────────────────────────────────────────────
const ROOT     = path.resolve(__dirname, '..');               // eficacia-extension/
const DIST     = path.join(ROOT, 'dist');                    // eficacia-extension/dist/
const ZIP_OUT  = path.resolve(ROOT, '..', 'public', 'eficacia-extension.zip');
const BIN      = path.join(ROOT, 'node_modules', '.bin');
const ASSETS   = path.join(DIST, 'assets');
const ICONS    = path.join(DIST, 'icons');

// ── Helpers ───────────────────────────────────────────────────────────────────
const env = { ...process.env, PATH: `/usr/local/bin:${process.env.PATH}` };

function run(cmd) {
  process.stdout.write(`  $ ${cmd.replace(/"/g, "'")}\n`);
  execSync(cmd, { cwd: ROOT, env, stdio: 'inherit' });
}

function copyFile(src, dst) {
  fs.copyFileSync(src, dst);
  process.stdout.write(`  copy ${path.relative(ROOT, src)} → ${path.relative(ROOT, dst)}\n`);
}

function removeIfExists(p) {
  if (fs.existsSync(p)) {
    fs.rmSync(p, { recursive: true });
    process.stdout.write(`  rm   ${path.relative(ROOT, p)}\n`);
  }
}

// ── Step 1: Prepare dist directories ─────────────────────────────────────────
console.log('\n📁  Preparing dist-extension/ …');
fs.mkdirSync(ASSETS, { recursive: true });
fs.mkdirSync(ICONS,  { recursive: true });

// Delete stale root-level icon files (manifest uses icons/ subfolder only)
for (const f of ['icon16.png', 'icon32.png', 'icon48.png', 'icon128.png']) {
  removeIfExists(path.join(DIST, f));
}
// Delete Vite build metadata (not needed in Chrome extension zip)
removeIfExists(path.join(DIST, '.vite'));

// Delete stale Vite-hashed asset files (replaced by stable-named counterparts)
const VITE_HASH_RE = /[a-zA-Z0-9]+-[A-Za-z0-9]{8,}\.(js|css)$/;
if (fs.existsSync(ASSETS)) {
  for (const f of fs.readdirSync(ASSETS)) {
    if (VITE_HASH_RE.test(f)) removeIfExists(path.join(ASSETS, f));
  }
}

// ── Step 2: Compile JS with esbuild ──────────────────────────────────────────
console.log('\n⚡  Compiling JS with esbuild …');
const ESBUILD = `"${BIN}/esbuild"`;
const BASE    = [
  '--bundle',
  '--format=esm',
  '--target=chrome100',
  '--define:process.env.NODE_ENV=\\"production\\"',
].join(' ');

// content script — injected into LinkedIn / Apollo pages
run(`${ESBUILD} src/content.ts   ${BASE} --outfile="${ASSETS}/content.js"`);

// background service worker
run(`${ESBUILD} src/background.ts ${BASE} --outfile="${ASSETS}/background.js"`);

// popup UI (React) — CSS imports are dropped; CSS is compiled separately below
run(`${ESBUILD} src/main.tsx ${BASE} --jsx=automatic --loader:.css=empty --outfile="${ASSETS}/popup.js"`);

// ── Step 3: Compile CSS with Tailwind CLI ─────────────────────────────────────
console.log('\n🎨  Compiling CSS with Tailwind …');
const TAILWIND = `"${BIN}/tailwindcss"`;
const cssOut   = path.join(ASSETS, 'popup.css');

try {
  // Tailwind v4 CLI: auto-detects content from sources alongside config-free usage
  run(`${TAILWIND} -i src/index.css -o "${cssOut}" --minify`);
} catch (_) {
  // Fallback: keep pre-compiled CSS if Tailwind CLI fails (e.g. version mismatch)
  const existing = fs.readdirSync(ASSETS).find(f => f.endsWith('.css'));
  if (existing) {
    const src = path.join(ASSETS, existing);
    if (src !== cssOut) fs.copyFileSync(src, cssOut);
    console.warn(`  ⚠️  Tailwind CLI failed — kept existing CSS: ${existing}`);
  } else {
    console.warn('  ⚠️  Tailwind CLI failed and no fallback CSS found. Popup will be unstyled.');
  }
}

// ── Step 4: Copy icons ────────────────────────────────────────────────────────
console.log('\n🖼️   Copying icons …');
const srcIconsDir = path.join(ROOT, 'public', 'icons');
for (const f of fs.readdirSync(srcIconsDir)) {
  if (!f.endsWith('.png')) continue;
  copyFile(path.join(srcIconsDir, f), path.join(ICONS, f));
}

// ── Step 5: Write static root files ──────────────────────────────────────────
console.log('\n📄  Writing static root files …');

// manifest.json — single source of truth in eficacia-extension/manifest.json
copyFile(path.join(ROOT, 'manifest.json'), path.join(DIST, 'manifest.json'));

// service-worker-loader.js — minimal ES module that imports the compiled background
const swLoader = `import './assets/background.js';\n`;
fs.writeFileSync(path.join(DIST, 'service-worker-loader.js'), swLoader);
console.log('  write service-worker-loader.js');

// index.html — popup shell referencing stable compiled asset paths
const indexHtml = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>EficacIA Connector</title>
    <link rel="stylesheet" href="assets/popup.css" />
    <script type="module" src="assets/popup.js"></script>
  </head>
  <body class="bg-zinc-950 text-zinc-200 antialiased">
    <div id="root"></div>
  </body>
</html>
`;
fs.writeFileSync(path.join(DIST, 'index.html'), indexHtml);
console.log('  write index.html');

// ── Step 6: Create ZIP ────────────────────────────────────────────────────────
console.log('\n🗜️   Creating zip …');
fs.mkdirSync(path.dirname(ZIP_OUT), { recursive: true });
if (fs.existsSync(ZIP_OUT)) fs.rmSync(ZIP_OUT);

const output  = fs.createWriteStream(ZIP_OUT);
const archive = archiver('zip', { zlib: { level: 9 } });

archive.on('error', (err) => { throw err; });
archive.pipe(output);

// Add all dist contents to zip root (no parent folder).
// Exclude .vite/ build metadata and any leftover Vite-hashed files.
archive.glob('**/*', {
  cwd:    DIST,
  dot:    false,
  ignore: ['.vite/**', '*.vite.*'],
});

output.on('close', () => {
  const kb = (archive.pointer() / 1024).toFixed(1);
  console.log(`\n✅  eficacia-extension.zip  (${kb} KB)\n    → ${ZIP_OUT}\n`);
});

archive.finalize();
