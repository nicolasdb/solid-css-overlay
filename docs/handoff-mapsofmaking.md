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
| `INSTANCE_NAME` | `mapsofmaking`: containers `mapsofmaking-css` and `mapsofmaking-mcp-connector`, volume `mapsofmaking_css-data` |
| `CSS_OVERLAY_VERSION` | `7.2.0-2`, the same as the tag checked out |
| `GATEWAY_NETWORK` | `proxy` |
| DNS | OVH, zone `mapsofmaking.org`. The site on `mapsofmaking.org` lives on another server (Hetzner) and is not touched |
| VPS | Debian 13, Docker 29.7.2, Compose v5.5.0; 3.7 GiB RAM, no swap; IPv4 `92.222.71.103`, IPv6 `2001:41d0:404:200::94de` |

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
  `/srv/mapsofmaking`.

## Rules for this session

- **Nothing is edited on the VPS.** A change to the gateway is a commit in your
  local clone of vps-infra, pushed, then `git pull` in `/srv/infra`. The
  instance is a checkout at a tag. The only files written by hand on the VPS
  are the git-ignored ones that hold values:
  - `/srv/infra/gateway/.env`;
  - `/srv/mapsofmaking/instance-template/.env`;
  - `/srv/mapsofmaking/instance-template/mcp-connector/*`.
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
   - Copy `gateway-caddy/Dockerfile` from solid-css-overlay at `v7.2.0-2` to
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
   `/srv/mapsofmaking` and the values above. Start `css` only. Then:
   ```sh
   docker compose ps
   docker stats --no-stream
   ```
   With 3.7 GiB and no swap, report the memory.
5. **The site block, in vps-infra**: `instance-template/Caddyfile.tmpl` with
   `{{INSTANCE_NAME}}=mapsofmaking` and `{{DOMAIN}}=pod.mapsofmaking.org`
   becomes `gateway/sites/mapsofmaking.caddy`. Then commit, push and pull, and
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
7. **The connector** (README step 7). Nicolas:
   - creates the agent's account and pod;
   - makes client credentials for the agent on `/.account/`;
   - writes the `identities.json` entry and the agent's values into
     `instance-template/mcp-connector/` on the VPS.

   Then `docker compose up -d mcp-connector`, and check
   `curl -s https://mcp.pod.mapsofmaking.org/healthz`. Make one `solid_whoami`
   call from an MCP client on `https://mcp.pod.mapsofmaking.org/mcp/<slug>`.
8. **By hand**: solid-kit `docs/manual-tests.md` (sign-in from an app,
   consent, mobile).

## Report back

- For each step: done, or the exact command and output where it stopped.
- Memory after steps 4 and 7.
- Anything in the README or the templates that was wrong, missing or unclear
  for this VPS.

## Between test rounds

The reset in the README ("Accounts and pods"), in
`/srv/mapsofmaking/instance-template/`. It deletes every account and pod, so
only while the instance holds test accounts only.

## Next, not now

- **Account deletion** (`ROADMAP.md`, 7.2.0-3), then OpenFab's account and
  `openfab-bxl`.

- **Backups of the `mapsofmaking_css-data` volume**: it holds every account
  and pod. This install does not set them up.
- Maps of Making's own skin and words (`instance-template/overlay/`,
  git-ignored there).
- vps-infra housekeeping:
  - `docs/reference/server-layout.md` still says `/srv/gateway`;
  - the old `/srv/gateway` and `/srv/portainer` copies are still on the VPS.
