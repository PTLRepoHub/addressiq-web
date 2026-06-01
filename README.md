# AddressIQ IQCollect — Web SDK

[![CI](https://github.com/PTLRepoHub/addressiq-web/actions/workflows/ci.yml/badge.svg)](https://github.com/PTLRepoHub/addressiq-web/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@addressiq/iqcollect-web.svg)](https://www.npmjs.com/package/@addressiq/iqcollect-web)

`@addressiq/iqcollect-web` is the browser **address-collection** SDK for
AddressIQ (form + map pin + consent). Verification is mobile-only — the web SDK
intentionally exposes no `verify()` surface.

Ships two ways from one source:
- **npm / bundler** — ESM + CJS, tree-shakeable.
- **CDN UMD** — `window.AddressIQ.IQCollect` via a `<script>` tag.

## Repository layout

```
.                  ← the SDK (@addressiq/iqcollect-web)
  src/             SDK source
  __tests__/       smoke test (jest)
  examples/web/    runnable example, linked to the LOCAL SDK (npm workspace)
```

## Develop

```bash
npm install        # links examples/web → the local SDK via npm workspaces
npm run build      # rollup → dist/ (ESM, CJS, UMD)
npm test           # jest smoke test
npm run type-check # tsc --noEmit
```

## Run the example against your local SDK

```bash
npm run example    # builds the SDK, then serves examples/web at :8080
```

`examples/web` depends on `@addressiq/iqcollect-web: "*"`, resolved to this
repo's package via npm workspaces — so edits to `src/` are reflected after a
rebuild. The `index.html` also shows the CDN drop-in pattern.

## Release

Push a semver tag to publish to npm (`.github/workflows/release.yml`):

```bash
git tag v0.1.0 && git push origin v0.1.0
```

Requires the `NPM_TOKEN` repository secret. Run the workflow manually with
`dry_run: true` to validate packaging first.

## Contributing

Fork, branch, and open a PR. CI builds the SDK, runs the smoke test, and
type-checks the example on every push/PR.
