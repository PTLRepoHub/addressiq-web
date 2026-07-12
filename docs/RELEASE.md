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

## 2b. CDN publish (`cdn.yml`) — two environments

`cdn.yml` builds, size-checks, generates `MANIFEST.json`, and uploads to
**DigitalOcean Spaces**. It publishes to **two separate CDNs with two separate
sets of credentials**:

| Trigger | Target | GitHub Environment |
|---|---|---|
| push to **`staging`** branch | staging CDN | `staging` |
| **`release: published`** | production CDN | `production` |
| `workflow_dispatch` | either (`target` input) | picked |

**Credentials come from GitHub Environments, not repo secrets.** A run targeting
`staging` can only see the staging Spaces key — it is not merely *configured* not
to touch the prod bucket, it *cannot*. Configure under **Settings → Environments**:

| Kind | Name | Value |
|---|---|---|
| Secret | `SPACES_ACCESS_KEY_ID` | DO **Spaces** access key (API → Spaces Keys — *not* a DO API token) |
| Secret | `SPACES_SECRET_ACCESS_KEY` | the paired secret |
| Var | `SPACES_BUCKET` | Space name for that environment |
| Var | `SPACES_REGION` | e.g. `nyc3` (endpoint is derived: `nyc3.digitaloceanspaces.com`) |
| Var | `CDN_BASE_URL` | the host **this environment uploads to** — e.g. `https://cdn-staging.addressiqpro.com` / `https://cdn.addressiqpro.com` |

The six `*_ADDRESSIQ_*_BASE_URL` build vars and `GOOGLE_MAPS_SDK_KEY` stay at
**repo** level: the bundle bakes *both* host sets in and switches at runtime, so
the artifact is identical for staging and production. Only *where it is uploaded*
differs.

**Why production publishes on `release: published`, not a branch push.** That same
event runs `widget-fanout.yml`, which writes `.widget-version` + `.widget-integrity`
into the four SDK repos **from the same build uploaded here**. CDN bytes, vendored
bytes, and the SRI hash the SDKs pin therefore come from one build and cannot
drift. A branch push would decouple them, and an SDK could pin a hash for bytes
that were never published.

**The layout is immutable and versioned. There is no `latest/` or `v0/` alias.**
The reason is SRI: the native SDKs (RELEASE-ENGINEERING.md §6d) and web partners
both pin `<script integrity="sha384-…">`, and a floating URL cannot be pinned.
New version ⇒ new prefix:

```
cdn.addressiqpro.com/v0.4.0/iqcollect.js       (+ .js.map)
cdn.addressiqpro.com/v0.4.0/index.esm.js       (+ .js.map)
cdn.addressiqpro.com/v0.4.0/index.cjs.js       (+ .js.map)
cdn.addressiqpro.com/v0.4.0/MANIFEST.json
```

Objects ship `cache-control: public, max-age=31536000, immutable`, so there is no
purge step to get wrong.

**Overwrite policy differs by target:**

- **production** — write-once. A re-run against an existing `/v{x.y.z}/` prefix
  **fails**. Partners and the SDKs' SRI pins depend on those bytes.
- **staging** — overwrite is **allowed**, so the branch can be iterated on without
  a version bump. ⚠ The job emits a warning when it overwrites: any SDK staging
  build that already pinned an SRI hash for that version will now **fail the
  integrity check and silently fall back to its bundled widget**. Bump the version
  if you need staging to genuinely exercise the CDN path.

Two guards that apply to both:

1. **Upload list comes from `MANIFEST.json`, not a `dist/` glob** — the bytes
   uploaded are exactly the bytes that were hashed.
2. **Read-back verification** — every object is re-downloaded from the origin and
   re-hashed against `MANIFEST.json`; a mismatch fails the run.

`scripts/generate-manifest.mjs` resolves the manifest's `cdn` field from
`CDN_BASE_URL`, the same var `cdn.yml` uploads to, and the workflow asserts the
two agree — so a manifest can never advertise a URL it isn't writing.

Also required in DigitalOcean, once **per environment**: create the Space, **enable
its CDN**, attach the subdomain (Spaces → Settings → CDN, with a Let's Encrypt
cert), and point the CNAME at the Spaces CDN endpoint.

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
