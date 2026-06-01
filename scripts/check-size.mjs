// CI gate — fails the release build if the UMD bundle exceeds 65 KB gzipped.
//
// Run via `pnpm --filter @addressiq/iqcollect-web run size-check` after
// `pnpm --filter @addressiq/iqcollect-web run build`. The CDN drop-in is the
// build artifact partners load via <script>; we hold the line at 65 KB to
// keep the time-to-render budget tight on mobile networks.

import { readFileSync, statSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkgRoot = join(__dirname, '..');
const target = join(pkgRoot, 'dist/iqcollect.js');
const BUDGET_BYTES = 65 * 1024;

try {
  statSync(target);
} catch {
  console.error(`[size-check] missing build output: ${target} — run \`pnpm build\` first.`);
  process.exit(2);
}

const raw = readFileSync(target);
const gz = gzipSync(raw, { level: 9 });
const rawKb = (raw.byteLength / 1024).toFixed(2);
const gzKb = (gz.byteLength / 1024).toFixed(2);
const budgetKb = (BUDGET_BYTES / 1024).toFixed(2);

console.log(`[size-check] dist/iqcollect.js: raw ${rawKb} KB, gzipped ${gzKb} KB (budget ${budgetKb} KB)`);

if (gz.byteLength > BUDGET_BYTES) {
  console.error(`[size-check] FAIL — gzipped size exceeds budget by ${(gz.byteLength - BUDGET_BYTES)} bytes.`);
  process.exit(1);
}

console.log('[size-check] OK');
