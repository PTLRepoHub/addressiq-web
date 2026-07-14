/**
 * Smoke test — verifies the package compiles and its public surface is intact.
 * Not a behavioural test; it guards the release pipeline against a broken
 * entry point or a dropped export.
 */
import {
  IQCollect,
  verify,
  resolveDeploymentUrls,
  assertDevOnlyMapsKey,
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

describe('deployment resolution', () => {
  // Under Jest nothing is substituted, so these are the checked-in safe
  // defaults from src/buildConfig.ts — the same values a `npm run build` with
  // no env vars set bakes in.
  it('resolves three URLs per deployment, defaulting to production', () => {
    expect(resolveDeploymentUrls()).toEqual({
      api: 'https://api.addressiqpro.com',
      ingest: 'https://ingest-api.addressiqpro.com',
      cdn: 'https://cdn.addressiqpro.com',
    });
    expect(resolveDeploymentUrls('staging')).toEqual({
      api: 'https://api-staging.addressiqpro.com',
      ingest: 'https://ingest-api-staging.addressiqpro.com',
      cdn: 'https://cdn-staging.addressiqpro.com',
    });
  });

  it('rejects `sandbox` — it is a tenant mode, not a deployment', () => {
    // It used to alias `staging`, which asserted sandbox was a deployment.
    // Sandbox-vs-production is decided by the API key, server-side. Throwing
    // matters here more than anywhere: this ships as a UMD loaded from a
    // <script> tag, so callers are plain JS and would otherwise silently get
    // `undefined` hosts.
    expect(() => resolveDeploymentUrls('sandbox' as never)).toThrow(/not a deployment/);
    expect(() => resolveDeploymentUrls('sandbox' as never)).toThrow(/aiq_test_/);
  });

  it('rejects an unknown deployment rather than returning undefined hosts', () => {
    expect(() => resolveDeploymentUrls('prodution' as never)).toThrow(/unknown deployment/);
  });

  it('keeps `development` a local literal — never baked from CI', () => {
    expect(resolveDeploymentUrls('development').api).toBe('http://localhost:4000');
  });
});

describe('development-only Maps key override', () => {
  it('is refused on a shipped deployment', () => {
    // The Maps key is platform-provisioned (fetched from /api/v1/widget/config).
    // A caller-supplied one must not become a partner-facing knob, so it fails
    // loudly rather than being silently ignored.
    expect(() => assertDevOnlyMapsKey('production', 'AIzaDEV')).toThrow(/development-only/);
    expect(() => assertDevOnlyMapsKey('staging', 'AIzaDEV')).toThrow(/development-only/);
    // deployment omitted -> defaults to production
    expect(() => assertDevOnlyMapsKey(undefined, 'AIzaDEV')).toThrow(/development-only/);
  });

  it('is accepted in development', () => {
    expect(() => assertDevOnlyMapsKey('development', 'AIzaDEV')).not.toThrow();
  });

  it('a shipped build that does not set it is unaffected', () => {
    // The throw must fire only when someone actually supplies a key.
    expect(() => assertDevOnlyMapsKey('production', undefined)).not.toThrow();
    expect(() => assertDevOnlyMapsKey('production', '')).not.toThrow();
  });
});
