// Emits dist/MANIFEST.json with SHA-384 subresource-integrity hashes for
// every public artifact. Partners pin <script integrity="..."> against
// the hash for the version they ship.
//
// Run via `pnpm --filter @addressiq/iqcollect-web run manifest` AFTER
// `pnpm build`. CI publishes MANIFEST.json alongside the bundle to
// cdn.addressiqpro.com/v{x.y.z}/MANIFEST.json.

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkgRoot = join(__dirname, '..');
const distDir = join(pkgRoot, 'dist');

if (!existsSync(distDir)) {
  console.error('[manifest] dist/ missing — run `pnpm build` first.');
  process.exit(2);
}

const pkg = JSON.parse(readFileSync(join(pkgRoot, 'package.json'), 'utf8'));

const artifacts = readdirSync(distDir).filter((f) =>
  f.endsWith('.js') || f.endsWith('.mjs') || f.endsWith('.cjs') || f.endsWith('.css'),
);

const entries = artifacts.map((file) => {
  const buf = readFileSync(join(distDir, file));
  const sha384 = createHash('sha384').update(buf).digest('base64');
  return {
    file,
    sha384,
    integrity: `sha384-${sha384}`,
    bytes: buf.byteLength,
  };
});

// The `cdn` field is what partners read to build their <script src>, so it must
// name the host the bundle is actually uploaded to. It used to be hard-coded to
// production; now it follows the same per-environment variables the bundle is
// baked with. CDN_BASE_URL (the cdn.yml override) wins, then PROD_ADDRESSIQ_CDN_BASE_URL,
// then the safe public default — the identical precedence cdn.yml uses for
// $CDN_BASE, so its manifest-vs-upload-host guard still holds.
const cdnBase = (
  process.env.CDN_BASE_URL ||
  process.env.PROD_ADDRESSIQ_CDN_BASE_URL ||
  'https://cdn.addressiqpro.com'
).replace(/\/+$/, '');

const manifest = {
  package: pkg.name,
  version: pkg.version,
  generatedAt: new Date().toISOString(),
  cdn: `${cdnBase}/v${pkg.version}/`,
  artifacts: entries,
};

writeFileSync(join(distDir, 'MANIFEST.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(`[manifest] wrote ${entries.length} artifacts to dist/MANIFEST.json`);
for (const e of entries) {
  console.log(`  ${e.file}  ${e.integrity}  (${e.bytes} bytes)`);
}
