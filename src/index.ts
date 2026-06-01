/**
 * AddressIQ IQCollect — web collection-only SDK.
 *
 * The browser cannot run background geofencing, so this package intentionally
 * exposes ZERO verification methods. Address collection (form + map pin)
 * lives here; verification is mobile-only.
 *
 * Two distributions ship from this one source:
 *   1. npm `@addressiq/iqcollect-web` — bundler-friendly ESM/CJS.
 *   2. CDN UMD bundle at `https://cdn.addressiq.com/v{n.n.n}/iqcollect.js`
 *      attaching `window.AddressIQ.IQCollect`. SRI hashes ship in docs.
 *
 * Partners who reach for `window.AddressIQ.verify` (a leftover from older
 * generations of the SDK) receive a BROWSER_VERIFICATION_NOT_SUPPORTED
 * error with a docs link.
 */

export type {
  IQCollectConfig,
  AddressData,
  IQCollectError,
} from './types';
export { BROWSER_VERIFICATION_NOT_SUPPORTED_ERROR } from './types';

import type { IQCollectConfig, AddressData, IQCollectError } from './types';
import { BROWSER_VERIFICATION_NOT_SUPPORTED_ERROR } from './types';

const DEFAULT_API_URL = 'https://api.addressiq.com';
const SDK_VERSION = '0.1.0';

/**
 * Mount an IQCollect collection flow into the given DOM element.
 *
 * The actual UI (form + map) is loaded lazily so the bundle stays under
 * the spec's 65KB gzipped budget. For Phase 3 we ship the public constructor
 * + the collection wire-format; UI integration is finished alongside the
 * dashboard reshape in Phase 5.
 */
export class IQCollect {
  private readonly config: IQCollectConfig;
  private readonly mount: HTMLElement;
  private opened = false;

  constructor(mount: HTMLElement, config: IQCollectConfig) {
    if (typeof window === 'undefined') {
      throw new Error('IQCollect can only run in a browser environment');
    }
    if (!mount) throw new Error('IQCollect: mount element is required');
    if (!config.apiKey) throw new Error('IQCollect: apiKey is required');
    if (!config.appUserId) throw new Error('IQCollect: appUserId is required');

    this.config = { apiUrl: DEFAULT_API_URL, ...config };
    this.mount = mount;
  }

  /** Render the collection UI. Subsequent calls are no-ops. */
  open(): void {
    if (this.opened) return;
    this.opened = true;
    this.mount.dataset.iqcollectVersion = SDK_VERSION;
    // The Svelte/Vanilla UI bundle is dynamic-imported in production builds.
    // For the npm package + the UMD CDN bundle the import lives in a separate
    // chunk; the stub here ensures the public API surface compiles + ships.
    // (Phase 5 wires the actual form.)
  }

  /** Tear down the UI, unbind listeners. */
  close(): void {
    if (!this.opened) return;
    this.opened = false;
    this.mount.innerHTML = '';
    this.config.onClose?.();
  }

  /**
   * Programmatically submit an address (advanced flow — partners with their
   * own UI just want the API client). Returns the AddressData on success.
   */
  async submit(input: {
    lat: number;
    lon: number;
    formattedAddress: string;
    propertyName?: string;
    streetName?: string;
    plusCode?: string;
  }): Promise<AddressData> {
    const idempotencyKey = this.config.idempotencyKey ?? this.makeIdempotencyKey();
    const res = await fetch(`${this.config.apiUrl}/api/v1/locations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.config.apiKey,
        'idempotency-key': idempotencyKey,
        'x-sdk-name': 'iqcollect-web',
        'x-sdk-version': SDK_VERSION,
      },
      body: JSON.stringify({
        appUserId: this.config.appUserId,
        lat: input.lat,
        lon: input.lon,
        formattedAddress: input.formattedAddress,
        propertyName: input.propertyName,
        streetName: input.streetName,
        plusCode: input.plusCode,
        locationType: 'HOME',
        ...(this.config.prefill ?? {}),
      }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      const error: IQCollectError = {
        code: (body as { code?: string }).code ?? `HTTP_${res.status}`,
        message: (body as { message?: string }).message ?? `Submission failed (${res.status})`,
      };
      this.config.onError?.(error);
      throw error;
    }
    const data: AddressData = {
      id: (body as { verificationUuid: string }).verificationUuid,
      locationCode: (body as { locationCode: string }).locationCode,
      formattedAddress: input.formattedAddress,
      geoPoint: { lat: input.lat, lng: input.lon },
      propertyName: input.propertyName,
      streetName: input.streetName,
      plusCode: input.plusCode,
    };
    this.config.onAddressSelected?.(data);
    return data;
  }

  private makeIdempotencyKey(): string {
    const t = Date.now().toString(36);
    const r = Math.random().toString(36).slice(2, 10);
    return `iqidem_iqcollect_${t}_${r}`;
  }
}

/**
 * Stub for any code that still reaches for `verify.*` on the web SDK. Returns
 * BROWSER_VERIFICATION_NOT_SUPPORTED so callers see a clear pointer at the
 * mobile SDK. The stub is intentionally a `Proxy` so any property access —
 * `verify.startDigital`, `verify.startPhysical`, etc. — returns the same
 * useful error instead of `undefined`.
 */
export const verify: Record<string, (...args: unknown[]) => Promise<never>> = new Proxy(
  {},
  {
    get(_target, prop) {
      const method = String(prop);
      return () => {
        const err = {
          ...BROWSER_VERIFICATION_NOT_SUPPORTED_ERROR,
          attemptedMethod: `verify.${method}`,
        };
        return Promise.reject(err);
      };
    },
  },
) as Record<string, (...args: unknown[]) => Promise<never>>;

/**
 * Auto-attach to `window.AddressIQ.IQCollect` for the UMD CDN build. No-op
 * in SSR / Node environments.
 */
declare global {
  interface Window {
    AddressIQ?: {
      IQCollect?: typeof IQCollect;
      verify?: typeof verify;
    };
  }
}

if (typeof window !== 'undefined') {
  window.AddressIQ = window.AddressIQ ?? {};
  window.AddressIQ.IQCollect = IQCollect;
  window.AddressIQ.verify = verify;
}
