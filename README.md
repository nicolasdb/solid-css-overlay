# solid-css-overlay

A stock [Community Solid Server](https://github.com/CommunitySolidServer/CommunitySolidServer)
with our identity pages baked in, published as an image a collective runs
without building anything:

```
solidproject/community-server:7.2.0            stock, unpatched
  └─ ghcr.io/nicolasdb/solid-css-overlay:7.2.0-1
       the pages (welcome, log in, sign up, consent, account, create pod, .md),
       the "pod" skin, a secure config, pods as subdomains, PodNameGuard
         └─ an instance: compose.yml + .env + overlay/ (its skin and words)
```

plus `ghcr.io/nicolasdb/solid-mcp-connector:7.2.0-1`, the MCP connector an
instance runs next to it for its agents.

Every instance stays a plain Solid server: a WebID from another provider works
there, only without this overlay's extras.

## What the image changes, and what it does not

| | |
|---|---|
| **Pods are subdomains** | `https://<name>.<server host>/`, WebID `https://<name>.<server host>/profile/card#me`. The default for every new instance. |
| **Pod names are checked** | `PodNameGuard` (`pod-name-guard/`) refuses, with a 400 the form shows, a name that cannot be a hostname (`open_fab`, 64+ characters, a hyphen at either end) and reserved names (`www`, `mcp`, `api`, …: `config/instance.json`). CSS alone checks only that the name is not empty. The form runs the same check first. |
| **Authentication is stock** | DPoP and Bearer only. pocpod0's `UnsecureWebIdExtractor` is not in the image. |
| **The welcome page** | Ours, written into the root on first start (`initialize-intro.json`). |
| **CSS itself** | Untouched. Files are added where stock CSS already looks (`templates/`), plus one config and one component. |

`config/suffix.json` keeps pods as folders (`https://<server>/<name>/`), for an
instance that already has pods that way. **An instance never switches between
the two**: with the file backend, subdomain mode reads the folder `data/alice/`
as `alice.<host>` and moves the root to `data/www/`, so every existing WebID,
ACL and link would point at something else.

## Install from scratch

On a VPS with Docker and a gateway container (Caddy or nginx) on a Docker
network the instance joins. `docs/handoff-mapsofmaking.md` is this section
applied to one VPS, step by step.

1. **Choose the server's address**, once: it is in every WebID. It needs a host
   of its own, since pods are its subdomains: `https://pod.mapsofmaking.org/`
   gives `https://openfab-bxl.pod.mapsofmaking.org/`. (The bare domain works
   too, if nothing else lives on it.)
2. **DNS**: `pod` and `*.pod` (A, and AAAA if the VPS has IPv6) to the VPS.
   Check: `dig +short A anything.pod.<domain>` answers the VPS's address.
3. **An API token for the DNS host**, for the wildcard certificate (below).
4. **The instance**, CSS first. It is a checkout of this repo at the tag it
   runs, used from `instance-template/`: its compose stays in its own repo,
   and an update is a `git checkout`. **The checkout is never edited**: what
   the instance adds there (`.env`, `mcp-connector/`) is git-ignored, and its
   own look lives in another repo (step 8). One checkout per function, named
   after the instance (Maps of Making: `mom-pods`, `/srv/mom-pods`).
   ```sh
   git clone --branch v7.2.0-5 https://github.com/nicolasdb/solid-css-overlay /srv/<instance>
   cd /srv/<instance>/instance-template
   cp .env.example .env                       # every value; the comments say what
   mkdir -p mcp-connector && echo '{}' > mcp-connector/identities.json && touch mcp-connector/.env
   chown 1000:1000 mcp-connector/identities.json mcp-connector/.env   # the connector runs as uid 1000
   chmod 600 mcp-connector/identities.json mcp-connector/.env         # it refuses a looser mode
   docker compose pull && docker compose up -d css
   ```
5. **The gateway**: `instance-template/Caddyfile.tmpl` for Caddy,
   `instance-template/gateway-vhost.conf.tmpl` for nginx; fill the
   placeholders, add it to the gateway's config, reload.
6. **Check**:
   - `https://pod.<domain>/` shows the welcome page; sign up, create a pod;
   - `curl -sI https://<pod>.pod.<domain>/ | grep -i pim` shows
     `<http://www.w3.org/ns/pim/space#Storage>; rel="type"`;
   - a pod named `open_fab` is refused;
   - `scripts/check-overrides.sh '' https://pod.<domain>` is OK.
7. **The connector** (skip without agents: it runs only when `.env` says
   `COMPOSE_PROFILES=connector`, so a plain `docker compose up -d` starts CSS
   alone). It boots with no identities, serving `/onboard/` only. An agent
   is an account of its own on this server, with a pod. Its owner makes
   client credentials on the account page (`/.account/`), then on the VPS:
   ```sh
   docker compose run --rm --no-deps mcp-connector node scripts/gen-slug.js   # the agent's slug
   ```
   and one entry in `mcp-connector/identities.json` (`identities.example.json`
   in the connector shows the fields). Then `COMPOSE_PROFILES=connector` in
   `.env` and `docker compose up -d`; its URL is `https://mcp.pod.<domain>/mcp/<slug>`. The slug
   is a bearer credential: whoever has the URL acts as the agent.

8. **The instance's own look** (optional; without it, the generic pages and
   the "pod" skin): its skin, fonts, welcome page and extra reserved names, in
   **a repo of the instance's own**, started from `overlay-template/`. Its
   `compose.override.yml` mounts them; the checkout's `.env` loads it:
   ```sh
   git clone <the overlay repo> /srv/<instance>-overlay
   # in /srv/<instance>/instance-template/.env:
   COMPOSE_FILE=compose.yml:/srv/<instance>-overlay/compose.override.yml
   OVERLAY_DIR=/srv/<instance>-overlay/overlay
   ```
   then `docker compose up -d`. Nothing is built; a change is a commit there,
   `git pull`, `docker compose up -d`. `overlay-template/README.md` has the
   details.

