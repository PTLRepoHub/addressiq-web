# Releasing `@addressiq/iqcollect-web`

This repo publishes the **AddressIQ IQCollect web SDK** to npm as
**`@addressiq/iqcollect-web`** (current version **`0.5.3`** — see
`package.json:3`, `.release-please-manifest.json:2`). Scope: address collection
only; verification lives in the mobile SDKs (`package.json:4`).

Releases are automated end to end via **release-please** plus a
**tag-triggered `release.yml`**. You should never tag or run `npm publish`
by hand — the flow below does both for you.

A release fans out to **three** publishing workflows, all of which build the
bundle and all of which run `npm run check-config` on the emitted bytes before
publishing anything (§2c): `release.yml` (npm), `cdn.yml` (the two CDNs, §2b)
and `widget-fanout.yml` (the four native SDKs, §1).

---

## 1. What ships, and the widget fanout

- **npm package:** `@addressiq/iqcollect-web` (`package.json:2`), published with
  public access (`package.json:18-20`, and `--access public` in
  `release.yml:65,67`). Only `dist/` is packed (`package.json:15-17`).
- **`widget-fanout.yml`** keeps the four native SDKs' widget pin in sync. **The
  SDKs no longer vendor the bundle — they load the SRI-pinned copy from the CDN at
  runtime.** On a **web release** (`release: published`) the job computes the
  version + SRI hash, then opens a pin-bump PR in each of `addressiq-ios`,
  `addressiq-flutter`, `addressiq-android`, `addressiq-react-native` writing **two
  files** into each:

  | File | Contents |
  |---|---|
  | `.widget-version` | `vX.Y.Z` |
  | `.widget-integrity` | the `sha384-…` SRI hash of `iqcollect.js` |

  Each PR lands as `chore(widget): bump CDN widget pin to web vX.Y.Z`, so
  release-please in the consumer cuts a release on merge. A `workflow_dispatch` run
  defaults to `dry_run: true` — compute and diff, open no PRs.

  The SDK bakes both files into its build config and loads
  `https://{cdn}/v{X.Y.Z}/iqcollect.js` with
  `<script integrity="sha384-…" crossorigin="anonymous">`. **There is no fallback**
  — a failed load surfaces `WIDGET_LOAD_FAILED`. The hash is generated from **the
  same build `cdn.yml` uploads on the same release event**, which is what makes the
  pinned hash match the bytes the CDN actually serves. The CDN is therefore load-
  bearing for our own mobile apps, not a web-partner-only concern.

  > **History:** the fanout used to copy the bundle *into* each SDK as an offline
  > fallback, which required a second, key-free build for `addressiq-flutter` alone
  > (pub.dev rejects a package containing a Google API key). Both are gone: no
  > bundle is vendored, so there is nothing to strip and nothing to copy — the job
  > writes only the pin. `--allow-empty-maps-key` on `check-baked-config.mjs` is now
  > only a local-build convenience.

  > **The Maps key is public by design.** It is baked into the CDN bundle and the
  > npm bundle and is readable by anyone who reads the JS. Secrecy is not the
  > control: the key **must** be restricted in the Google Cloud Console (HTTP
  > referrer + API restrictions). The key-free Flutter bundle exists only to get
  > past pub.dev's scanner, not to keep the key secret.

---

## 2. Release flow (all automated — do NOT tag manually)

```
Conventional Commits on main
        │  (release-please.yml: push to main, release-please.yml:13-16)
        ▼
release-please maintains a "chore: release X.Y.Z" PR
        │  (title pattern, release-please-config.json:5)
        ▼  merge the PR
package.json version bumped + CHANGELOG.md written + tag vX.Y.Z pushed
        │  (release-type "node", release-please-config.json:8; CHANGELOG.md path :9)
        ▼  tag push
release.yml runs: install → build → test → npm publish
        │  (release.yml:9-10 trigger, :28-47)
        ▼
@addressiq/iqcollect-web published to npm
```

