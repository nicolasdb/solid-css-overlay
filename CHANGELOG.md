# Changelog

Versions are `<stock CSS version>-<n>`: a new stock release starts at `-1`, a
new overlay on the same stock adds one. A tag `v<version>` publishes both
images (`.github/workflows/build.yml`).

## 7.2.0-8 — 2026-10-25

For a small shared host. An instance updates the image; `.env` may add
`CSS_MEM_LIMIT`, nothing else to change.

- **The connector waits for CSS**: `depends_on: css: service_healthy`. Started
  beside a CSS not up yet, every identity's login got a 502 and the log
  said "0 identities". This covers `docker compose up`; after a dockerd
  restart or a reboot, an identity skipped at boot still logs in at its
  first request, as before.
- **The start log says so**: "none of the N identities logged in at boot,
  each is retried at its first request", no longer "no active identities
  configured", which read as broken and sent us to restart a connector
  that was recovering anyway.
- **CSS has a memory limit**: `mem_limit` 512m in `instance-template/compose.yml`,
  `CSS_MEM_LIMIT` in `.env` to change it. Until now only the connector had
  one, so a leak in CSS could take a small host down, other stacks included.
  An instance gets it with the next tag, or at once with
  `docker update --memory 512m --memory-swap 1g <instance>-css` (no restart).

## 7.2.0-7 — 2026-10-24

Words, no behaviour change. An instance updates the image and nothing else.

- **Consent says what its checkbox does**: "Let this app stay signed in",
  not "Remember this app, so it doesn't ask again". The box only decides
  whether the app gets a refresh token (`offline_access`, 24 h in stock
  CSS); CSS has no way to skip consent, so the old words promised what
  never happened.
- **`docs/faq.md`**: how long each sign-in lasts in stock CSS, and why
  people are asked to sign in or consent again, and why an agent's "last
  used" lags by up to 5 minutes.
- **The connector names today's backoffice**: its start log and README
  say "You → Your agents → Connect to AI", not the old backoffice's
  "People & apps".

## 7.2.0-6 — 2026-10-24

The overlay's side of solid-kit ADR 010 (a provider says what it offers) and
ADR 011 (an instance's look comes from its vertical's design-system repo):
items 5, 6, 7 and 9 of the Maps of Making install brief.

- **`/.well-known/css/provider.json`**: what this instance offers, written at
  every start by the new entrypoint (`start/describe.js`, then stock CSS):
  version, pod layout, and `account`, plus `onboard` and `connector` (its
  public URL) when the connector profile is on. A public contract, fields
  only added; `check-overrides.sh` checks it. The publish job bakes the
  version in.
- **The pod layout is the image's to say**: the same start writes
  `pod-layout.js` from `CSS_CONFIG`. A suffix instance no longer mounts its
  own copy.
- **The consent page names where the app runs** when it signs in with a
  Client ID Document (its `client_id` is a URL: the server fetched it and
  redirects only to its `redirect_uris`), large, above the name the app gives
  itself. Otherwise it says the app did not say where it runs, and marks the
  name unchecked. The header's server host is larger and darker. The smoke
  run covers both cases (CI now runs it on the host network, so the server
  can fetch the test's Client ID Document).
- **One model of an agent**: a WebID in its owner's pod, linked to the
  owner's account (README step 7, the handoff, the connector's README).
- **The look comes from the design-system repo**: `overlay-template/` is the
  `pods/` folder of a vertical's design-system repo; the kit skin is mounted
  from its `skins/kit/`. `.env`: `DESIGN_SYSTEM` replaces `OVERLAY_DIR`.

## 7.2.0-5 — 2026-10-23

The bugs from the Maps of Making install brief (steps 6 and 7). Its design
items (a provider descriptor, one model of an agent, the app's origin on the
consent page) wait for solid-kit ADR 010.

- **mcp-connector boots with no identities.** An empty `identities.json`
  (`{}`, as the install creates it) threw "contains no identities", so a new
  instance's connector crash-looped and `/onboard/` could never mint a first
  agent: the 2026-08-12 deadlock again, by another path. It now boots and
  serves `/onboard/` only, as it already did with every identity revoked.
- **The connector is a Compose profile** (`COMPOSE_PROFILES=connector` in
  `.env`). Off by default: `docker compose up -d` starts CSS alone. "Delete the
  service" meant editing the checkout.
- **`scripts/check-overrides.sh`**: `main.css` was reported stock while ours
  (`curl | grep -q` under pipefail: SIGPIPE); the default stock image is fully
  qualified (podman refuses short names without a TTY); the last line names
  the failed part.
- **Create pod**: a name that cannot be an address shows the reason under the
  field, not `https://open_fab.<host>/`.
- **Ahead of stock**: `stock-watch.yml` also builds the overlay weekly on
  stock's unreleased images (`edge`, `next`) with the same checks as a tag,
  and opens an issue when one breaks. First run, by hand: 7.3 adds a
  "recover WebID" link to two pages the overlay replaces; 8.0's alpha does
  not load `PodNameGuard`. ROADMAP, "Next stock CSS".
