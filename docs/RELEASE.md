# Releasing `@addressiq/iqcollect-web`

This repo publishes the **AddressIQ IQCollect web SDK** to npm as
**`@addressiq/iqcollect-web`** (current version **`0.2.0`** — see
`package.json:2`, `.release-please-manifest.json:2`). Scope: address collection
only; verification lives in the mobile SDKs (`package.json:4`).

Releases are automated end to end via **release-please** plus a
**tag-triggered `release.yml`**. You should never tag or run `npm publish`
by hand — the flow below does both for you.

---

## 1. What ships, and the widget fanout

- **npm package:** `@addressiq/iqcollect-web` (`package.json:1`), published with
  public access (`package.json:18-20`, and `--access public` in
  `release.yml:44,46`). Only `dist/` is packed (`package.json:15-17`).
- **`widget-fanout.yml`** keeps the vendored widget bundle in sync. `dist/iqcollect.js`
  is vendored byte-identical into four SDK repos, and previously nothing kept
  those copies current (`widget-fanout.yml:2-8`). On a **web release**
  (`release: published`, `widget-fanout.yml:19-21`) it builds the bundle once,
  then opens a re-vendor PR in each consumer:

  | Consumer repo | Destination (`widget-fanout.yml:68-77`) |
  |---|---|
  | `addressiq-ios` | `Sources/AddressIQ/Resources/iqcollect.js` |
  | `addressiq-flutter` | `assets/iqcollect.js` |
  | `addressiq-android` | `src/main/assets/iqcollect.js` |
  | `addressiq-react-native` | `src/ui/widgetBundle.ts` (regenerated TS string literal) |

  Each PR lands as `feat(widget): re-vendor iqcollect.js from web vX.Y.Z`
  (`widget-fanout.yml:143-144`), so **release-please in the consumer cuts a
  minor** on merge. React Native is special-cased because its bundle is a TS
  string literal rather than an asset (`widget-fanout.yml:75,107-120`). A
  `workflow_dispatch` run defaults to `dry_run: true` — build and diff, open no
  PRs (`widget-fanout.yml:23-27,137`).

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

## 2b. CDN publish (`cdn.yml`)

`rollup.config.mjs:6` and `scripts/generate-manifest.mjs:8` have always pointed
at `https://cdn.addressiqpro.com/v{x.y.z}/` — but nothing served that host
(RELEASE-ENGINEERING.md §6a). **`cdn.yml`** does: on `release: published` it
builds, size-checks, generates `MANIFEST.json`, and uploads to a **DigitalOcean
Spaces** bucket fronted by that domain.

**The layout is immutable and versioned. There is no `latest/` or `v0/` alias.**
The reason is SRI: `MANIFEST.json` exists so partners can pin
`<script integrity="sha384-…">`, and a floating URL cannot be pinned — pointing
it at a new build would break every pinned consumer. New version ⇒ new prefix:

```
cdn.addressiqpro.com/v0.3.0/iqcollect.js       (+ .js.map)
cdn.addressiqpro.com/v0.3.0/index.esm.js       (+ .js.map)
cdn.addressiqpro.com/v0.3.0/index.cjs.js       (+ .js.map)
cdn.addressiqpro.com/v0.3.0/MANIFEST.json
```

Objects ship `cache-control: public, max-age=31536000, immutable`, so there is
no purge step to get wrong.

Three guards, because a published SRI hash is pinned for a year:

1. **Upload list comes from `MANIFEST.json`, not a `dist/` glob** — the bytes on
   the CDN are exactly the bytes that were hashed.
2. **Existing versions are never overwritten** — a re-run against an existing
   `v{x.y.z}/` prefix fails rather than rewriting bytes someone has pinned.
3. **Read-back verification** — every object is downloaded from the origin after
   upload and re-hashed against `MANIFEST.json`; a mismatch fails the release.

