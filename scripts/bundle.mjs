#!/usr/bin/env node
/**
 * Bundle QinCode into a single minified JS file, then package as native binary
 * using Node.js SEA (Single Executable Application).
 *
 * Strategy: esbuild bundles to ESM (.mjs), then a CJS wrapper dynamically
 * imports it. The .mjs bundle is embedded as a SEA asset so the final binary
 * is self-contained.
 *
 * SEA can only build for the current platform. Cross-platform builds must be
 * done in CI (GitHub Actions) on the respective runners.
 */
import { build } from 'esbuild'
import { execSync } from 'child_process'
import { createHash } from 'crypto'
import {
  readFileSync, writeFileSync, mkdirSync, copyFileSync,
  existsSync, unlinkSync,
} from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const DIST = join(ROOT, 'dist-bundle')
const RELEASE = join(ROOT, 'release')

mkdirSync(DIST, { recursive: true })
mkdirSync(RELEASE, { recursive: true })

// ── 1. Read version ──
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf-8'))
const VERSION = pkg.version

console.log(`\n==> Bundling QinCode ${VERSION}`)

// ── 2. esbuild: bundle + minify (ESM) ──
await build({
  entryPoints: [join(ROOT, 'src/index.ts')],
  bundle: true,
  minify: true,
  platform: 'node',
  target: 'node20',
  format: 'esm',
  outfile: join(DIST, 'qincode.mjs'),
  external: [
    'fsevents',
    'term-size',
  ],
  jsx: 'automatic',
  jsxImportSource: 'react',
  define: {
    'process.env.QINCODE_VERSION': JSON.stringify(VERSION),
  },
  banner: {
    js: `import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);`,
  },
  loader: {
    '.ts': 'ts',
    '.tsx': 'tsx',
    '.html': 'text',
  },
  logLevel: 'info',
})

// ── 3. Copy static assets next to bundle ──
for (const asset of ['login-callback.html', 'login-fail.html']) {
  const src = join(ROOT, asset)
  if (existsSync(src)) copyFileSync(src, join(DIST, asset))
}

// ── 4. Create CJS wrapper for SEA entry ──
// SEA with CJS format can't use top-level await, so we use a CJS wrapper
// that dynamically imports the ESM bundle embedded as an asset.
const wrapperCode = `
console.error('[SEA-WRAPPER] Process started, pid=' + process.pid);
const { readFileSync } = require('fs');
const { join } = require('path');
const { tmpdir } = require('os');
const { writeFileSync, mkdirSync } = require('fs');

// Extract the ESM bundle from SEA assets to a temp file
console.error('[SEA-WRAPPER] Loading node:sea...');
const sea = require('node:sea');
console.error('[SEA-WRAPPER] node:sea loaded, isSea=' + sea.isSea());
let bundlePath;
if (sea.isSea()) {
  const bundleContent = sea.getAsset('qincode.mjs', 'utf-8');
  const tmpDir = join(tmpdir(), 'qincode-sea');
  mkdirSync(tmpDir, { recursive: true });
  bundlePath = join(tmpDir, 'qincode-' + process.pid + '.mjs');
  writeFileSync(bundlePath, bundleContent);

  // Also extract HTML assets to the same temp directory
  for (const name of ['login-callback.html', 'login-fail.html']) {
    try {
      const content = sea.getAsset(name, 'utf-8');
      writeFileSync(join(tmpDir, name), content);
    } catch {}
  }

  // Tell the ESM bundle where to find HTML assets
  process.env.QINCODE_HTML_DIR = tmpDir;

  // Clean up on exit
  process.on('exit', () => {
    try {
      const fs = require('fs');
      fs.unlinkSync(bundlePath);
      // Best-effort cleanup of HTML files
      for (const name of ['login-callback.html', 'login-fail.html']) {
        try { fs.unlinkSync(join(tmpDir, name)); } catch {}
      }
      try { fs.rmdirSync(tmpDir); } catch {}
    } catch {}
  });
} else {
  // Fallback for non-SEA execution
  bundlePath = join(__dirname, 'qincode.mjs');
}

import(bundlePath);
`
const wrapperPath = join(DIST, 'qincode-sea-entry.cjs')
writeFileSync(wrapperPath, wrapperCode)

