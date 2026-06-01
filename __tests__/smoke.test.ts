/**
 * Smoke test — verifies the package compiles and its public surface is intact.
 * Not a behavioural test; it guards the release pipeline against a broken
 * entry point or a dropped export.
 */
import { IQCollect, verify, BROWSER_VERIFICATION_NOT_SUPPORTED_ERROR } from '../src';

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
