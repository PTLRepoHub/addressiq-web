// AddressIQ IQCollect sample — npm/bundler entry point.
//
// The same code works under Vite/Webpack/Rollup. The CDN drop-in version
// lives in index.html — it loads iqcollect.js from cdn.addressiq.com and
// uses window.AddressIQ.IQCollect.

import {
  IQCollect,
  verify,
  type IQCollectError,
  type AddressData,
} from '@addressiq/iqcollect-web';

const mount = document.getElementById('iqcollect-mount');
if (!mount) throw new Error('mount element missing');

const collector = new IQCollect(mount, {
  apiKey: 'aiq_test_demo_bank_seed01',
  apiUrl: 'https://api.addressiq.com',
  appUserId: 'cust_sample_001',
  prefill: { firstName: 'Sample', lastName: 'User' },
  theme: 'dark',
  onAddressSelected: (address: AddressData) => {
    console.log('[sample] address selected', address);
  },
  onError: (err: IQCollectError) => {
    console.error('[sample] collection error', err);
  },
});

collector.open();

// Showcase the verify proxy stub — any access on `verify.*` rejects with
// BROWSER_VERIFICATION_NOT_SUPPORTED. Partners catch the rejection and
// surface the docsUrl to their support flow.
verify.startDigital?.().catch((err) => {
  console.warn('[sample] verify.startDigital rejected as expected:', err);
});
