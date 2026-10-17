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

On a VPS with Docker and an nginx gateway on an external Docker network.

1. **Choose the server's address**, once: it is in every WebID. It needs a host
   of its own, since pods are its subdomains: `https://pod.mapsofmaking.org/`
   gives `https://openfab-bxl.pod.mapsofmaking.org/`. (The bare domain works
   too, if nothing else lives on it.)
2. **DNS**: `pod` and `*.pod` (A/AAAA) to the VPS.
3. **Wildcard certificate**, below.
4. **The instance**:
   ```sh
   cp -r instance-template/ ~/mapsofmaking && cd ~/mapsofmaking
   cp .env.example .env                       # INSTANCE_NAME, CSS_BASE_URL, CSS_OVERLAY_VERSION
   mkdir -p mcp-connector && echo '{}' > mcp-connector/identities.json && touch mcp-connector/.env
   docker compose pull && docker compose up -d
   ```
   (Without agents, delete the `mcp-connector` service instead.)
5. **The gateway**: `instance-template/gateway-vhost.conf.tmpl`, filled, into
   the gateway's `conf.d/`, then reload nginx.
6. **Check**: the welcome page on `https://pod.<domain>/`, sign up, create a pod,
   open `https://<pod>.pod.<domain>/`. Then
   `scripts/check-overrides.sh '' https://pod.<domain>`.

That is a working server with the generic pages and the "pod" skin. An own look
comes later, in `overlay/` (its README), and needs no build.

### Wildcard certificate (DNS-01)

`*.pod.<domain>` can only be issued through a DNS challenge: certbot writes a
TXT record in the domain's zone, so it needs an API key for the DNS host, not
access to the server. For a domain at **OVH**, the `certbot-dns-ovh` plugin:

1. Create a token at <https://eu.api.ovh.com/createToken/> (endpoint `ovh-eu`)
   with these rights only, limited to the one zone:
   `GET /domain/zone/`, and `GET`, `PUT`, `POST`, `DELETE` on
   `/domain/zone/mapsofmaking.org/*`. Being admin of the domain is enough;
   the VPS can be anywhere.
2. On the gateway machine, `/root/.secrets/ovh.ini`, `chmod 600`, never in a repo:
   ```ini
   dns_ovh_endpoint = ovh-eu
   dns_ovh_application_key = …
   dns_ovh_application_secret = …
   dns_ovh_consumer_key = …
   ```
3. One certificate for both names:
   ```sh
   docker run --rm -v /etc/letsencrypt:/etc/letsencrypt -v /root/.secrets:/secrets:ro \
     certbot/dns-ovh certonly --dns-ovh --dns-ovh-credentials /secrets/ovh.ini \
     --dns-ovh-propagation-seconds 120 \
     -d pod.mapsofmaking.org -d '*.pod.mapsofmaking.org'
   ```
   Renewal runs the same plugin (`certbot renew`, same volumes): the http-01
   webroot renewal other sites on the gateway use cannot renew a wildcard.

Another DNS host: the matching `certbot-dns-*` plugin, same shape.

### The welcome page

It is the root container's `index.html`, written from the image **on first
start only**. On an instance that already has data, a new welcome page (a new
image version, or a new `overlay/welcome/index.html`) is copied in by hand:

```sh
docker compose cp overlay/welcome/index.html css:/data/www/index.html      # subdomain pods
docker compose cp overlay/welcome/index.html css:/data/index.html          # config/suffix.json
```

Why not served from the image at every start (`static-root.json`): CSS 7.2
matches static files on the path alone, ignoring the host, so with subdomain
pods `GET /` on **every pod** answered the welcome page, Turtle requests
included, and no app could read a pod's root. Checked against the image,
2026-10-14.

## Updating an instance

New `CSS_OVERLAY_VERSION` in `.env`, then `docker compose pull && docker
compose up -d`. A new stock CSS gives `7.x.y-1`; a new overlay on the same
stock, `-n+1` (`CHANGELOG.md`). An instance that mounts its own copy of a
generic file diffs it against the new version first.

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
| `instance-template/` | what an instance copies |
| `mcp-connector/` | the connector's source and image |
| `skills/css-instance/` | the method, for Claude Code; never required |
