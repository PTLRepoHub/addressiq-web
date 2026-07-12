/**
 * AddressIQ IQCollect — web collection-only SDK.
 *
 * The browser cannot run background geofencing, so this package intentionally
 * exposes ZERO verification methods. Address collection (form + map pin)
 * lives here; verification is mobile-only.
 *
 * Two distributions ship from this one source:
 *   1. npm `@addressiq/iqcollect-web` — bundler-friendly ESM/CJS.
 *   2. CDN UMD bundle at `https://cdn.addressiqpro.com/v{n.n.n}/iqcollect.js`
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
  BusinessBranding,
  SavedAddress,
} from './types';
export { BROWSER_VERIFICATION_NOT_SUPPORTED_ERROR } from './types';
export type { LocationProvider, LocationFix } from './location-provider';

import type { IQCollectConfig, AddressData, IQCollectError, SavedAddress } from './types';
import { BROWSER_VERIFICATION_NOT_SUPPORTED_ERROR } from './types';
import { FlowController } from './flow';
import { BUILD_CONFIG } from './buildConfig';
import { HostBridge } from './host-bridge';
import { BrowserLocationProvider, BridgeLocationProvider, type LocationProvider } from './location-provider';

const SDK_VERSION = '0.1.0';

// ── Reference-data persistent cache ──
// Countries/states change rarely, so persist them in localStorage across sessions
// (not just in-memory). Bump REF_CACHE_VERSION to invalidate on shape changes.
const REF_CACHE_VERSION = 1;
const REF_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function readRefCache<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(`iqcollect:ref:${key}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { v: number; t: number; data: T };
    if (parsed.v !== REF_CACHE_VERSION || Date.now() - parsed.t > REF_CACHE_TTL_MS) return null;
    return parsed.data;
  } catch {
    return null; // localStorage unavailable (private mode / some webviews) or bad JSON.
  }
}

function writeRefCache(key: string, data: unknown): void {
  try {
    localStorage.setItem(`iqcollect:ref:${key}`, JSON.stringify({ v: REF_CACHE_VERSION, t: Date.now(), data }));
  } catch {
    // Storage full/blocked — the in-memory cache still serves this session.
  }
}

/** API URL per environment. Integrators pass `environment`, not a URL. */
const ENVIRONMENT_URLS: Record<'sandbox' | 'production' | 'development', string> = {
  sandbox: 'https://api-staging.addressiqpro.com',
  // Baked in at build from the GH `ADDRESSIQ_API_URL` variable (see buildConfig).
  production: BUILD_CONFIG.apiUrl,
  development: 'http://localhost:3355',
};

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
  /** API base URL resolved from `config.environment`. */
  private readonly apiUrl: string;
  private readonly mount: HTMLElement;
  private readonly bridge: HostBridge | null;
  private readonly locationProvider: LocationProvider;
  private opened = false;
  /** Reference-data caches (countries once; states per country code). */
  private countriesCache: Array<{ code: string; name: string }> | null = null;
  private readonly statesCache: Record<string, Array<{ code: string; name: string }>> = {};

  constructor(mount: HTMLElement, config: IQCollectConfig) {
    if (typeof window === 'undefined') {
      throw new Error('IQCollect can only run in a browser environment');
    }
    if (!mount) throw new Error('IQCollect: mount element is required');
    if (!config.apiKey) throw new Error('IQCollect: apiKey is required');
    if (!config.appUserId) throw new Error('IQCollect: appUserId is required');

    // Resolve the API URL purely from `environment` (integrators pass an enum,
    // never a URL). Defaults to production.
    this.apiUrl = ENVIRONMENT_URLS[config.environment ?? 'production'];
    this.config = config;
    this.mount = mount;
    // In a native webview the shell owns the Always/Precise prompt + fix.
    this.bridge = HostBridge.detect();
    this.locationProvider =
      config.locationProvider ??
      (this.bridge ? new BridgeLocationProvider(this.bridge) : new BrowserLocationProvider());
  }

  /** Render the full collect/verify flow into the mount. Subsequent calls are no-ops. */
  open(): void {
    if (this.opened) return;
    this.opened = true;
    this.mount.dataset.iqcollectVersion = SDK_VERSION;
    const flow = new FlowController(this.mount, {
      business: this.config.business,
      theme: this.config.theme,
      platform: this.config.platform,
      locationProvider: this.locationProvider,
      loadConfig: () => this.fetchWidgetConfig(),
      listAddresses: () => this.listAddresses(),
      fetchCountries: () => this.fetchCountries(),
      fetchStates: (code) => this.fetchStates(code),
      startVerification: (locationCode) => this.startVerification(locationCode),
      submit: (input) => this.submit(input),
      onClose: () => this.close(),
    });
    void flow.start();
  }

  /**
   * Fetch the widget bootstrap config for the tenant behind the API key: the
   * business identity (name, logo, colour) AND the Google Maps key. Both belong
   * to the platform/backend — the integrator supplies neither. Returns empty on
   * failure; the flow falls back to any client-supplied values, then defaults.
   */
  async fetchWidgetConfig(): Promise<{ business: import('./types').BusinessBranding | null; googleMapsApiKey?: string }> {
    try {
      const res = await fetch(
        `${this.apiUrl}/api/v1/widget/config?appUserId=${encodeURIComponent(this.config.appUserId)}`,
        { headers: this.headers() },
      );
      if (!res.ok) return { business: null };
      const body = await res.json().catch(() => ({}));
      const b = body as { business?: import('./types').BusinessBranding; googleMapsApiKey?: string };
      return { business: b.business ?? null, googleMapsApiKey: b.googleMapsApiKey };
    } catch {
      return { business: null };
    }
  }

  /**
   * List the user's previously saved addresses (across businesses). Drives the
   * address-book screen; an empty list means the flow goes straight to collect.
   */
  async listAddresses(): Promise<SavedAddress[]> {
    const res = await fetch(
      `${this.apiUrl}/api/v1/locations?appUserId=${encodeURIComponent(this.config.appUserId)}`,
      { headers: this.headers() },
    );
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      this.config.onError?.(this.errorFrom(body, res.status, 'Failed to list addresses'));
      return [];
    }
    // The API returns a bare array; some gateways wrap it as { addresses: [...] }.
    // Accept either shape.
    const list = Array.isArray(body)
      ? (body as SavedAddress[])
      : ((body as { addresses?: SavedAddress[] }).addresses ?? []);
    return list.filter((a) => a.locationCode);
  }

  /**
   * Start a verification for an EXISTING saved address. This is the terminal
   * step of the address-book path — no collect steps run. Server sends the
   * "keep your location on" email.
   */
  async startVerification(locationCode: string): Promise<{ verificationId: string }> {
    const res = await fetch(`${this.apiUrl}/api/v1/verifications/start`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ appUserId: this.config.appUserId, locationCode }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = this.errorFrom(body, res.status, 'Failed to start verification');
      this.config.onError?.(err);
      this.bridge?.emit('error', err);
      throw err;
    }
    const verificationId = (body as { verificationId: string }).verificationId;
    this.bridge?.emit('verificationStarted', { locationCode, verificationId });
    return { verificationId };
  }

  /**
   * ISO-3166 countries for the address form's Country dropdown, fetched from the
   * backend (the canonical list) and cached. Returns [] on failure so the widget
   * falls back to its small embedded list.
   */
  async fetchCountries(): Promise<Array<{ code: string; name: string }>> {
    if (this.countriesCache) return this.countriesCache;
    const cached = readRefCache<Array<{ code: string; name: string }>>('countries');
    if (cached && cached.length) return (this.countriesCache = cached);
    try {
      const res = await fetch(`${this.apiUrl}/api/v1/reference/countries`, { headers: this.headers() });
      if (!res.ok) return [];
      const body = await res.json().catch(() => []);
      const list = Array.isArray(body) ? (body as Array<{ code: string; name: string }>) : [];
      if (list.length) {
        this.countriesCache = list;
        writeRefCache('countries', list);
      }
      return list;
    } catch {
      return [];
    }
  }

  /**
   * First-level subdivisions for a country (by ISO code), fetched lazily and
   * cached per country. Returns [] on failure or when the country has none.
   */
  async fetchStates(countryCode: string): Promise<Array<{ code: string; name: string }>> {
    const key = (countryCode || '').toUpperCase();
    if (!key) return [];
    if (this.statesCache[key]) return this.statesCache[key];
    const cached = readRefCache<Array<{ code: string; name: string }>>(`states:${key}`);
    if (cached) return (this.statesCache[key] = cached);
    try {
      const res = await fetch(
        `${this.apiUrl}/api/v1/reference/countries/${encodeURIComponent(key)}/states`,
        { headers: this.headers() },
      );
      if (!res.ok) return [];
      const body = await res.json().catch(() => []);
      const list = Array.isArray(body) ? (body as Array<{ code: string; name: string }>) : [];
      this.statesCache[key] = list;
      writeRefCache(`states:${key}`, list);
      return list;
    } catch {
      return [];
    }
  }

  private headers(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      'x-api-key': this.config.apiKey,
      'x-sdk-name': 'iqcollect-web',
      'x-sdk-version': SDK_VERSION,
    };
  }

  private errorFrom(body: unknown, status: number, fallback: string): IQCollectError {
    return {
      code: (body as { code?: string }).code ?? `HTTP_${status}`,
      message: (body as { message?: string }).message ?? `${fallback} (${status})`,
    };
  }

  /** Tear down the UI, unbind listeners. */
  close(): void {
    if (!this.opened) return;
    this.opened = false;
    this.mount.innerHTML = '';
    this.config.onClose?.();
    this.bridge?.emit('close');
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
    propertyNumber?: string;
    streetName?: string;
    buildingColor?: string;
    directions?: string;
    placeId?: string;
    streetviewPanoId?: string;
    plusCode?: string;
  }): Promise<AddressData> {
    const idempotencyKey = this.config.idempotencyKey ?? this.makeIdempotencyKey();
    // Collect a new Location. On native, verification is started by the shell
    // after handoff of the locationCode; the mock/server may also start it and
    // send the "keep your location on" email.
    const res = await fetch(`${this.apiUrl}/api/v1/locations/collect`, {
      method: 'POST',
      headers: { ...this.headers(), 'idempotency-key': idempotencyKey },
      body: JSON.stringify({
        appUserId: this.config.appUserId,
        lat: input.lat,
        lon: input.lon,
        formattedAddress: input.formattedAddress,
        placeId: input.placeId,
        propertyName: input.propertyName,
        propertyNumber: input.propertyNumber,
        streetName: input.streetName,
        buildingColor: input.buildingColor,
        directions: input.directions,
        streetviewPanoId: input.streetviewPanoId,
        plusCode: input.plusCode,
        locationType: 'HOME',
        consentVersion: this.config.business?.consentVersion,
        ...(this.config.prefill ?? {}),
      }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      const error = this.errorFrom(body, res.status, 'Submission failed');
      this.config.onError?.(error);
      this.bridge?.emit('error', error);
      throw error;
    }
    const locationCode = (body as { locationCode: string }).locationCode;
    const data: AddressData = {
      id: locationCode,
      locationCode,
      formattedAddress: input.formattedAddress,
      geoPoint: { lat: input.lat, lng: input.lon },
      propertyName: input.propertyName,
      streetName: input.streetName,
      plusCode: input.plusCode,
    };
    this.config.onAddressSelected?.(data);
    this.bridge?.emit('addressSelected', data);
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
