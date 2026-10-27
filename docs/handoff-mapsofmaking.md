# Handoff: install solid-css-overlay on the Maps of Making VPS

A brief for a Claude Code session on Nicolas's computer, the only place that
reaches the VPS (`ssh mom`). It applies the README's "Install from scratch" to
this one VPS. Read the README section first; this file only adds what is
particular to Maps of Making.

## The values

| | |
|---|---|
| Server address (`CSS_BASE_URL`) | `https://pod.mapsofmaking.org/` |
| Test pod | `nicolas-test` → `https://nicolas-test.pod.mapsofmaking.org/`, a throwaway. `openfab-bxl` waits until accounts can be deleted (`ROADMAP.md`): CSS 7.2 cannot delete one, and OpenFab's account must not sit among test accounts |
| Connector (`MCP_PUBLIC_BASE`) | `https://mcp.pod.mapsofmaking.org/` |
| `MCP_ALLOWED_HOSTS` | `mcp.pod.mapsofmaking.org,pod.mapsofmaking.org` (the second is for `/onboard/`) |
| `INSTANCE_NAME` | `mom-pods`: containers `mom-pods-css` and `mom-pods-mcp-connector`, volume `mom-pods_css-data`. One checkout per function, prefix `mom-` |
| `CSS_OVERLAY_VERSION` | `7.2.0-11`, the same as the tag checked out (`update.sh` keeps them so) |
| `GATEWAY_NETWORK` | `proxy` |
| DNS | OVH, zone `mapsofmaking.org`. The site on `mapsofmaking.org` lives on another server (Hetzner) and is not touched |
| VPS | Debian 13, Docker 29.7.2, Compose v5.5.0; 3.7 GiB RAM, 2 GiB swap (2026-10-25); IPv4 `92.222.71.103`, IPv6 `2001:41d0:404:200::94de` |

**Gateway**:
- container `gateway-caddy`, stock `caddy:2-alpine` 2.11.4, on network `proxy`;
- compose `/srv/infra/gateway/docker-compose.yml` (vps-infra `gateway/`);
- its Caddyfile is `import sites/*.caddy`;
- certificates in the volumes `gateway_caddy-data` and `gateway_caddy-config`.

**Where things live**:
- **vps-infra** (`/srv/infra`, a read-only checkout on the VPS) holds the
  gateway only.
- **The instance's compose stays in its own repo**, solid-css-overlay, as
  vps-infra's README requires: the instance is a checkout of it at
  `/srv/mom-pods`, never edited.
- **Maps of Making's own look** comes from its design-system repo,
  `mapsofmaking/design-system` (it was the empty `mom-pods-overlay`; solid-kit
  ADR 011), checked out at `/srv/mom-design-system`: the kit skin in
  `skins/kit/` (shared with the backoffice), the pods' words in `pods/`,
  started from solid-css-overlay's `overlay-template/`. Optional at first:
  without it, the generic look. The checkout's `.env` loads it (README
  "Install from scratch", step 8):
  `COMPOSE_FILE=compose.yml:/srv/mom-design-system/pods/compose.override.yml`
  and `DESIGN_SYSTEM=/srv/mom-design-system`.
- One checkout per function, prefix `mom-`: `/srv/mom-pods`,
  `/srv/mom-backoffice` (once deployed), `/srv/mom-design-system`.

## Rules for this session

- **Nothing is edited on the VPS.** A change to the gateway is a commit in your
  local clone of vps-infra, pushed, then `git pull` in `/srv/infra`. The
  instance is a checkout at a tag. The only files written by hand on the VPS
  are the git-ignored ones that hold values:
  - `/srv/infra/gateway/.env`;
  - `/srv/mom-pods/instance-template/.env`;
  - `/srv/mom-pods/instance-template/mcp-connector/*`.
- **Secrets never pass through the conversation or a repo**:
  - the OVH token's values;
  - agent client secrets;
  - `identities.json`.

  Nicolas types them into those files himself (`chmod 600`). Read them back
  only as "present / absent", never print them.