- The `PodNameGuard` build stage is the stock image itself (was
  `node:18-slim`), so the component is tested on the Node it runs on.

## 7.2.0-4 — 2026-10-23

- **The welcome page is right on any instance as it stands.** It carried
  placeholders an instance had to replace: `pod.example.org` in the header,
  and an "Apps on this pod" row linking to `backoffice.example.org`. Maps of
  Making went live on 7.2.0-3 showing both. The header now shows the
  server's own host (from the browser: the page is not a template), and the
  apps section is an example in a comment, for an instance's own welcome
  page. The smoke run checks both.
- A server already running keeps its old copy (it is written into the data
  on first start): copy the new one in by hand (README, "The welcome page").

## 7.2.0-3 — 2026-10-22

The images are the same as 7.2.0-1's in content; this release changes how an
instance adds its own look, after a re-read of the Maps of Making install.

- **An instance's overlay lives in its own repo**, started from the new
  `overlay-template/`: its files and the `compose.override.yml` that mounts
  them, versioned together. The checkout's `.env` loads it (`COMPOSE_FILE`,
  `OVERLAY_DIR`). Until now the overlay was git-ignored in the checkout
  (versioned nowhere), and turning it on meant uncommenting lines in the
  tracked `compose.yml`, which dirtied the checkout and would have stopped
  the next `git checkout v<new>`.
- `instance-template/compose.yml` no longer carries the commented mounts.
- Naming: one checkout per function; Maps of Making is `mom-pods`
  (`/srv/mom-pods`, `/srv/mom-pods-overlay`).

## 7.2.0-2 — 2026-10-21

The images are the same as 7.2.0-1's in content; this release versions the
template an instance runs from, after Maps of Making's VPS inventory.

- **An instance is a checkout at a tag** (`git clone --branch v<version>`),
  used from `instance-template/`, so its compose stays in its own repo and an
  update is a `git checkout`. What the instance adds there is git-ignored.
- **`name: ${INSTANCE_NAME}`** in `instance-template/compose.yml`: the volumes
  are `<INSTANCE_NAME>_css-data` etc., no longer named after the folder.
- **`gateway-caddy/`**: Caddy 2.11.4, alpine, the version Maps of Making's
  gateway runs; 2.10.2 would have downgraded it. Pin what the gateway runs.
- README "Accounts and pods": the 30-minute removal of an account without a
  login, that CSS 7.2 deletes no account and no pod, and resetting a test
  instance. `ROADMAP.md`: admin deletion and the right to erasure.
- `docs/handoff-mapsofmaking.md`: the inventory's facts (network `proxy`, the
  gateway in vps-infra, one recreate of the gateway, IPv6 after a check).

## 7.2.0-1 — 2026-10-20

First release: the overlay moves here from solid-kit `templates/css-instance/`
(at 2772945) and the MCP connector from pocpod0 (at 356647d).

- **Pods are subdomains** by default (`config/instance.json`). `config/suffix.json`
  keeps folder pods, for instances that already have them.
- **PodNameGuard**: a pod name must make a valid hostname and not be reserved;
  checked by the server (400) and, first, by the create-pod form.
- **Secure config**: stock DPoP/Bearer authentication only.
- **The welcome page** is written into the root on first start
  (`initialize-intro.json`), not served by `static-root.json`, which answered
  every subdomain pod's root with it.
- **Pages**: the create-pod address preview and the consent page's WebID
  display follow the pod layout (`overlay/pod-layout.js`).
- **The editorial register** (Solid Kit design system, solid-kit `design/`):
  page titles in the display serif, Newsreader 400 (`--font-display`, a new
  skin slot; a skin without it keeps its heading face), the eyebrow on the
  welcome page, `.hint` for help text (stock's `.checkbox-explanation` too).
  The welcome page's three ideas are topped by a hairline and numbered, as
  the kit's `.how-steps`, instead of ruled on the left.
- **The theme button** (solid-kit ADR 008, amended): one icon button cycling
  Light, Dark, Same as this device, in place of the three-word switch. Light
  is stamped in the HTML and clears the stored choice; `pod-ui.js` resolves
  "same as this device" (High contrast first, then dark) and follows it. The
  skin's `prefers-contrast` copy of High contrast is gone. Assets at `?v=2`.
- **Gateways**: `instance-template/Caddyfile.tmpl` beside the nginx template,
  and `gateway-caddy/` (Caddy + `caddy-dns/ovh`) for the wildcard certificate.
  The Caddy template also routes the connector (`mcp.<server host>`, and
  `/onboard/` on the server's host only); the nginx one does not yet.
- **mcp-connector**: the pod a URL belongs to is discovered (`src/podRoot.js`,
  solid-kit's rule), no longer read off the URL path; public address from
  `MCP_PUBLIC_BASE`.