// ── 5. Build SEA binary for current platform ──
/** Detect current platform identifier */
function detectPlatform() {
  const arch = process.arch === 'arm64' ? 'arm64' : 'x64'
  const os = process.platform === 'darwin' ? 'darwin' : 'linux'
  return `${os}-${arch}`
}

const platform = detectPlatform()
const outName = `qincode-${platform}`
const seaConfigPath = join(DIST, 'sea-config.json')
const seaBlobPath = join(DIST, 'sea-prep.blob')
const releaseBinary = join(RELEASE, outName)

console.log(`\n==> Building SEA binary for ${platform}`)

// 5a. Write SEA config with assets
const seaConfig = {
  main: wrapperPath,
  output: seaBlobPath,
  disableExperimentalSEAWarning: true,
  useCodeCache: true,
  assets: {
    'qincode.mjs': join(DIST, 'qincode.mjs'),
    'login-callback.html': join(DIST, 'login-callback.html'),
    'login-fail.html': join(DIST, 'login-fail.html'),
  },
}
writeFileSync(seaConfigPath, JSON.stringify(seaConfig, null, 2))

// 5b. Generate SEA blob
console.log('    Generating SEA blob...')
execSync(`node --experimental-sea-config "${seaConfigPath}"`, {
  stdio: 'inherit',
  cwd: ROOT,
})

// 5c. Copy node binary and inject blob
console.log('    Creating executable...')
const nodeBin = process.execPath
copyFileSync(nodeBin, releaseBinary)

// Remove signature on macOS (required before injecting blob)
if (process.platform === 'darwin') {
  try {
    execSync(`codesign --remove-signature "${releaseBinary}"`, { stdio: 'inherit' })
  } catch {
    console.log('    (codesign --remove-signature failed, continuing...)')
  }
}

// Fix duplicate sentinel fuse in Node.js v24+ binaries
// Replace all but the last occurrence of the sentinel fuse so postject can find a unique one
const FUSE = 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2'
const FUSE_REPLACE = 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b1' // change last char
{
  const buf = Buffer.from(readFileSync(releaseBinary))
  let indices = []
  let idx = -1
  while ((idx = buf.indexOf(FUSE, idx + 1)) !== -1) indices.push(idx)
  if (indices.length > 1) {
    console.log(`    Found ${indices.length} sentinel fuses, patching...`)
    // Keep the last one, replace all others
    for (let i = 0; i < indices.length - 1; i++) {
      FUSE_REPLACE.split('').forEach((ch, j) => {
        buf[indices[i] + j] = ch.charCodeAt(0)
      })
    }
    writeFileSync(releaseBinary, buf)
    console.log('    Patched duplicate sentinel fuses')
  }
}

// Inject SEA blob into the binary
// macOS requires --macho-segment-name NODE_SEA
const postjectArgs = process.platform === 'darwin'
  ? `--macho-segment-name NODE_SEA`
  : ''
execSync(
  `npx --yes postject "${releaseBinary}" NODE_SEA_BLOB "${seaBlobPath}" --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2 ${postjectArgs}`,
  { stdio: 'inherit', cwd: ROOT }
)

// Re-sign on macOS (ad-hoc signature)
if (process.platform === 'darwin') {
  try {
    execSync(`codesign --sign - "${releaseBinary}"`, { stdio: 'inherit' })
  } catch {
    console.log('    (codesign --sign - failed, binary may still work)')
  }
}

// Make executable
execSync(`chmod +x "${releaseBinary}"`, { stdio: 'inherit' })

// Clean up temp files
try { unlinkSync(seaBlobPath) } catch {}
try { unlinkSync(seaConfigPath) } catch {}
try { unlinkSync(wrapperPath) } catch {}

// ── 6. Generate manifest ──
const hash = createHash('sha256').update(readFileSync(releaseBinary)).digest('hex')
const manifest = {
  version: VERSION,
  platforms: {
    [platform]: { filename: outName, checksum: hash },
  },
}
const manifestPath = join(RELEASE, 'manifest.json')
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2))

console.log(`\n    sha256: ${hash}`)
console.log(`\n==> manifest.json written to ${manifestPath}`)
console.log(`\n==> Done! Binary: ${releaseBinary}`)
console.log(`\n    Note: SEA only builds for the current platform (${platform}).`)
console.log(`    Cross-platform binaries must be built in CI (GitHub Actions).`)