- **Stop before anything that touches what already runs.** Recreating
  `gateway-caddy` (step 3) cuts Jason's two sites (myomatch, fixmymedtech) for
  a few seconds. Say when it will happen and wait for Nicolas's go.
- `dig` is not installed on the VPS: run DNS checks from the workstation.
- What fails or is missing is reported back to the cloud session, which fixes
  it in solid-css-overlay, not worked around on the VPS.

## Steps

1. **Inventory**: done 2026-10-21, and its findings are in this file.
2. **Nicolas, at OVH**:
   - DNS: `*.pod` A → `92.222.71.103` (`pod` A is already set).
   - **IPv6 only after a check.** From the workstation:
     ```sh
     curl -6 -sI http://[2001:41d0:404:200::94de]/
     ```
     If Caddy answers, add AAAA records for `pod` and `*.pod` →
     `2001:41d0:404:200::94de`. If not, stay on IPv4. An AAAA record that
     leads nowhere breaks the pods for every IPv6 visitor.
   - The API token: the README's seven rights on `mapsofmaking.org`,
     unlimited validity. Nicolas writes it into `/srv/infra/gateway/.env`
     (`chmod 600`, git-ignored by vps-infra) as `OVH_ENDPOINT=ovh-eu`,
     `OVH_APPLICATION_KEY`, `OVH_APPLICATION_SECRET` and `OVH_CONSUMER_KEY`.
   - Check from the workstation:
     ```sh
     dig +short A x.pod.mapsofmaking.org @dns16.ovh.net
     ```
     should answer `92.222.71.103`.
3. **Caddy with the OVH module, in vps-infra `gateway/`**:
   - Copy `gateway-caddy/Dockerfile` from solid-css-overlay at `v7.2.0-3` to
     `gateway/Dockerfile`. Its default `CADDY_VERSION=2.11.4` is the running
     version.
   - In `gateway/docker-compose.yml`, replace `image: caddy:2-alpine` with
     `build: .` (and an `image:` name such as `gateway-caddy:2.11.4-ovh`), and
     add `env_file: .env`. Nothing else changes.
   - Commit, push, and `git pull` in `/srv/infra`.
   - **With Nicolas's go**:
     ```sh
     cd /srv/infra/gateway
     docker compose build
     docker compose up -d
     ```
     That is one recreate. The certificates survive in their volumes.
   - Check:
     - Jason's two sites answer;
     - `docker exec gateway-caddy caddy list-modules | grep ovh` shows
       `dns.providers.ovh`;
     - `docker exec gateway-caddy caddy version` shows 2.11.4.
4. **The instance**: README "Install from scratch" step 4, with
   `/srv/mom-pods` and the values above. If `/srv/mapsofmaking` or a volume
   `mapsofmaking_css-data` exists from before the rename, remove it first:
   neither holds anything yet. Start `css` only. Then:
   ```sh
   docker compose ps
   docker stats --no-stream
   ```
   With 3.7 GiB and no swap, report the memory.
5. **The site block, in vps-infra**: `instance-template/Caddyfile.tmpl` with
   `{{INSTANCE_NAME}}=mom-pods` and `{{DOMAIN}}=pod.mapsofmaking.org`
   becomes `gateway/sites/mom-pods.caddy`. Then commit, push and pull, and
   run vps-infra's own reload: `caddy validate`, then `caddy reload`, with no
   restart. Caddy's log should show the certificate obtained for
   `*.pod.mapsofmaking.org` within a minute or two, because the DNS challenge
   waits for the TXT record:
   ```sh
   docker logs gateway-caddy --since 5m | grep -i -E 'certificate|ovh|error'
   ```
6. **Checks** (README step 6):
   - the welcome page;
   - Nicolas signs up and creates `nicolas-test`;
   - `curl -sI https://nicolas-test.pod.mapsofmaking.org/ | grep -i pim`;
   - `open_fab` is refused;
   - `scripts/check-overrides.sh '' https://pod.mapsofmaking.org`, run from
     the clone on the workstation;
   - Jason's sites still answer.
