/**
 * Smoke test — verifies the package compiles and its public surface is intact.
 * Not a behavioural test; it guards the release pipeline against a broken
 * entry point or a dropped export.
 */
import {
  IQCollect,
  verify,
  resolveEnvironmentUrls,
  BROWSER_VERIFICATION_NOT_SUPPORTED_ERROR,
} from '../src';

describe('@addressiq/iqcollect-web public surface', () => {
  it('exports the IQCollect collection class', () => {
    expect(typeof IQCollect).toBe('function');
  });

  it('exposes a verify proxy whose methods reject (browser cannot verify)', async () => {
    const start = verify.start;
    expect(typeof start).toBe('function');
    if (!start) throw new Error('verify.start should be defined');
    await expect(start()).rejects.toBeDefined();
  });

  it('exports the browser-not-supported error constant', () => {
    expect(BROWSER_VERIFICATION_NOT_SUPPORTED_ERROR).toBeDefined();
  });
});

describe('environment resolution', () => {
  // Under Jest nothing is substituted, so these are the checked-in safe
  // defaults from src/buildConfig.ts — the same values a `npm run build` with
  // no env vars set bakes in.
  it('resolves three URLs per environment, defaulting to production', () => {
    expect(resolveEnvironmentUrls()).toEqual({
      api: 'https://api.addressiqpro.com',
      ingest: 'https://ingest-api.addressiqpro.com',
      cdn: 'https://cdn.addressiqpro.com',
    });
    expect(resolveEnvironmentUrls('staging')).toEqual({
      api: 'https://api-staging.addressiqpro.com',
      ingest: 'https://ingest-api-staging.addressiqpro.com',
      cdn: 'https://cdn-staging.addressiqpro.com',
    });
  });

  it('treats the deprecated `sandbox` alias as `staging`', () => {
    expect(resolveEnvironmentUrls('sandbox')).toEqual(resolveEnvironmentUrls('staging'));
  });

  it('keeps `development` a local literal — never baked from CI', () => {
    expect(resolveEnvironmentUrls('development').api).toBe('http://localhost:3355');
  });
});
