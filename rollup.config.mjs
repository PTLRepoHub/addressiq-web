// Rollup config — three build targets from one source.
//
//  1. dist/index.esm.js  — ESM for bundlers (Vite/Webpack/Rollup).
//  2. dist/index.cjs.js  — CommonJS for legacy bundlers + Node SSR.
//  3. dist/iqcollect.js  — UMD bundle published to cdn.addressiqpro.com/v{x.y.z}/iqcollect.js.
//                           Auto-attaches `window.AddressIQ.IQCollect`.
//
// The UMD build is minified + tree-shaken. CI enforces a ≤65 KB gzipped
// budget on the UMD output (see scripts/check-size.mjs).

import resolve from '@rollup/plugin-node-resolve';
import typescript from '@rollup/plugin-typescript';
import terser from '@rollup/plugin-terser';
import replace from '@rollup/plugin-replace';

const externalESM = []; // nothing external — IQCollect is dependency-free.

// Build-time values baked into every bundle. Sourced from the GitHub
// environment in CI (the `ADDRESSIQ_API_URL` variable + `GOOGLE_MAPS_SDK_KEY`
// secret); safe fallbacks keep local `npm run build` working without them.
// Consumed via src/buildConfig.ts (which also guards tsc/jest runs).
const buildReplace = () =>
  replace({
    preventAssignment: true,
    values: {
      __ADDRESSIQ_API_URL__: JSON.stringify(
        process.env.ADDRESSIQ_API_URL || 'https://api.addressiqpro.com',
      ),
      __GOOGLE_MAPS_SDK_KEY__: JSON.stringify(process.env.GOOGLE_MAPS_SDK_KEY || ''),
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
