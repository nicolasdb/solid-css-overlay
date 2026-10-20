# Handoff: install solid-css-overlay on the Maps of Making VPS

A brief for a Claude Code session on Nicolas's computer, the only place that
reaches the VPS (`ssh mom`). It applies the README's "Install from scratch" to
this one VPS. Read the README section first; this file only adds what is
particular to Maps of Making.

## The values

| | |
|---|---|
| Server address (`CSS_BASE_URL`) | `https://pod.mapsofmaking.org/` |
| First pod | `openfab-bxl` → `https://openfab-bxl.pod.mapsofmaking.org/` |
| Connector (`MCP_PUBLIC_BASE`) | `https://mcp.pod.mapsofmaking.org/` |
| `MCP_ALLOWED_HOSTS` | `mcp.pod.mapsofmaking.org,pod.mapsofmaking.org` (the second for `/onboard/`) |
| `INSTANCE_NAME` | `mapsofmaking` (containers `mapsofmaking-css`, `mapsofmaking-mcp-connector`) |
| `CSS_OVERLAY_VERSION` | `7.2.0-1` |
| DNS | OVH, zone `mapsofmaking.org`; the site on `mapsofmaking.org` stays as it is |
| VPS | Debian 13, Docker; containers: Portainer, a Caddy gateway, the apps |
| VPS config | the private repo `mapsofmaking/vps-infra` (`gateway/`, `portainer/`, `docs/`) |

## Rules for this session

- **vps-infra is the source of truth, and the VPS checkout is read-only** (its
  own docs say so). Every config change is a commit in a local clone of
  vps-infra, pushed, then pulled on the VPS by Nicolas, or by you with his go.
  Never edit a file on the VPS. Follow vps-infra's own conventions (where a
  stack lives, how Portainer deploys it) over this file's.
- **Secrets never pass through the conversation or a repo**:
  - the OVH token's three values;
  - agent client secrets;
  - `identities.json`.
  Nicolas types them into files on the VPS himself (`chmod 600`). Read
  them back only as "present / absent", never print them.
- **Read-only first.** Step 1 changes nothing. Stop after it and report.
- **Stop before anything that touches what already runs**: rebuilding or
  restarting the Caddy gateway restarts every site behind it. Say when it
  will happen and wait for Nicolas's go.
- What fails or is missing is reported back to the cloud session, which fixes
  it in solid-css-overlay, not worked around on the VPS.

## Steps

1. **Inventory (read-only)**, over `ssh mom`:
   - OS and Docker/compose versions; free disk;
   - public IPv4/IPv6 (`ip -br a`, `curl -s4 ifconfig.me`, `curl -s6 ifconfig.me`);
   - `docker ps --format '{{.Names}}\t{{.Image}}\t{{.Ports}}'`;
   - `docker network ls`;
   - which network the Caddy container is on;
   - its image (stock `caddy:…` or a build), its version
     (`docker exec <caddy> caddy version`) and its modules
     (`docker exec <caddy> caddy list-modules | grep dns`);
   - how its Caddyfile is mounted and how it is reloaded;
   - where Portainer's stacks come from;
   - `dig +short A pod.mapsofmaking.org` and
     `dig +short A x.pod.mapsofmaking.org` (empty is expected before step 2).

   Read vps-infra's README and `docs/`. Report all of it, then stop.
2. **Nicolas, at OVH**:
   - DNS records `pod` and `*.pod` → the VPS (A, and AAAA if it has IPv6);
   - the API token with the README's seven rights on `mapsofmaking.org`, put
     into the gateway's env file on the VPS.
3. **Caddy with the OVH module** (in vps-infra `gateway/`): build from
   solid-css-overlay's `gateway-caddy/Dockerfile` (copy it in, keeping
   `CADDY_VERSION` at or above the running version), and pass the four `OVH_*`
   variables from the env file. Nothing else in the gateway changes.
   Rebuilding and restarting Caddy needs Nicolas's go. Afterwards, every
   existing site still answers, and `caddy list-modules | grep ovh` lists
   `dns.providers.ovh`.
4. **The instance** (in vps-infra, as a new stack, the way vps-infra does
   stacks): `instance-template/compose.yml` and `.env.example` from
   solid-css-overlay, with the values above.
   - `GATEWAY_NETWORK` is the network Caddy is on.
   - The `mcp-connector/` files are created as the README's step 4 says
     (owner uid 1000, mode 600).
   - Start `css` only.
5. **The site block**: `instance-template/Caddyfile.tmpl` with
   `{{INSTANCE_NAME}}=mapsofmaking` and `{{DOMAIN}}=pod.mapsofmaking.org`, into
   the gateway's Caddyfile; reload. Caddy's log should show the wildcard
   certificate obtained for `*.pod.mapsofmaking.org`. This takes a minute or
   two: the DNS challenge waits for the TXT record to propagate.
6. **Checks** (README step 6):
   - the welcome page;
   - Nicolas signs up and creates `openfab-bxl`;
   - `curl -sI https://openfab-bxl.pod.mapsofmaking.org/ | grep -i pim`;
   - `open_fab` is refused;
   - `scripts/check-overrides.sh '' https://pod.mapsofmaking.org`, run from
     the clone on Nicolas's computer;
   - the site on `mapsofmaking.org` is unchanged.
7. **The connector** (README step 7). Nicolas:
   - creates the agent's account and pod;
   - makes client credentials for the agent on `/.account/`;
   - writes the `identities.json` entry and the agent's values in
     `mcp-connector/.env` on the VPS.

   Then `up -d mcp-connector`, and
   `curl -s https://mcp.pod.mapsofmaking.org/healthz`. One `solid_whoami`
   from an MCP client on `https://mcp.pod.mapsofmaking.org/mcp/<slug>`.
8. **By hand**: solid-kit `docs/manual-tests.md` (sign-in from an app,
   consent, mobile).

## Report back

- For each step: done, or the exact command and output where it stopped.
- The inventory, in full.
- Anything in the README or the templates that was wrong, missing or unclear
  for this VPS.

## Next, not now

- **Backups of the `css-data` volume**: it holds every account and pod. Not
  set up by this install.
- Maps of Making's own skin and words (`overlay/`).
