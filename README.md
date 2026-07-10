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

## Full flow locally (mock upstream)

The widget now drives the complete OkHi-style journey — intro → business
consent (accordion) → "verify where you live" → **address book** → collect /
verify. The address book and start-verification depend on the upstream API, so
for local work run the demo proxy in **mock mode** and open the dev harness:

```bash
# 1. Mock upstream — serves canned /api/v1/* (session, list, start-verify, collect)
cd ../addressiq-node-backend
MOCK_UPSTREAM=1 PORT=3355 node server.js

# 2. Build the widget, then open the harness in a browser
cd ../addressiq-web
npm run build
open examples/web/local.html        # loads dist/iqcollect.js against http://localhost:3355
```

- **Toggle the two address-book branches** by editing `hasSavedAddresses` in
  `addressiq-node-backend/mock-fixtures.json`:
  - `true` → the book renders; tapping **Verify** on a saved address starts a
    verification and ends the flow (no collect steps). The server logs a
    `would-send-email` line.
  - `false` → the book is skipped; the user goes through the full collect flow
    (address → street view → details → consent) to create a new address.
- The harness injects a **fake `LocationProvider`** (canned fix) so you don't
  need a GPS prompt. Untick it to use the real browser geolocation.
- Native shells reuse this exact widget in a webview and inject their own
  `LocationProvider` + host bridge so Always/Precise permission stays native.

## Server-minted session (production pattern)

The examples pass a literal string as `apiKey` for convenience. **In production,
do not ship a raw tenant key in the browser bundle.** Instead, the `apiKey`
config field should be a short-lived **session token minted by your backend**:

```js
// 1. Your backend mints a session (holds the real tenant key server-side)
const session = await fetch('/api/session', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ phone, firstName, lastName, email }),
}).then((r) => r.json());

// 2. Mount IQCollect with the minted token — NOT a raw tenant key
const collector = new AddressIQ.IQCollect(mountEl, {
  apiKey: session.sessionToken, // server-minted, short-lived
  appUserId: session.appUserId,
  apiUrl: session.apiUrl,
  onAddressSelected: (a) => console.log(a.locationCode),
});
collector.open();
```

The browser only ever sees the session token; the raw API key never leaves the
server. A runnable server example (the session minter + this paired browser
page) lives in
[addressiq-node-backend](https://github.com/PTLRepoHub/addressiq-node-backend).
As always, the web SDK is collect-only — it returns a `locationCode`, and
verification runs on the mobile SDK via `startVerification({ locationCode })`.

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