### Wildcard certificate (DNS-01)

`*.pod.<domain>` can only be issued through a DNS challenge: the gateway writes
a TXT record in the domain's zone, so it needs an API token for the DNS host,
not access to the server. Being admin of the domain is enough; the VPS can be
anywhere. For a domain at **OVH**:

1. **The token**, at <https://eu.api.ovh.com/createToken/> (endpoint `ovh-eu`),
   with these rights only, so it can touch this one zone's records and nothing
   else (replace the domain):
   ```
   GET    /domain/zone/mapsofmaking.org/record
   POST   /domain/zone/mapsofmaking.org/record
   GET    /domain/zone/mapsofmaking.org/record/*
   PUT    /domain/zone/mapsofmaking.org/record/*
   DELETE /domain/zone/mapsofmaking.org/record/*
   GET    /domain/zone/mapsofmaking.org/soa
   POST   /domain/zone/mapsofmaking.org/refresh
   ```
   Validity: unlimited, or the certificate stops renewing when it expires. It
   gives three values (application key, application secret, consumer key):
   they go on the VPS only, never in a repo or a chat.
2. **Caddy**: stock Caddy has no DNS module. `gateway-caddy/Dockerfile` builds
   the same Caddy with `caddy-dns/ovh`; the gateway's compose builds from it
   instead of pulling `caddy`. The four values reach the container as
   environment variables, from an env file next to the gateway's compose
   (`chmod 600`, git-ignored):
   ```sh
   OVH_ENDPOINT=ovh-eu
   OVH_APPLICATION_KEY=…
   OVH_APPLICATION_SECRET=…
   OVH_CONSUMER_KEY=…
   ```
   `Caddyfile.tmpl` uses them. Caddy then gets and renews the wildcard by
   itself, and serves `mcp.pod.<domain>` from it too (Caddy 2.10 and later).
   Check: `docker exec <caddy> caddy list-modules | grep ovh`.
3. **nginx**: certbot's `certbot-dns-ovh` plugin, with the same values in
   `/root/.secrets/ovh.ini` (`chmod 600`):
   ```ini
   dns_ovh_endpoint = ovh-eu
   dns_ovh_application_key = …
   dns_ovh_application_secret = …
   dns_ovh_consumer_key = …
   ```
   One certificate for both names:
   ```sh
   docker run --rm -v /etc/letsencrypt:/etc/letsencrypt -v /root/.secrets:/secrets:ro \
     certbot/dns-ovh certonly --dns-ovh --dns-ovh-credentials /secrets/ovh.ini \
     --dns-ovh-propagation-seconds 120 \
     -d pod.mapsofmaking.org -d '*.pod.mapsofmaking.org'
   ```
   Renewal runs the same plugin (`certbot renew`, same volumes): the http-01
   webroot renewal other sites on the gateway use cannot renew a wildcard.

Another DNS host: the matching `caddy-dns/*` module or `certbot-dns-*` plugin,
same shape.

### The welcome page

It is the root container's `index.html`, written from the image **on first
start only**. On an instance that already has data, a new welcome page (a new
image version, or a new `welcome/index.html` in the overlay repo) is copied
in by hand, from the instance's folder:

```sh
docker compose cp "$OVERLAY_DIR/welcome/index.html" css:/data/www/index.html   # subdomain pods
docker compose cp "$OVERLAY_DIR/welcome/index.html" css:/data/index.html       # config/suffix.json
```

