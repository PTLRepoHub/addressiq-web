# AddressIQ IQCollect — Web SDK

[![CI](https://github.com/PTLRepoHub/addressiq-web/actions/workflows/ci.yml/badge.svg)](https://github.com/PTLRepoHub/addressiq-web/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@addressiq/iqcollect-web.svg)](https://www.npmjs.com/package/@addressiq/iqcollect-web)

`@addressiq/iqcollect-web` is the browser **address-collection** SDK for
AddressIQ (form + map pin + consent). Verification is mobile-only — the web SDK
intentionally exposes no `verify()` surface.

Ships three ways from one source:
- **npm / bundler** — ESM + CJS, tree-shakeable.
- **CDN UMD** — `window.AddressIQ.IQCollect` via a `<script>` tag, served from
  **`cdn.addressiqpro.com`** (staging: `cdn-staging.addressiqpro.com`). The layout
  is immutable and versioned — `https://cdn.addressiqpro.com/v0.5.3/iqcollect.js` —
  and every artifact is published with an SRI hash in `MANIFEST.json`, so pin it:

  ```html
  <script src="https://cdn.addressiqpro.com/v0.5.3/iqcollect.js"
          integrity="sha384-…"   <!-- from /v0.5.3/MANIFEST.json -->
          crossorigin="anonymous"></script>
  ```
- **Vendored into the four native SDKs** (iOS, Android, Flutter, React Native).
  They load the widget **from the same CDN with the same SRI pin**, and fall back
  to their vendored copy only if that fetch fails — so the CDN is not a
  web-partner-only concern. See [`docs/RELEASE.md`](docs/RELEASE.md) §1, §2b.

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
MOCK_UPSTREAM=1 PORT=4000 node server.js

# 2. Build the widget, then open the harness in a browser
cd ../addressiq-web
npm run build
open examples/web/local.html        # loads dist/iqcollect.js against http://localhost:4000
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
  // The SDK resolves the API URL from `deployment` — never pass a URL.
  // Defaults to 'production'; use 'staging' or 'development' as needed.
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

The SDK talks to the AddressIQ platform automatically — integrators pass no API
URL and no Google Maps key; select the target deployment via `deployment` (see
above). The hosts and a default Maps key are **baked into the bundle at build
time** (`src/buildConfig.ts`), and the backend's `GET /api/v1/widget/config` can
deliver a Maps key that **overrides** the baked one, so keys rotate without a
rebuild (`src/flow.ts:111`).

> **The baked Maps key is public.** It is in the CDN bundle and the npm bundle by
> design and is readable by anyone. Secrecy is not the control — the key is
> restricted in the Google Cloud Console (HTTP referrer + API restrictions).

## Deployment vs sandbox — two different things

These are orthogonal, and conflating them is the most common integration mistake:

| | What it selects | How you set it |
|---|---|---|
| **Deployment** | Which AddressIQ **hosts** you talk to | `config.deployment` |
| **Tenant mode** | Whether your data is **sandbox or production** | **Which API key you paste** |

`deployment` is one of `production` (default), `staging`, or `development`.
Anything else throws — including **`'sandbox'`, which is rejected**, because it
is not a deployment. Sandbox-vs-production is a property of your **API key**:
`aiq_test_…` resolves to a sandbox tenant server-side, `aiq_live_…` to a
production one. The SDK never sends a mode and cannot override the key's.

The two combine freely: an `aiq_test_…` key on the `production` deployment is
still sandbox data; an `aiq_live_…` key on `staging` is still production-mode data.

> **Migrating from `environment:`?** `environment: 'sandbox'` → drop the field and
> use a sandbox key (`aiq_test_…`), which is almost certainly what you meant. Use
> `deployment: 'staging'` only if you specifically wanted the pre-production *hosts*.
>
> Because this bundle is loaded from a `<script>` tag by plain JS, an unrecognised
> value **throws** rather than silently resolving to `undefined` hosts.

## Release

Releases are fully automated by **release-please** — do **not** tag or
`npm publish` by hand. Merging the `chore: release X.Y.Z` PR mints the tag, which
publishes to npm, to the production CDN, and fans the widget out to the four
native SDKs. See **[`docs/RELEASE.md`](docs/RELEASE.md)**.

## Contributing

Fork, branch, and open a PR. CI builds the SDK, runs the smoke test, and
type-checks the example on every push/PR.
