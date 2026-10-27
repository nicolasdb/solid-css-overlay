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
| **The welcome page** | Ours, or the vertical's from its design-system repo, put at the root at every start (`start/welcome.js`). |
| **The README a new pod starts with** | Ours: what is in the pod, what is public, how sharing and agents work, no Databrowser. Or the vertical's, from the same repo. |
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
   the instance adds there (`.env`, `email.env`, `mcp-connector/`) is git-ignored, and its
   own look lives in another repo (step 8). One checkout per function, named
   after the instance (Maps of Making: `mom-pods`, `/srv/mom-pods`).
   ```sh
   git clone --branch v7.2.0-9 https://github.com/nicolasdb/solid-css-overlay /srv/<instance>
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
   alone, and `provider.json` then does not offer it). It boots with no
   identities, serving `/onboard/` only.

   **An agent is a WebID in its owner's pod, linked to its owner's account**
   (solid-kit ADR 010, point 7). The owner is a person or a collective (a
   collective has its own account and pod); the agent has no account or pod
   of its own, and works where it was granted access. CSS makes client
   credentials only for a WebID linked to the account asking, and the
   connector's mint gate checks the same link, so revoking is one place.
   The backoffice does all of this from one button. By hand, as the owner:
   1. In the owner's pod, write the agent's profile document,
      `profile/<name>` (Turtle, readable by everyone), with
      `<#me> a foaf:Agent; solid:oidcIssuer <https://pod.<domain>/>.`
   2. On the account page (`/.account/`), **link** `…/profile/<name>#me`: it
      links at once, being in a pod of this account.
   3. Still there, make **client credentials** for that WebID; copy the
      secret, shown once.
   4. On the VPS, the agent's slug and its entry in
      `mcp-connector/identities.json` (`identities.example.json` in the
      connector shows the fields):
      ```sh
      docker compose run --rm --no-deps mcp-connector node scripts/gen-slug.js
      ```
   Then `COMPOSE_PROFILES=connector` in `.env` and `docker compose up -d`;
   its URL is `https://mcp.pod.<domain>/mcp/<slug>`. The slug is a bearer
   credential: whoever has the URL acts as the agent.

8. **The instance's own look** (optional; without it, the generic pages and
   the "pod" skin): it comes from **its vertical's design-system repo**
   (solid-kit ADR 011): the kit skin in `skins/kit/`, shared with the
   backoffice, and the pods' own words in a folder `pods/`, started from
   `overlay-template/`. That folder's `compose.override.yml` mounts them; the
   checkout's `.env` loads it:
   ```sh
   git clone <the design-system repo> /srv/<vertical>-design-system
   # in /srv/<instance>/instance-template/.env:
   COMPOSE_FILE=compose.yml:/srv/<vertical>-design-system/pods/compose.override.yml
   DESIGN_SYSTEM=/srv/<vertical>-design-system
   ```
   then `docker compose up -d`. Nothing is built; a change of look is a commit
   there, `git pull`, `docker compose up -d --force-recreate css` (a plain
   `up -d` keeps the old container and files). `overlay-template/README.md`
   has the details.

### What this instance offers: `/.well-known/css/provider.json`

Written by the image at every start (`start/describe.js`), from its version
and the instance's environment, and served on the server's host (solid-kit
ADR 010). Apps read the WebID's `solid:oidcIssuer`, fetch this, and offer what
it lists; stock CSS has no such file, which means "nothing beyond Solid".

```json
{ "software": "solid-css-overlay", "version": "7.2.0-9", "layout": "subdomain",
  "capabilities": { "account": { "path": "/.account/" },
                    "onboard": { "path": "/onboard/" },
                    "connector": { "url": "https://mcp.pod.example.org/" } } }
```

- `layout`: `suffix` when `CSS_CONFIG` is `config/suffix.json`, else
  `subdomain`. The same start writes `scripts/pod-layout.js` for the pages,
  which a suffix instance no longer mounts.
- `onboard` and `connector` are listed only with the connector profile on
  (`COMPOSE_PROFILES=connector`), the connector's URL from `MCP_PUBLIC_BASE`.
  A capability not listed is not offered.
- **A public contract**: fields are only ever added, never renamed or removed.
  It grants nothing: the connector keeps `ONBOARD_CORS_ORIGINS`.
  `scripts/check-overrides.sh` checks it is served and agrees with
  `pod-layout.js`.

### Email: "Forgot your password?"

Without a mail server, CSS cannot send the reset link: the page answers
"No email server is configured." and a forgotten password locks its owner
out of their pod for good. To send it, in `instance-template/`:

