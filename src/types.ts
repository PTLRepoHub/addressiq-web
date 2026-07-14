import type { LocationProvider } from './location-provider';

/** Per-business branding + consent copy for the intro/consent screens. */
export interface BusinessBranding {
  /** Display name shown as "{displayName} uses AddressIQ to…". */
  displayName: string;
  /** Optional logo shown on the collaboration/consent screen. */
  logoUrl?: string;
  /** Primary accent colour (hex). Defaults to the AddressIQ brand colour. */
  primaryColor?: string;
  /** Secondary colour (hex) — used for secondary buttons. */
  secondaryColor?: string;
  /** Corner style for buttons. */
  borderRadius?: 'rounded' | 'more-rounded' | 'pill';
  /** Primary button treatment. */
  buttonStyle?: 'filled' | 'outline';
  /** Override the consent checkbox copy on the final consent screen. */
  consentCopy?: string;
  /** Consent version recorded with the submission. */
  consentVersion?: string;
}

/** A previously saved address returned by the address-book listing. */
export interface SavedAddress {
  locationCode: string;
  formattedAddress: string;
  lat?: number;
  lon?: number;
}

/**
 * Which AddressIQ DEPLOYMENT to talk to — i.e. which hosts. `staging` is the
 * pre-production deployment, named `staging` across all AddressIQ SDKs and
 * matching the `STAGING_*` build variables. `development` points at a backend on
 * the developer's own machine.
 *
 * This is NOT the tenant's mode. Sandbox-vs-production is a property of the API
 * KEY (`aiq_test_…` resolves to a sandbox tenant server-side, `aiq_live_…` to a
 * production one) and is decided entirely by the backend — the SDK neither sends
 * it nor can influence it. The axes are orthogonal: a test key against the
 * production deployment is still sandbox.
 *
 * `'sandbox'` was previously accepted here as an alias for `'staging'`, which
 * asserted that sandbox was a deployment. It is not, and it is now rejected.
 */
export type IQCollectDeployment = 'staging' | 'production' | 'development';

export interface IQCollectConfig {
  /**
   * Tenant API key. This — not `deployment` — decides whether the tenant is in
   * sandbox or production mode: `aiq_test_…` resolves to a sandbox App row
   * server-side, `aiq_live_…` to a production one.
   */
  apiKey: string;
  /**
   * Which DEPLOYMENT (i.e. which hosts) to target. The SDK resolves the URLs
   * internally — integrators never pass a URL. `development` points at a local
   * backend (http://localhost:4000); `production`/`staging` auto-resolve to the
   * hosted APIs. An unrecognised value throws; `'sandbox'` is not a deployment.
   */
  deployment?: IQCollectDeployment;
  /**
   * Google Maps JS key. **Development only** — supplying it with any other
   * `deployment` throws.
   *
   * The key is normally *platform-provisioned*: the widget fetches one from
   * `GET /api/v1/widget/config` and falls back to the key baked into this bundle.
   * Integrators never pass a Maps key, and this is not a partner-facing knob — it
   * exists for the one case that breaks: a local backend with no key configured.
   *
   * When set it takes precedence over both the remote value and the baked one:
   * it is useful precisely when the backend cannot supply a key.
   *
   * This is the ONLY SDK with a Maps-key override, and deliberately so — the key
   * is consumed here, by this bundle, which builds the `maps.googleapis.com`
   * script tag (`collect-form.ts`). The native SDKs merely host this widget in a
   * WebView and never touch a key.
   */
  googleMapsApiKey?: string;
  appUserId: string;
  /** Per-business branding for the intro + collaboration + consent screens. */
  business?: BusinessBranding;
  /**
   * Location source. Defaults to the browser Geolocation API. Native webview
   * shells inject their own provider so Always/Precise permission + the fix are
   * owned natively.
   */
  locationProvider?: LocationProvider;
  /** Country code (ISO 3166-1 alpha-2) used by the place-search API. */
  country?: string;
  /** Optional pre-filled customer details to skip the collection form. */
  prefill?: {
    phone?: string;
    email?: string;
    firstName?: string;
    lastName?: string;
  };
  /** Idempotency key generator override; defaults to an internal random key. */
  idempotencyKey?: string;
  onAddressSelected?: (address: AddressData) => void;
  onError?: (err: IQCollectError) => void;
  onClose?: () => void;
  theme?: 'light' | 'dark' | 'system';
  /**
   * Host OS, set by native shells (iOS/Android). Drives the platform-specific
   * "Location permission" Settings-route screen (labels + mockup differ per OS).
   * Omitted in a plain browser, where that screen never shows.
   */
  platform?: 'ios' | 'android';
}

export interface AddressData {
  id: string;
  locationCode: string;
  formattedAddress: string;
  geoPoint: { lat: number; lng: number };
  propertyName?: string;
  streetName?: string;
  plusCode?: string;
}

export interface IQCollectError {
  code: string;
  message: string;
  docsUrl?: string;
}

export const BROWSER_VERIFICATION_NOT_SUPPORTED_ERROR: IQCollectError = {
  code: 'BROWSER_VERIFICATION_NOT_SUPPORTED',
  message:
    'Browsers cannot perform background geofencing. Use the mobile SDK for digital verification.',
  docsUrl: 'https://docs.addressiqpro.com/sdks/web#why-no-verification',
};