**The tag is minted for you.** release-please pushes `vX.Y.Z` on PR merge;
`release.yml` fires on `push: tags: ["v*.*.*"]` (`release.yml:9-10`). Do not
`git tag` by hand — a hand-pushed tag would publish whatever `package.json`
says and bypass the changelog/version bump.

**Why a GitHub App and not the default token:** GitHub does not fire workflows
for events created with the default `GITHUB_TOKEN` (loop prevention). So
`release-please.yml` mints a GitHub App token
(`actions/create-github-app-token@v1`, `release-please.yml:29-34`) and hands it
to the release-please action (`release-please.yml:36-38`). An App-authored tag
push **does** trigger `release.yml` (`release-please.yml:6-9`).

Tags separate as `vX.Y.Z` (no component in the tag), matching the
`v*.*.*` trigger (`release-please-config.json:3-4`).

---

## 2b. CDN publish (`cdn.yml`) — two environments

`cdn.yml` builds, **verifies the baked config** (§2c), size-checks, generates
`MANIFEST.json`, and uploads to **DigitalOcean Spaces**. It publishes to **two
separate CDNs with two separate sets of credentials** (`cdn.yml:56-61,78-101`):

| Trigger | Target | GitHub Environment | Host (both live) |
|---|---|---|---|
| push to **`staging`** branch | staging CDN | `staging` | `cdn-staging.addressiqpro.com` |
| **`release: published`** | production CDN | `production` | `cdn.addressiqpro.com` |
| `workflow_dispatch` | either (`target` input) | picked | — |

**Credentials come from GitHub Environments, not repo secrets** (`cdn.yml:86-101`).
A run targeting `staging` can only see the staging Spaces key — it is not merely
*configured* not to touch the prod bucket, it *cannot*. Configure under
**Settings → Environments**:

| Kind | Name | Value |
|---|---|---|
| Secret | `SPACES_ACCESS_KEY_ID` | DO **Spaces** access key (API → Spaces Keys — *not* a DO API token) |
| Secret | `SPACES_SECRET_ACCESS_KEY` | the paired secret |
| Secret | `GOOGLE_MAPS_SDK_KEY` | the Maps JS key for that environment |
| Var | `SPACES_BUCKET` | Space name for that environment |
| Var | `SPACES_REGION` | e.g. `nyc3` (endpoint is derived: `nyc3.digitaloceanspaces.com`) |
| Var | `CDN_BASE_URL` | the host **this environment uploads to** — e.g. `https://cdn-staging.addressiqpro.com` / `https://cdn.addressiqpro.com` |

**`GOOGLE_MAPS_SDK_KEY` is environment-scoped too** (`cdn.yml:17-24`), so a staging
build bakes the staging key and a production build the production one — the two
bundles are deliberately **not** byte-identical, which is fine because they are
uploaded to different CDNs and hashed independently.

⚠ **Any workflow that builds a shippable bundle must therefore bind to an
environment**, or the secret resolves to an empty string and ships a widget whose
Maps autocomplete silently does nothing. `release.yml:26` and
`widget-fanout.yml:45` are both pinned to `environment: production` for exactly
this reason — and `check-config` (§2c) asserts it worked.

The six `*_ADDRESSIQ_*_BASE_URL` build vars stay at **repo** level: the bundle
bakes *both* host sets in and switches at runtime (`src/buildConfig.ts:36-63`).

> **The Maps key baked into the CDN bundle is public.** Anyone can read it out of
> the served JS — that is by design. Restrict it in the Google Cloud Console (HTTP
> referrer + API restrictions); do not treat it as a secret.

**Why production publishes on `release: published`, not a branch push.** That same
event runs `widget-fanout.yml`, which writes `.widget-version` + `.widget-integrity`
into the four SDK repos **from the same build uploaded here**. CDN bytes, vendored
bytes, and the SRI hash the SDKs pin therefore come from one build and cannot
drift. A branch push would decouple them, and an SDK could pin a hash for bytes
that were never published.