```sh
cp email.env.example email.env && chmod 600 email.env   # then fill it
docker compose up -d css
```

`SMTP_HOST`, `SMTP_PORT` (587), `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM`; the
example has Resend's values. Its own file, not `.env`, because it holds a
password; Compose reads it only if it exists. At every start the image
(`start/email.js`) writes CSS's sender from them, the stock
`BaseEmailSender`, or stock's "no email server" when `SMTP_HOST` is empty.
The start log says which: `[solid-css-overlay] email: ...`. `SMTP_HOST` set
with a value missing stops the start, so a broken sender is seen at deploy,
not by someone locked out.

- **STARTTLS only** (587, 2587): stock CSS passes host, port and login to
  nodemailer and nothing else, so implicit TLS (465) cannot be set.
- `EMAIL_FROM`'s domain must be one the SMTP service may send for (SPF and
  DKIM in its zone).
- The values are in the container's environment: `docker inspect` shows
  them to whoever may run it (the `docker` group is root-equivalent anyway).
- The mail is `overlay/templates/identity/password/reset-email.html.ejs`;
  the link works 15 minutes, once (stock). CSS answers the same whether the
  email has an account or not.

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

It is the root container's `index.html`: the server's home page, where a
vertical lists its family of apps. It comes from the `pods/` folder of the
vertical's design-system repo (`pods/welcome/index.html`, mounted by its
`compose.override.yml`), or, without one, the image's generic page, which
names no app.

Stock CSS writes it into the data on first start only. Since 7.2.0-10 the
image puts it there again at **every start** (`start/welcome.js`, which logs
what it did). A new image version reaches the server with the usual update; a
new page in the design-system repo with `git pull` there and
`docker compose up -d --force-recreate css` (a plain `up -d` keeps the
container). Before, it was copied in by hand with `docker compose cp`.

It is the instance's page, not a document people edit: one changed through
Solid is replaced at the next start. Edit it in the design-system repo.

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
`git diff v<old> v<new> -- overlay-template/` what changed for the
design-system repo's `pods/` folder. A new stock CSS gives `7.x.y-1`; a new overlay on the same stock, `-n+1`
(`CHANGELOG.md`). A design-system repo that mounts its own copy of a generic file
diffs it against the new version first.

**Trying a version before the others get it.** A release starts as a
pre-release tag on its PR's branch, `v<version>-rc.<n>` (`v7.2.0-10-rc.1`),
which publishes both images as `<version>-rc.<n>`. One instance runs it
first, pod.nicolasdb.eu, updated as above with that tag and that version in
`.env`. Once it holds there, the PR is merged and `main` tagged
`v<version>`, which every other instance (Maps of Making, ...) takes. A
pre-release tag never goes on `main`, and an instance other than the trial
one never runs one. Going back is the same steps with the previous tag.

## Accounts and pods: what CSS does and does not do

Checked against the CSS 7.2.0 source, 2026-10-21. How long sign-ins last,
and why people are asked again: [`docs/faq.md`](docs/faq.md).

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
| `overlay/` | the pages: `main.html.ejs`, `main.css`, `pod-ui.js`, `pod-layout.js`, `templates/identity/**`, `templates/pod/base/README$.md.hbs` (a new pod's README), `welcome/`, `doc-view/` (generated from solid-kit, `SOURCE`) |
| `skins/pod/` | the default skin |
| `pod-name-guard/` | the one component: pod names that make valid hostnames |
| `upstream-baseline.sha256`, `scripts/check-overrides.sh` | the stock templates `overlay/` replaces, hashed |
| `test/` | `try-local.sh` (runs the image) + `smoke.mjs` (a real browser, both layouts) |
| `instance-template/` | what an instance runs from (its checkout): compose, `.env.example`, `email.env.example`, the Caddy and nginx gateway templates |
| `overlay-template/` | what the `pods/` folder of a vertical's design-system repo starts from (ADR 011) |
| `start/` | the image's entrypoint: writes `provider.json`, `pod-layout.js`, the email sender and the welcome page, then runs stock CSS |
| `gateway-caddy/` | Caddy + the OVH DNS module, for the wildcard certificate |
| `docs/` | `faq.md` (sign-in lifetimes, consent), install briefs for one VPS (`handoff-mapsofmaking.md`) |
| `ROADMAP.md` | planned features: account deletion, the right to erasure |
| `mcp-connector/` | the connector's source and image |
| `skills/css-instance/` | the method, for Claude Code; never required |
