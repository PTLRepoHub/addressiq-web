export interface IQCollectConfig {
  apiKey: string;
  apiUrl?: string;
  appUserId: string;
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
  docsUrl: 'https://docs.addressiq.com/sdks/web#why-no-verification',
};
