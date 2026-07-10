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

export interface IQCollectConfig {
  apiKey: string;
  /** Which hosted API to use. The SDK resolves the URL internally. */
  environment?: 'sandbox' | 'production';
  /** Override the resolved API URL — for local development only. */
  apiUrl?: string;
  appUserId: string;
  /** Per-business branding for the intro + collaboration + consent screens. */
  business?: BusinessBranding;
  /**
   * Location source. Defaults to the browser Geolocation API. Native webview
   * shells inject their own provider so Always/Precise permission + the fix are
   * owned natively.
   */
  locationProvider?: LocationProvider;
  /**
   * Google Maps JS API key. Normally the SDK fetches this from the backend
   * (`GET /api/v1/widget/config`), so integrators don't supply it — set this
   * only to override the platform key. Without any key the address step
   * degrades to a manual text field.
   */
  googleMapsApiKey?: string;
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
