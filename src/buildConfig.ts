/**
 * Build-time configuration baked into the bundle by Rollup.
 *
 * `@rollup/plugin-replace` (see rollup.config.mjs — plugin-replace IS this
 * repo's baking mechanism, the equivalent of the mobile SDKs' generated
 * BuildConfig source file) substitutes each `__ADDRESSIQ_*__` global with a
 * string literal sourced from the GitHub environment at build time — three
 * URLs per shippable environment, from the repository variables:
 *
 *   STAGING_ADDRESSIQ_API_BASE_URL       PROD_ADDRESSIQ_API_BASE_URL
 *   STAGING_ADDRESSIQ_INGEST_BASE_URL   PROD_ADDRESSIQ_INGEST_BASE_URL
 *   STAGING_ADDRESSIQ_CDN_BASE_URL      PROD_ADDRESSIQ_CDN_BASE_URL
 *
 * plus `__GOOGLE_MAPS_SDK_KEY__` from the `GOOGLE_MAPS_SDK_KEY` secret.
 * Integrators never provide any of these values.
 *
 * `development` is deliberately NOT baked from CI: it points at a backend on
 * the developer's own machine, so it is a local-only concern and stays a
 * literal (http://localhost:4000) in ENVIRONMENT_URLS. Never ship a build
 * configured for `development`.
 *
 * The fallbacks below are the safe public defaults, so a local `npm run build`
 * with no env vars set still resolves real hosts. The `typeof` guards keep this
 * file safe under `tsc --noEmit` and Jest, where the globals are never defined
 * and no replacement happens — those runs fall back to the same defaults.
 */

declare const __ADDRESSIQ_STAGING_API_URL__: string | undefined;
declare const __ADDRESSIQ_STAGING_INGEST_URL__: string | undefined;
declare const __ADDRESSIQ_STAGING_CDN_URL__: string | undefined;
declare const __ADDRESSIQ_PROD_API_URL__: string | undefined;
declare const __ADDRESSIQ_PROD_INGEST_URL__: string | undefined;
declare const __ADDRESSIQ_PROD_CDN_URL__: string | undefined;
declare const __GOOGLE_MAPS_SDK_KEY__: string | undefined;

export const BUILD_CONFIG = {
  /** Staging hosts. Rollup injects the GH `STAGING_*_BASE_URL` variables. */
  stagingApiUrl:
    typeof __ADDRESSIQ_STAGING_API_URL__ !== 'undefined' && __ADDRESSIQ_STAGING_API_URL__
      ? __ADDRESSIQ_STAGING_API_URL__
      : 'https://api-staging.addressiqpro.com',
  stagingIngestUrl:
    typeof __ADDRESSIQ_STAGING_INGEST_URL__ !== 'undefined' && __ADDRESSIQ_STAGING_INGEST_URL__
      ? __ADDRESSIQ_STAGING_INGEST_URL__
      : 'https://ingest-api-staging.addressiqpro.com',
  stagingCdnUrl:
    typeof __ADDRESSIQ_STAGING_CDN_URL__ !== 'undefined' && __ADDRESSIQ_STAGING_CDN_URL__
      ? __ADDRESSIQ_STAGING_CDN_URL__
      : 'https://cdn-staging.addressiqpro.com',

  /** Production hosts. Rollup injects the GH `PROD_*_BASE_URL` variables. */
  prodApiUrl:
    typeof __ADDRESSIQ_PROD_API_URL__ !== 'undefined' && __ADDRESSIQ_PROD_API_URL__
      ? __ADDRESSIQ_PROD_API_URL__
      : 'https://api.addressiqpro.com',
  prodIngestUrl:
    typeof __ADDRESSIQ_PROD_INGEST_URL__ !== 'undefined' && __ADDRESSIQ_PROD_INGEST_URL__
      ? __ADDRESSIQ_PROD_INGEST_URL__
      : 'https://ingest-api.addressiqpro.com',
  prodCdnUrl:
    typeof __ADDRESSIQ_PROD_CDN_URL__ !== 'undefined' && __ADDRESSIQ_PROD_CDN_URL__
      ? __ADDRESSIQ_PROD_CDN_URL__
      : 'https://cdn.addressiqpro.com',

  /** Default Google Maps JS key. Rollup injects the GH `GOOGLE_MAPS_SDK_KEY` secret. */
  mapsKey:
    typeof __GOOGLE_MAPS_SDK_KEY__ !== 'undefined' && __GOOGLE_MAPS_SDK_KEY__
      ? __GOOGLE_MAPS_SDK_KEY__
      : '',
} as const;
