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

const externalESM = []; // nothing external — IQCollect is dependency-free.

export default [
  // ESM + CJS for npm consumers.
  {
    input: 'src/index.ts',
    output: [
      { file: 'dist/index.esm.js', format: 'esm', sourcemap: true },
      { file: 'dist/index.cjs.js', format: 'cjs', sourcemap: true, exports: 'named' },
    ],
    external: externalESM,
    plugins: [resolve(), typescript({ tsconfig: './tsconfig.json' })],
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
