// Asserts the built bundle actually carries its baked-in config.
//
// WHY THIS EXISTS: `release.yml` and `widget-fanout.yml` silently lost
// `GOOGLE_MAPS_SDK_KEY` from their build steps' `env:` blocks during a refactor.
// Both workflows still *mentioned* the key — in a comment — so grepping the
// workflow files for it looked fine. npm v0.5.0 and the widget fanned out to all
// four SDKs shipped with `googleMapsApiKey || ""`: Places autocomplete silently
// dead, discoverable only in a partner's app.
//
// A missing build secret produces a VALID build. Nothing fails, nothing warns —
// the placeholder just resolves to an empty string. So the only reliable check is
// on the emitted bytes, not on the workflow that was supposed to supply them.
//
// Run after `npm run build`, before anything is published:
//   node scripts/check-baked-config.mjs           # require the Maps key
//   node scripts/check-baked-config.mjs --allow-empty-maps-key   # local builds
//
// CI runs it WITHOUT the flag in the workflows that publish a bundle (npm, CDN).
// The widget-fanout no longer builds a bundle — it only writes the SRI pin into
// the SDKs, which load the widget from the CDN — so `--allow-empty-maps-key` is
// now only a local-build convenience.

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const dist = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const allowEmptyMapsKey = process.argv.includes('--allow-empty-maps-key');

const bundle = join(dist, 'iqcollect.js');
if (!existsSync(bundle)) {
  console.error('[check-baked-config] dist/iqcollect.js missing — run `npm run build` first.');
  process.exit(2);
}
const js = readFileSync(bundle, 'utf8');

let failed = 0;
const fail = (msg) => { console.error(`  ✗ ${msg}`); failed++; };
const ok = (msg) => console.log(`  ✓ ${msg}`);

// 1. Maps key. Terser renders the default as `googleMapsApiKey||"<key>"`; an
//    unbaked build renders `googleMapsApiKey||""`.
const emptyKey = /googleMapsApiKey\s*[|][|]\s*""/.test(js);
const hasKey = /googleMapsApiKey\s*[|][|]\s*"[^"]+"/.test(js);
if (emptyKey || !hasKey) {
  if (allowEmptyMapsKey) {
    ok('Maps key is empty (allowed: --allow-empty-maps-key)');
  } else {
    fail('GOOGLE_MAPS_SDK_KEY is NOT baked into dist/iqcollect.js — Places autocomplete ' +
         'would be dead in every consumer. Check the publishing workflow passes it in `env:` ' +
         'AND that the job is bound to a GitHub Environment (the secret is environment-scoped, ' +
         'so it resolves to an empty string in an unbound job).');
  }
} else {
  ok('Maps key is baked in');
}

// 2. Hosts. An unbaked host falls back to the public default, which is *correct*
//    but should never be an unresolved placeholder.
for (const placeholder of ['__ADDRESSIQ_', '__GOOGLE_MAPS_SDK_KEY__']) {
  if (js.includes(placeholder)) fail(`unresolved build placeholder ${placeholder} left in the bundle`);
}
if (!js.includes('__ADDRESSIQ_')) ok('no unresolved build placeholders');

if (failed) {
  console.error(`\n[check-baked-config] ${failed} check(s) failed — refusing to publish.`);
  process.exit(1);
}
console.log('\n[check-baked-config] bundle config looks sane.');