**The layout is immutable and versioned. There is no `latest/` or `v0/` alias.**
The reason is SRI: **the four native SDKs** (via `.widget-integrity`, §1) and web
partners both pin `<script integrity="sha384-…">`, and a floating URL cannot be
pinned. New version ⇒ new prefix:

```
cdn.addressiqpro.com/v0.5.3/iqcollect.js       (+ .js.map)
cdn.addressiqpro.com/v0.5.3/index.esm.js       (+ .js.map)
cdn.addressiqpro.com/v0.5.3/index.cjs.js       (+ .js.map)
cdn.addressiqpro.com/v0.5.3/MANIFEST.json
```

Objects ship `cache-control: public, max-age=31536000, immutable`, so there is no
purge step to get wrong.

**Overwrite policy differs by target** (`cdn.yml:193-216`):

- **production** — write-once. A re-run against an existing `/v{x.y.z}/` prefix
  **fails** (`cdn.yml:211-213`). Partners and the SDKs' SRI pins depend on those
  bytes.
- **staging** — overwrite is **allowed**, so the branch can be iterated on without
  a version bump. ⚠ The job emits a warning when it overwrites (`cdn.yml:216`): any
  SDK staging build that already pinned an SRI hash for that version will now
  **fail the integrity check — and, since the SDKs ship no bundled fallback, the
  collect UI will not render at all** (it reports `WIDGET_LOAD_FAILED`). Bump the
  version so the pin matches the freshly overwritten bytes.

Three guards that apply to both:

1. **`check-config` on the emitted bytes** (`cdn.yml:143-144`) — see §2c; runs
   before the upload can happen.
2. **Upload list comes from `MANIFEST.json`, not a `dist/` glob**
   (`cdn.yml:228-230`) — the bytes uploaded are exactly the bytes that were hashed.
3. **Read-back verification** (`cdn.yml:259-291`) — every object is re-downloaded
   from the origin and re-hashed against `MANIFEST.json`; a mismatch fails the run.

`scripts/generate-manifest.mjs` resolves the manifest's `cdn` field from
`CDN_BASE_URL`, the same var `cdn.yml` uploads to, and the workflow asserts the
two agree — so a manifest can never advertise a URL it isn't writing.

Also required in DigitalOcean, once **per environment**: create the Space, **enable
its CDN**, attach the subdomain (Spaces → Settings → CDN, with a Let's Encrypt
cert), and point the CNAME at the Spaces CDN endpoint.

---

## 2c. `check-config` — assert on the bytes, not the config

`scripts/check-baked-config.mjs` (npm script `check-config`, `package.json:31`)
reads `dist/iqcollect.js` and asserts that (1) `GOOGLE_MAPS_SDK_KEY` is actually
baked in — the terser output is `googleMapsApiKey||"<key>"`, and an unbaked build
renders `googleMapsApiKey||""` (`scripts/check-baked-config.mjs:40-53`) — and (2)
no `__ADDRESSIQ_*` / `__GOOGLE_MAPS_SDK_KEY__` build placeholder is left unresolved
(`scripts/check-baked-config.mjs:57-59`).

It runs, **without** the escape-hatch flag, in **all three** publishing workflows
before anything is published: `release.yml:49-50`, `cdn.yml:143-144`,
`widget-fanout.yml:70-71`. Local builds may pass `--allow-empty-maps-key`
(`scripts/check-baked-config.mjs:25`); the Flutter key-free build uses that flag to
assert the *opposite* (`widget-fanout.yml:126`).

**Why it exists — the most useful lesson in this repo.** The six-variable build
refactor silently dropped `GOOGLE_MAPS_SDK_KEY` from the `env:` block of
`release.yml` and `widget-fanout.yml`. Both workflows still *mentioned* the key —
in a comment — so grepping the workflow files for it looked correct. **A missing
build secret does not fail a build:** the `__GOOGLE_MAPS_SDK_KEY__` placeholder
resolves to an empty string, `BUILD_CONFIG.mapsKey` falls back to `''`
(`src/buildConfig.ts:66-69`), and the bundle is perfectly valid. npm **v0.5.0** and
the widget fanned out to all four SDKs shipped with `googleMapsApiKey || ""` —
Places autocomplete silently dead, discoverable only in a partner's app. Only the
SRI pin caught it: the fanout bundle no longer matched the CDN bundle. (Fixed in
v0.5.1, `CHANGELOG.md:15`.)