Without a welcome page of its own, the instance copies the image's generic one
from its checkout, `../overlay/welcome/index.html`, the same way.

Why not served from the image at every start (`static-root.json`): CSS 7.2
matches static files on the path alone, ignoring the host, so with subdomain
pods `GET /` on **every pod** answered the welcome page, Turtle requests
included, and no app could read a pod's root. Checked against the image,
2026-10-14.

## Updating an instance

In the instance's checkout: `git fetch --tags && git checkout v<new>`, the
same version as `CSS_OVERLAY_VERSION` in `instance-template/.env`, then
`docker compose pull && docker compose up -d`. `git diff v<old> v<new> --
instance-template/` shows what changed in the compose and the gateway
templates (a gateway template is copied, so it is updated by hand), and
`git diff v<old> v<new> -- overlay-template/` what changed for the overlay
repo. A new stock CSS gives `7.x.y-1`; a new overlay on the same stock, `-n+1`
(`CHANGELOG.md`). An overlay repo that mounts its own copy of a generic file
diffs it against the new version first.

## Accounts and pods: what CSS does and does not do

Checked against the CSS 7.2.0 source, 2026-10-21.

**An account with no login is removed after 30 minutes.** Signing up makes
the account first and the email/password second. If nobody adds a login
within 30 minutes (someone closes the page halfway), CSS removes the account
by itself (`BaseLoginAccountStorage`, 1800 s). It is the only deletion CSS does.

**CSS 7.2 cannot delete an account or a pod.** Its account API deletes:
- a login, never the last one;
- client credentials;
- a WebID link;
- a pod owner.

Nothing deletes the account or the pod, so a pod name, once taken, stays
taken, and the right to erasure cannot be honoured yet. Both are planned
(`ROADMAP.md`).

**Resetting a test instance** deletes every account and pod at once, in
`instance-template/`:
```sh
docker compose down -v && docker compose up -d
```
It removes the `<INSTANCE_NAME>_css-data` volume and the connector's audit
volume. The welcome page is rewritten on the next first start. Put
`mcp-connector/identities.json` back to `{}` too: its agents' accounts are
gone. **Never on an instance with real accounts.**

## Working on the image

```sh
docker build -t solid-css-overlay:dev .
(cd test && npm ci)                                  # the smoke run's browser
test/try-local.sh 3123                               # subdomain pods
node test/smoke.mjs http://localhost:3123 test/shots/subdomain
POD_LAYOUT=suffix test/try-local.sh 3124             # folder pods
POD_LAYOUT=suffix node test/smoke.mjs http://localhost:3124 test/shots/suffix
(cd pod-name-guard && npm ci && npm test)
(cd mcp-connector && npm ci && npm test)
scripts/check-overrides.sh                           # stock templates we replace, unchanged?
```

Behind a proxy that re-signs TLS: `docker build --secret id=npm_ca,src=<ca.crt> …`.
Where published ports do not answer (some sandboxes): `TRY_NETWORK=host`.
Then **look at the screenshots** in `test/shots/`: a check passes on a page
that is still wrong.

The skin audit (contrast, complete slot set) lives in solid-kit:
`npm run audit -- --skin skins/pod/skin.css`.

| Path | What |
|---|---|
| `Dockerfile` | stock CSS + everything below |
| `config/instance.json`, `config/suffix.json` | the two configs; the comments say why each line differs from stock |
| `overlay/` | the pages: `main.html.ejs`, `main.css`, `pod-ui.js`, `pod-layout.js`, `templates/identity/**`, `welcome/`, `doc-view/` (generated from solid-kit, `SOURCE`) |
| `skins/pod/` | the default skin |
| `pod-name-guard/` | the one component: pod names that make valid hostnames |
| `upstream-baseline.sha256`, `scripts/check-overrides.sh` | the stock templates `overlay/` replaces, hashed |
| `test/` | `try-local.sh` (runs the image) + `smoke.mjs` (a real browser, both layouts) |
| `instance-template/` | what an instance runs from (its checkout): compose, `.env.example`, the Caddy and nginx gateway templates |
| `overlay-template/` | what an instance's overlay repo starts from: `compose.override.yml`, `overlay/` |
| `gateway-caddy/` | Caddy + the OVH DNS module, for the wildcard certificate |
| `docs/` | install briefs for one VPS (`handoff-mapsofmaking.md`) |
| `ROADMAP.md` | planned features: account deletion, the right to erasure |
| `mcp-connector/` | the connector's source and image |
| `skills/css-instance/` | the method, for Claude Code; never required |
