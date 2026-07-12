# IQCollect Web — Examples

These are ready-to-run demos of the AddressIQ web widget (the pop-up that lets a
user add and verify their address).

The easiest one to start with is **`local.html`**. By default it connects
**directly to your local AddressIQ API** (the `geo-tagging` app on `:4000`) with a
seeded test key, so you see the real flow. If you don't have the API running, you
can switch to **fake data** for a fully offline demo — see
"[Optional: the sample server](#optional-the-sample-server)" below.

## The files here

| File | What it does | Where it gets data |
|------|--------------|--------------------|
| **`local.html`** | The playground. Runs the full flow with an on-screen log. **Start here.** | Local API (or fake data if you opt in) |
| `index.html` | Shows how a real website would drop the widget in with a `<script>` tag. | Hosted API |
| `src/main.ts` | Shows how an app that uses npm would import it. | Hosted API |
| `shots.html` | A helper for taking screenshots of each screen automatically. | Local API (or fake data) |

---

## Run it on your machine

You need **Node.js 18 or newer**. That's the only thing to install.

By default `local.html` talks **directly to your local AddressIQ API** (the
`geo-tagging` app on `http://localhost:4000`) using a seeded test key. In dev the
API allows all origins (CORS), so the browser can call it directly — no extra
server, no `.env`. Just make sure geo-tagging is running on `:4000`.

### Build and open the widget

With `geo-tagging` running on `:4000`, that's the only step:

```bash
cd addressiq-web
npm install
npm run example:harness
```

That builds the widget and opens it in your browser at
**http://localhost:8077/examples/web/local.html**.

Prefer to do it yourself? Run this from the `addressiq-web` folder instead:

```bash
npm run build
npx --yes http-server . -p 8077 -c-1
```

Then open http://localhost:8077/examples/web/local.html.

> **Why serve from `addressiq-web` and not this folder?** `local.html` needs the
> built widget file that lives one level up (`../../dist/iqcollect.js`), so the
> server has to start from the `addressiq-web` folder to reach it.

That's it — you can now click through the whole flow. The black box at the bottom
of the page logs what the widget hands back to the app (the chosen address, when
it closes, and any errors).

---

## Things to try

### See the address list — or skip it
The "Which address do you want to verify?" screen shows addresses the user saved
before. It appears **only if that user already has saved addresses** in the
backend; otherwise the flow goes straight to adding a new one.

- Change the `appUserId` in `local.html` (or the `?appUserId=` param in
  `shots.html`) to a user who has addresses to see the list populate.
- **Press "Verify" next to a saved address** → starts verifying that one.
- **Press "Verify a new address"** (or if there are none) → the full
  add-an-address flow.

> In fake mode (the sample server), the toggle
> `addressiq-node-backend/mock-fixtures.json → hasSavedAddresses` forces the list
> on or off without needing real data.

### The business name comes from the backend
Notice `local.html` never sets a business name. The widget fetches it (name, logo,
colour) from `GET /api/v1/widget/config` — it belongs to whichever business owns
the API key. Against the real API it's the org's name (e.g. "AddressIQ Demo
Bank"); in fake mode, edit `business` in `mock-fixtures.json`.

### The map
The address step shows a real map. You don't supply a Maps/Mapbox key — the
platform provisions the map key and the widget receives it from the backend via
`GET /api/v1/widget/config`, alongside the business name and branding. If the
backend doesn't return a key (for example in fake/offline mode), the address step
falls back to a plain text box — everything else still works.

### Fake location vs. your real one
By default the demo uses a fake location so it just works. Untick **"Fake
LocationProvider"** on the page to use your browser's real location instead. (On
a real phone app, the app supplies the location, and the permission pop-up stays
native.)

### Point at a different backend
You can tell `local.html` to use another server by adding `?api=` to the URL:

```
http://localhost:8077/examples/web/local.html?api=http://localhost:3355
```

---

## Optional: the sample server

Talking to `:4000` directly is fine for local dev, but a real integration never
ships an API key in the browser — the browser calls *your* server, which adds the
key. `addressiq-node-backend` is the AddressIQ **Node server SDK** with a sample
`server.js` that plays that role. It also lets you run **offline with fake data**.

Point the widget at it with `?api=http://localhost:3355` (e.g.
`local.html?api=http://localhost:3355`). The sample server can run two ways:

| Mode | How to start it | What the widget talks to | Needs the local API? |
|------|-----------------|--------------------------|----------------------|
| **Forward** | `node server.js` | Your AddressIQ API (via `.env`) | Yes — running on `:4000` |
| **Fake** (offline) | `MOCK_UPSTREAM=1 node server.js` | Made-up data from `mock-fixtures.json` | No |

**Forward mode** reads `.env` (which `ENVIRONMENT=local` points at
`http://localhost:4000`) and forwards the widget's requests there, adding the real
API key server-side — so the key is never sent to the browser. Point `ENVIRONMENT`
at `staging` or `production` to use the hosted APIs instead. First run:
`cp .env.example .env` (set your AddressIQ API key). You don't need to provide a
Maps/Mapbox key — the platform provisions it and delivers it to the widget via
`GET /api/v1/widget/config`.

**Fake mode** needs no API at all — handy for a quick offline look or for
demoing the two address-book branches via `mock-fixtures.json`.

> If you're in real mode but the API isn't reachable, the widget's requests come
> back as `502 UPSTREAM_UNREACHABLE` — that just means the sample server tried to reach
> the API and couldn't. Start your local API, or switch to fake mode.

## Which port is what

| Port | What runs there | Command |
|------|-----------------|---------|
| `4000` | The AddressIQ API (`geo-tagging`) — what the widget hits by default | (its own dev setup) |
| `8077` | The widget page + built file | `npm run example:harness` |
| `3355` | Optional sample server (real or fake) | `node server.js` (add `MOCK_UPSTREAM=1` for fake) |
| `8080` | Only for `index.html` | `npm run serve` |

---

## The "real website" examples

`index.html` and `src/main.ts` show how a real integration looks. They point at
the live API (`https://api.addressiqpro.com`), so they won't finish a flow unless
you give them a real login token and can reach the API. See the main
`addressiq-web/README.md` ("Server-minted session") for how that works.

To just check the npm sample compiles:

```bash
cd addressiq-web/examples/web
npm install
npm run type-check
```

---

## Taking screenshots (`shots.html`)

`shots.html` jumps straight to a chosen screen so you can screenshot it. Add
`?step=` to the URL:

```
?step=0   the intro screen
?step=1   the business consent screen
?step=2   the "verify where you live" screen
?step=3   the saved-address list
?step=4   adding a new address
```

Example with headless Chrome:

```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --headless=new --window-size=500,940 --force-device-scale-factor=2 \
  --screenshot=/tmp/intro.png \
  "http://localhost:8077/examples/web/shots.html?step=0"
```