The takeaway is general: **grepping a config file cannot catch this class of bug.
Only an assertion on the emitted artifact can.**

---

## 3. Auth and secrets

**npm publish (`release.yml`):** uses an npm automation token in the
`NPM_TOKEN` secret, exposed to the publish step as `NODE_AUTH_TOKEN`
(`release.yml:6,53-54`) with the registry set to `registry.npmjs.org`
(`release.yml:32`). There is **no npm provenance / OIDC** configured in this
workflow — auth is the `NPM_TOKEN` secret only.

**release-please tag push (`release-please.yml`) and widget fanout
(`widget-fanout.yml`):** authenticate via a **GitHub App**, using secrets
`ADDRESSIQ_BOT_APP_ID` and `ADDRESSIQ_BOT_PRIVATE_KEY`
(`release-please.yml:11,33-34`; `widget-fanout.yml:17,172-173`). In the fanout the
token is minted **per matrix leg** and narrowed to that one consumer repo
(`repositories: ${{ matrix.repo }}`, `widget-fanout.yml:174-175`), so a leg
writing to one consumer holds no credential for the others. This is the same
App used by release-please. The App needs only `contents: write` and
`pull_requests: write` (per RELEASE-ENGINEERING.md §4.A).

**Build secrets are environment-scoped, not repo-scoped.** `GOOGLE_MAPS_SDK_KEY`
and the two `SPACES_*` keys live in the `staging` / `production` GitHub
Environments (§2b). Any job that builds a shippable bundle must declare
`environment:` — `release.yml:26` and `widget-fanout.yml:45` declare `production`;
`cdn.yml:89` resolves it from the trigger.

---

## 4. Versioning rules (release-please)

release-please derives both the version bump and CHANGELOG entirely from
Conventional Commit messages. With `bump-minor-pre-major: true`
(`release-please-config.json:10`), while the package is pre-1.0:

| Commit type | Bump |
|---|---|
| `fix:` | patch (e.g. `0.2.0 → 0.2.1`) |
| `feat:` | minor (e.g. `0.2.0 → 0.3.0`) |
| `feat!:` / breaking change | **minor** while pre-1.0 (not major, because `bump-minor-pre-major`) |

A branch with no Conventional Commits proposes **no release at all** — commit
messages are the sole input.

---

## 5. Local validation

Validate packaging without publishing, using the same registry step
`release.yml` uses on a dry run (`release.yml:65`):

```bash
npm install
npm run build
npm run check-config -- --allow-empty-maps-key   # a local build has no Maps key
npm test
npm publish --access public --no-workspaces --dry-run
```

Or inspect the tarball contents (respects the `files` allowlist in
`package.json:15-17`):

```bash
npm pack --dry-run
```

You can also trigger the real workflow in dry-run mode from the Actions tab:
`workflow_dispatch` on **Release** defaults to `dry_run: true`, which validates
packaging and publishes nothing (`release.yml:11-16,61,64-65`). **CDN** and
**widget-fanout** have the same dry-run default (`cdn.yml:68-71`,
`widget-fanout.yml:23-27`).

---

## 6. One-time npm setup

Before the first real publish (per RELEASE-ENGINEERING.md §4.C):

1. **Claim the `@addressiq` scope** on npmjs.com if it does not already exist.
2. **Grant publish rights to the token.** Either configure OIDC trusted
   publishing per package (no long-lived secret — preferred), or create a
   granular access token scoped to `@addressiq` and store it as the
   `NPM_TOKEN` secret on this repo (which is what `release.yml:33` currently
   reads). The package is unpublished today, so the first publish creates it.
