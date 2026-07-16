// Rollup config — three build targets from one source.
//
//  1. dist/index.esm.js  — ESM for bundlers (Vite/Webpack/Rollup).
//  2. dist/index.cjs.js  — CommonJS for legacy bundlers + Node SSR.
//  3. dist/iqcollect.js  — UMD bundle published to cdn.addressiqpro.com/v{x.y.z}/iqcollect.js.
//                           Auto-attaches `window.AddressIQ.IQCollect`.
//
// The UMD build is minified + tree-shaken. CI enforces a ≤65 KB gzipped
// budget on the UMD output (see scripts/check-size.mjs).

import fs from 'node:fs';
import resolve from '@rollup/plugin-node-resolve';
import typescript from '@rollup/plugin-typescript';
import terser from '@rollup/plugin-terser';
import replace from '@rollup/plugin-replace';

// Load .env (gitignored) into process.env for LOCAL builds, without adding a
// dependency. Real env vars always win, so CI — which sets the STAGING_*/PROD_*
// repository variables directly — is unaffected: a .env file does not exist there.
// Only ADDRESSIQ_DEV_* is expected here; see .env.example.
for (const line of fs.existsSync('.env') ? fs.readFileSync('.env', 'utf8').split('\n') : []) {
  const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}

const externalESM = []; // nothing external — IQCollect is dependency-free.

// Build-time values baked into every bundle. plugin-replace is this repo's
// baking mechanism — the equivalent of the mobile SDKs' generated BuildConfig
// source file + bake script. Sourced from the GitHub environment in CI: three
// URLs per shippable environment, from the repository variables
//
//   STAGING_ADDRESSIQ_API_BASE_URL       PROD_ADDRESSIQ_API_BASE_URL
//   STAGING_ADDRESSIQ_INGEST_BASE_URL   PROD_ADDRESSIQ_INGEST_BASE_URL
//   STAGING_ADDRESSIQ_CDN_BASE_URL      PROD_ADDRESSIQ_CDN_BASE_URL
//
// plus the `GOOGLE_MAPS_SDK_KEY` secret. The defaults below are the safe public
// hosts, so a local `npm run build` with no env vars set still produces a usable
// bundle. Consumed via src/buildConfig.ts (which also guards tsc/jest runs).
//
// `development` is NOT baked here — it points at the developer's own machine
// and stays a literal (http://localhost:4000) in src/index.ts.
const bake = (name, fallback) => {
  // A base URL with a trailing slash concatenates into `//path`; normalise.
  const value = (process.env[name] || fallback).replace(/\/+$/, '');
  return JSON.stringify(value);
};

const buildReplace = () =>
  replace({
    preventAssignment: true,
    values: {
      __ADDRESSIQ_STAGING_API_URL__: bake(
        'STAGING_ADDRESSIQ_API_BASE_URL',
        'https://api-staging.addressiqpro.com',
      ),
      __ADDRESSIQ_STAGING_INGEST_URL__: bake(
        'STAGING_ADDRESSIQ_INGEST_BASE_URL',
        'https://ingest-api-staging.addressiqpro.com',
      ),
      __ADDRESSIQ_STAGING_CDN_URL__: bake(
        'STAGING_ADDRESSIQ_CDN_BASE_URL',
        'https://cdn-staging.addressiqpro.com',
      ),
      // ADDRESSIQ_API_URL is the pre-split name for the production API host,
      // kept as a fallback so a repo that still only sets the old variable
      // keeps baking the same value it always did.
      __ADDRESSIQ_PROD_API_URL__: bake(
        'PROD_ADDRESSIQ_API_BASE_URL',
        process.env.ADDRESSIQ_API_URL || 'https://api.addressiqpro.com',
      ),
      __ADDRESSIQ_PROD_INGEST_URL__: bake(
        'PROD_ADDRESSIQ_INGEST_BASE_URL',
        'https://ingest-api.addressiqpro.com',
      ),
      __ADDRESSIQ_PROD_CDN_URL__: bake('PROD_ADDRESSIQ_CDN_BASE_URL', 'https://cdn.addressiqpro.com'),
      __GOOGLE_MAPS_SDK_KEY__: JSON.stringify(process.env.GOOGLE_MAPS_SDK_KEY || ''),

      // Development-only host overrides (see .env.example). NOTE the DEV_ prefix:
      // the unprefixed ADDRESSIQ_API_URL above is the LEGACY name for the
      // PRODUCTION api host, so a dev override must never reuse it — a LAN IP
      // would be baked in as production, and it is a valid URL so
      // check-baked-config.mjs would not catch it.
      __ADDRESSIQ_DEV_API_URL__: bake('ADDRESSIQ_DEV_API_URL', 'http://localhost:4000'),
      __ADDRESSIQ_DEV_INGEST_URL__: bake('ADDRESSIQ_DEV_INGEST_URL', 'http://localhost:4000'),
    },
  });

export default [
  // ESM + CJS for npm consumers.
  {
    input: 'src/index.ts',
    output: [
      { file: 'dist/index.esm.js', format: 'esm', sourcemap: true },
      { file: 'dist/index.cjs.js', format: 'cjs', sourcemap: true, exports: 'named' },
    ],
    external: externalESM,
    plugins: [buildReplace(), resolve(), typescript({ tsconfig: './tsconfig.json' })],
  },

  // UMD for cdn.addressiqpro.com — minified.
  {
    input: 'src/index.ts',
    output: {
      file: 'dist/iqcollect.js',
      format: 'umd',
      name: 'AddressIQ',
      extend: true,                            // window.AddressIQ stays an object — UMD adds keys
      globals: {},
      sourcemap: true,
    },
    plugins: [
      buildReplace(),
      resolve(),
      typescript({ tsconfig: './tsconfig.json' }),
      terser({
        compress: { passes: 2, pure_getters: true, ecma: 2020 },
        mangle: { reserved: ['IQCollect', 'verify'] }, // keep public names stable for the SRI snapshot
        format: { comments: false },
      }),
    ],
  },
];