7. **The connector** (README step 7). **Waits** for two things: 7.2.0-5 (before
   it, the connector crash-looped on an empty `identities.json`), and the
   backoffice deploy at `backoffice.mapsofmaking.org`, whose page mints
   agents through `/onboard/`. Then `.env` gets
   `ONBOARD_CORS_ORIGINS=https://backoffice.mapsofmaking.org` and
   `COMPOSE_PROFILES=connector`. An agent is a WebID in its owner's pod,
   linked to its owner's account (ADR 010, point 7): no account or pod of its
   own. The backoffice makes it; by hand, README step 7: Nicolas, in his own
   account (or a collective's), writes `profile/<name>`, links
   `…/profile/<name>#me`, makes its client credentials, and writes the
   `identities.json` entry on the VPS.
   With the profile on, `https://pod.mapsofmaking.org/.well-known/css/provider.json`
   lists `onboard` and `connector`; without it, `account` only.

   Then `docker compose up -d` (with the profile on), and check
   `curl -s https://mcp.pod.mapsofmaking.org/healthz`. Make one `solid_whoami`
   call from an MCP client on `https://mcp.pod.mapsofmaking.org/mcp/<slug>`.
8. **By hand**: solid-kit `docs/manual-tests.md` (sign-in from an app,
   consent, mobile).

## Report back

- For each step: done, or the exact command and output where it stopped.
- Memory after steps 4 and 7.
- Anything in the README or the templates that was wrong, missing or unclear
  for this VPS.

## Updating to 7.2.0-4 (the welcome page)

7.2.0-3 went live with the generic welcome page's placeholders: the header
said `pod.example.org` and "Apps on this pod" linked to
`backoffice.example.org`. 7.2.0-4 fixes the page, but the server copied the
old one into its data on first start, so it is replaced by hand once. In
`/srv/mom-pods`:
```sh
git fetch --tags && git checkout v7.2.0-4
# set CSS_OVERLAY_VERSION=7.2.0-4 in instance-template/.env (Nicolas)
cd instance-template && docker compose pull && docker compose up -d
docker compose cp ../overlay/welcome/index.html css:/data/www/index.html
```
Check: `https://pod.mapsofmaking.org/` shows `pod.mapsofmaking.org` under
"Your pod", and no "Apps on this pod" section.

## Updating to 7.2.0-5 (the connector, the create-pod preview)

The same steps as above with `v7.2.0-5`, minus the welcome page copy. The
connector is now a Compose profile, off unless `.env` says
`COMPOSE_PROFILES=connector`: `docker compose up -d` starts CSS only, and
no longer starts a connector that crash-loops on an empty `identities.json`
(fixed too). Keep `MCP_PUBLIC_BASE` and `MCP_ALLOWED_HOSTS` set in `.env`:
Compose checks them even with the profile off.

## Updating to 7.2.0-6 (provider.json, the consent page)

The same steps with `v7.2.0-6`. Then:
- `https://pod.mapsofmaking.org/.well-known/css/provider.json` answers, and
  `scripts/check-overrides.sh '' https://pod.mapsofmaking.org` checks it.
- The consent page names where an app runs when it signs in with a Client ID
  Document, and says so plainly when it does not.
- `.env`: `OVERLAY_DIR` is now `DESIGN_SYSTEM` (only if the look was already
  mounted).

## Updating to 7.2.0-7 (words only)

The same steps with `v7.2.0-7`. The consent checkbox then reads "Let this
app stay signed in". Nothing else to change.

## Updating to 7.2.0-8 (memory limit, connector waits for CSS)

The same steps with `v7.2.0-8`, then `docker compose up -d --force-recreate`
so both containers are created again: they then get the daemon's log
rotation and CSS its 512m limit. Check with
`docker inspect -f '{{.HostConfig.LogConfig.Config}} {{.HostConfig.Memory}}' mom-pods-css`
(`map[max-file:3 max-size:10m] 536870912`), and the connector's log names
`mom2` ready.

## Updating to 7.2.0-9 (email: forgot password)

The same steps with `v7.2.0-9`. Then the mail, once:
1. **Resend**: an API key named `mom-pods email`, sending access only,
   limited to `mapsofmaking.org` (verified, EU). One key per app: the VPS
   alerts have their own.
2. **Nicolas** writes it on the VPS, never in the conversation:
   ```sh
   cd /srv/mom-pods/instance-template && cp email.env.example email.env && chmod 600 email.env && nano email.env
   ```
   `SMTP_PASS` is the key; the other values in the example are Maps of
   Making's.
3. `docker compose up -d css`. The log says
   `[solid-css-overlay] email: smtp.resend.com:587 as Maps of Making <pods@mapsofmaking.org>`.
4. Check: "Forgot your password?" on `nicolas-test`'s login; the mail
   arrives, the link sets a new password, the new password logs in.

## Updating to 7.2.0-10 (welcome page at every start, a new pod's README)

The same steps with `v7.2.0-10`. Tried first on pod.nicolasdb.eu as
`7.2.0-10-rc.1`. Then:
- **The welcome page is written at every start.** The root page
  (`/data/www/index.html`) becomes `mapsofmaking/design-system`'s
  `pods/welcome/index.html` when `.env` loads that repo's override with the
  page mounted, or the image's generic page otherwise. A page copied in by
  hand that is in neither place is replaced: put it in the design-system repo
  first. Check: `docker logs mom-pods-css 2>&1 | grep 'welcome page'` says
  `written to /data/www/index.html` or `up to date`, and
  `https://pod.mapsofmaking.org/` shows the expected page.
- **A new pod's README is the image's** (what is in the pod, what is public,
  sharing, apps and agents; no Databrowser). Maps of Making's own words go in
  `pods/pod/README.md.hbs` of its design-system repo (its issue #2), mounted
  by the line `overlay-template/compose.override.yml` now has. Pods made
  before keep theirs. Check: a throwaway pod's `README`.
- **A change of look** from now on: `git pull` in `/srv/mom-design-system`,
  then `docker compose up -d --force-recreate css` here. A plain `up -d`
  keeps the files from before the pull.

## Updating to 7.2.0-11 (one command), from 7.2.0-9 or 7.2.0-10

7.2.0-11 brings `update.sh`, which does the update and its checks. It also
brings 7.2.0-10's changes (the section above says what to look at). The first
time, the script is not in the checkout yet, so run the new version's copy:
```sh
ssh mom
cd /srv/mom-pods/instance-template
git fetch --tags
git show v7.2.0-11:instance-template/update.sh > /tmp/update.sh
bash /tmp/update.sh 7.2.0-11
```
It says what it checks, and asks once before restarting anything. A
`WARNING` about the welcome page means the live page was copied in by hand:
it is saved under `/root/`; answer `n`, put it in `mapsofmaking/design-system`
(`pods/welcome/index.html`, mount line uncommented), `git pull` in
`/srv/mom-design-system`, and run it again.

Report its output from `== 1. Checks` to the end, then look at
`https://pod.mapsofmaking.org/` in a browser, make one agent call, and open a
throwaway pod's `README`.

Every update after this one:
```sh
ssh mom /srv/mom-pods/instance-template/update.sh <version>
```

## Between test rounds

The reset in the README ("Accounts and pods"), in
`/srv/mom-pods/instance-template/`. It deletes every account and pod, so
only while the instance holds test accounts only.

## Next, not now

- **Account deletion** (`ROADMAP.md`), then OpenFab's account and
  `openfab-bxl`.

- **Backups of the `mom-pods_css-data` volume**: it holds every account
  and pod. This install does not set them up.
- Maps of Making's own skin and words: `mapsofmaking/design-system`
  (above), then README step 8.
- vps-infra housekeeping: the old `/srv/gateway` and `/srv/portainer` copies
  are still on the VPS.
