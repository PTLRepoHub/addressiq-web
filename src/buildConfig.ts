/**
 * Build-time configuration baked into the bundle by Rollup.
 *
 * `@rollup/plugin-replace` substitutes `__ADDRESSIQ_API_URL__` and
 * `__GOOGLE_MAPS_SDK_KEY__` with string literals sourced from the GitHub
 * environment at build time (the `ADDRESSIQ_API_URL` variable and the
 * `GOOGLE_MAPS_SDK_KEY` secret). Integrators never provide either value.
 *
 * The `typeof` guards keep this file safe under `tsc --noEmit` and Jest, where
 * the globals are never defined and no replacement happens — those runs fall
 * back to the defaults below.
 */

declare const __ADDRESSIQ_API_URL__: string | undefined;
declare const __GOOGLE_MAPS_SDK_KEY__: string | undefined;

export const BUILD_CONFIG = {
  /** Production API host. Rollup injects the GH `ADDRESSIQ_API_URL` variable. */
  apiUrl:
    typeof __ADDRESSIQ_API_URL__ !== 'undefined' && __ADDRESSIQ_API_URL__
      ? __ADDRESSIQ_API_URL__
      : 'https://api.addressiqpro.com',
  /** Default Google Maps JS key. Rollup injects the GH `GOOGLE_MAPS_SDK_KEY` secret. */
  mapsKey:
    typeof __GOOGLE_MAPS_SDK_KEY__ !== 'undefined' && __GOOGLE_MAPS_SDK_KEY__
      ? __GOOGLE_MAPS_SDK_KEY__
      : '',
} as const;
