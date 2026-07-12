# Changelog

## [0.4.1](https://github.com/PTLRepoHub/addressiq-web/compare/v0.4.0...v0.4.1) (2026-07-12)


### Bug Fixes

* bound the Google Maps script load so a blocked request can't blank the widget ([#8](https://github.com/PTLRepoHub/addressiq-web/issues/8)) ([4e6cdb7](https://github.com/PTLRepoHub/addressiq-web/commit/4e6cdb7a3b6b0ea37952487d27dc52497a286383))

## [0.4.0](https://github.com/PTLRepoHub/addressiq-web/compare/v0.3.0...v0.4.0) (2026-07-12)


### ⚠ BREAKING CHANGES

* removed IQCollectConfig.apiUrl and IQCollectConfig.googleMapsApiKey. Select a host via `environment` (production | sandbox | development); the production host and Maps key are provisioned at build time.

### Features

* provision API URL (+ web: Maps key) at build time from GH env ([#6](https://github.com/PTLRepoHub/addressiq-web/issues/6)) ([39f253e](https://github.com/PTLRepoHub/addressiq-web/commit/39f253e82df86df8d5a311028f661c8a75b6dd47))

## [0.3.0](https://github.com/PTLRepoHub/addressiq-web/compare/v0.2.0...v0.3.0) (2026-07-10)


### Features

* **proto:** regen against proto v0.1.0 ([#2](https://github.com/PTLRepoHub/addressiq-web/issues/2)) ([e709b11](https://github.com/PTLRepoHub/addressiq-web/commit/e709b11feae793edbf94d36088886335477026dd))

## [0.2.0](https://github.com/PTLRepoHub/addressiq-web/compare/v0.1.0...v0.2.0) (2026-07-10)


### Features

* AddressIQ IQCollect web SDK + example + CI/CD ([292191d](https://github.com/PTLRepoHub/addressiq-web/commit/292191dd3fc48137d41841e58bc55286fb6edec7))
* fan out widget releases to the four SDK repos ([2728af4](https://github.com/PTLRepoHub/addressiq-web/commit/2728af49e56f9ba745b670b07dd50fa97fdc5c2b))
* **proto:** generate wire-contract bindings from AddressIq-proto ([40ed35e](https://github.com/PTLRepoHub/addressiq-web/commit/40ed35e4649a0bf8c985c775c1596268afee6b22))


### Bug Fixes

* **ci:** repair shell syntax error in release.yml ([754cbda](https://github.com/PTLRepoHub/addressiq-web/commit/754cbda77bf59e0a12f420c3d46bf45f8815ff23))
* **ci:** set bump-minor-pre-major in release-please config ([dffe047](https://github.com/PTLRepoHub/addressiq-web/commit/dffe047349b4b7a7cffc25018593425438ad431f))
* point all URLs at addressiqpro.com ([df5a8b5](https://github.com/PTLRepoHub/addressiq-web/commit/df5a8b5791ea3faee0e63c8537a156299d0fbc54))