The build bakes in the same six per-environment URLs (`STAGING_ADDRESSIQ_API_BASE_URL`,
`STAGING_ADDRESSIQ_INGEST_BASE_URL`, `STAGING_ADDRESSIQ_CDN_BASE_URL`, `PROD_ADDRESSIQ_API_BASE_URL`,
`PROD_ADDRESSIQ_INGEST_BASE_URL`, `PROD_ADDRESSIQ_CDN_BASE_URL`) + `GOOGLE_MAPS_SDK_KEY` as
`release.yml` and `widget-fanout.yml`, so the CDN, npm, and vendored bundles are
byte-comparable. `workflow_dispatch` defaults to `dry_run: true` (build, hash,
and check the CDN — upload nothing).

**Config** (one-time, in repo Settings):

| Kind | Name | Value |
|---|---|---|
| Secret | `SPACES_ACCESS_KEY_ID` | DO **Spaces** access key (API → Spaces Keys — *not* a DO API token) |
| Secret | `SPACES_SECRET_ACCESS_KEY` | the paired secret |
| Var | `SPACES_BUCKET` | Space name, e.g. `addressiq-cdn` |
| Var | `SPACES_REGION` | e.g. `nyc3` (endpoint is derived: `nyc3.digitaloceanspaces.com`) |
| Var | `PROD_ADDRESSIQ_CDN_BASE_URL` | the production CDN host, e.g. `https://cdn.addressiqpro.com` (also baked into the bundle) |
| Var | `CDN_BASE_URL` | optional override of the host *this workflow uploads to*; defaults to `PROD_ADDRESSIQ_CDN_BASE_URL`, then to `https://cdn.addressiqpro.com` |

Also required in DigitalOcean, once: create the Space, **enable its CDN**, and
attach `cdn.addressiqpro.com` as a custom subdomain (Spaces → Settings → CDN,
with a Let's Encrypt cert), then point the `cdn` CNAME at the Spaces CDN
endpoint. `scripts/generate-manifest.mjs` resolves the manifest's `cdn` field
from the same `CDN_BASE_URL` → `PROD_ADDRESSIQ_CDN_BASE_URL` → default chain that
`cdn.yml` uses for its upload host, and `cdn.yml` still asserts the two agree —
if they ever disagree it fails fast rather than advertising a URL it isn't
writing.

---

## 3. Auth and secrets

**npm publish (`release.yml`):** uses an npm automation token in the
`NPM_TOKEN` secret, exposed to the publish step as `NODE_AUTH_TOKEN`
(`release.yml:6,32-33`) with the registry set to `registry.npmjs.org`
(`release.yml:27`). There is **no npm provenance / OIDC** configured in this
workflow — auth is the `NPM_TOKEN` secret only.

**release-please tag push (`release-please.yml`) and widget fanout
(`widget-fanout.yml`):** authenticate via a **GitHub App**, using secrets
`ADDRESSIQ_BOT_APP_ID` and `ADDRESSIQ_BOT_PRIVATE_KEY`
(`release-please.yml:11,33-34`; `widget-fanout.yml:17,84-85`). In the fanout the
token is minted **per matrix leg** and narrowed to that one consumer repo
(`repositories: ${{ matrix.repo }}`, `widget-fanout.yml:86-87`), so a leg
writing to one consumer holds no credential for the others. This is the same
App used by release-please. The App needs only `contents: write` and
`pull_requests: write` (per RELEASE-ENGINEERING.md §4.A).

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
`release.yml` uses on a dry run (`release.yml:44`):

```bash
npm install
npm run build
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
packaging and publishes nothing (`release.yml:11-16,40,43-44`).

---

## 6. One-time npm setup

Before the first real publish (per RELEASE-ENGINEERING.md §4.C):

1. **Claim the `@addressiq` scope** on npmjs.com if it does not already exist.
2. **Grant publish rights to the token.** Either configure OIDC trusted
   publishing per package (no long-lived secret — preferred), or create a
   granular access token scoped to `@addressiq` and store it as the
   `NPM_TOKEN` secret on this repo (which is what `release.yml:33` currently
   reads). The package is unpublished today, so the first publish creates it.
