# Handoff: pod.nicolasdb.eu moves from pocpod0 to the image

**Status 2026-10-27: done, the cutover held** on `7.2.0-10-rc.1`. Left:
step 6 (pocpod0#4 merged and deployed, then the new volumes in the nightly
backup).

A brief for a Claude Code session on Nicolas's computer, the only place that
reaches the Hetzner VPS (`ssh hetzner`). Today pod.nicolasdb.eu is stock CSS
7.2.0 run by pocpod0's compose (`community-solid-server`, with pocpod0's own
`infra/css/` mounts) and pocpod0's own connector. After this, it is an
instance of the image like Maps of Making, and the server where every new
version is tried first (README, "Updating an instance").

**Nobody's account or data is converted.** The server's data volume is copied
whole into the instance's volume, and the image runs it with the same address
and the same folder pods. Rehearsed in a sandbox on 2026-10-27 with pocpod0's
exact config: passwords, pods, WebID links, client credentials, tokens issued
before the switch, ACLs and every pod file (byte for byte) carried over. The
old volume is never written: it is the way back.

## The values

| | |
|---|---|
| Instance | `nicolasdb-pods`: containers `nicolasdb-pods-css` and `nicolasdb-pods-mcp-connector`, volumes `nicolasdb-pods_css-data` and `nicolasdb-pods_mcp-audit` |
| Checkout | `/srv/nicolasdb-pods`, at `v7.2.0-10-rc.1` (a pre-release: this server tries it first) |
| Design-system repo | `nicolasdb/design-system` at `/srv/nicolasdb-design-system`: `pods/` mounts the welcome page and sets folder pods (`CSS_CONFIG=/config/suffix.json`) |
| `CSS_BASE_URL` | `https://pod.nicolasdb.eu/`, trailing slash: the value CSS recorded at setup, which pocpod0 built from `CSS_BASE_URL` + `/` |
| `CSS_OVERLAY_VERSION` | `7.2.0-10-rc.1` |
| `GATEWAY_NETWORK` | `gateway` (hetzner-gateway's nginx) |
| `COMPOSE_PROFILES` | `connector` |
| `MCP_PUBLIC_BASE` | `https://solid-mcp.nicolasdb.eu/`, unchanged: claude.ai connectors point there |
| `MCP_ALLOWED_HOSTS` | `solid-mcp.nicolasdb.eu,pod.nicolasdb.eu` |
| `ONBOARD_CORS_ORIGINS` | `https://backoffice.nicolasdb.eu,https://test.nicolasdb.eu` |
| `OXIGRAPH_URL` | `http://oxigraph:7878` (pocpod0's oxigraph, which joins the `gateway` network: pocpod0 PR) |
| Stays in pocpod0 | oxigraph, the pipeline, the backups. Qdrant is retired |

## Rules for this session

- **Nothing is edited on the VPS** but the git-ignored files that hold values:
  `/srv/nicolasdb-pods/instance-template/.env` and
  `/srv/nicolasdb-pods/instance-template/mcp-connector/*`. A gateway change is
  a commit in hetzner-gateway, deployed the way that repo deploys.
- **Secrets never pass through the conversation**: the connector's `.env` and
  `identities.json` are copied on the VPS, read back only as present/absent.
- **Stop before the cutover** (step 4) and wait for Nicolas's go: it takes
  pod.nicolasdb.eu and solid-mcp.nicolasdb.eu down for a few minutes.
- What fails is reported back to the cloud session, not worked around.

## Steps

### 0. Inventory (read only)

```sh
free -m; df -h /var/lib/docker
docker ps --format '{{.Names}}\t{{.Image}}\t{{.Status}}'
docker stats --no-stream --format '{{.Name}}\t{{.MemUsage}}'
crontab -l; systemctl list-timers --no-pager | head -20
docker network inspect pocpod0_default --format '{{range .Containers}}{{.Name}} {{end}}'
ps aux | grep -E 'run_pipeline|troll|openclaw' | grep -v grep
docker volume ls | grep -E 'pocpod0_|nicolasdb-pods'
docker run --rm -v pocpod0_css-data:/d:ro alpine cat '/d/.internal/setup/current-base-url$.json'
```
And in hetzner-gateway: every vhost line that names the two containers:
```sh
grep -rn -E 'community-solid-server|mcp-connector' <hetzner-gateway>/nginx/conf.d/
```

Report all of it. **Stop and ask** if:
- anything on pocpod0's network besides `community-solid-server`,
  `mcp-connector`, `oxigraph` and `qdrant` runs, or a cron or process runs
  the pipeline, troll or OpenClaw. The image refuses the `Authorization:
  WebID` header those send; deciding what happens to them comes first;
- the recorded base URL is not exactly `https://pod.nicolasdb.eu/`;
- available memory is under ~600 MiB with everything running: the
  `available` column of `free -m`, not `free`, which leaves out the cache
  the kernel gives back on demand (the instance's CSS idles at ~125 MiB and
  is capped at 512 MiB; the old one stops at cutover).

### 1. Backup

```sh
/usr/local/sbin/pocpod0-backup && journalctl -t pocpod0-backup -n 1
```

### 2. The two checkouts (no downtime)

```sh
git clone --branch v7.2.0-10-rc.1 https://github.com/nicolasdb/solid-css-overlay /srv/nicolasdb-pods
git clone https://github.com/nicolasdb/design-system /srv/nicolasdb-design-system
cd /srv/nicolasdb-pods/instance-template
cp .env.example .env    # then the values above, plus:
#   COMPOSE_FILE=compose.yml:/srv/nicolasdb-design-system/pods/compose.override.yml
#   DESIGN_SYSTEM=/srv/nicolasdb-design-system
mkdir -p mcp-connector
cp -p /home/nicolas/pocpod0/mcp-connector/identities.json /home/nicolas/pocpod0/mcp-connector/.env mcp-connector/
chmod 600 .env mcp-connector/.env mcp-connector/identities.json
docker compose config --quiet && docker compose pull
docker compose config | grep -E 'CSS_CONFIG|CSS_BASE_URL|index.html'
```
The last line must show `CSS_CONFIG: /config/suffix.json`, the base URL with
its slash, and the welcome page mounted from `/srv/nicolasdb-design-system`.
Nothing is started yet.

### 3. Report and wait for the go

### 4. Cutover (with Nicolas's go)

```sh
cd /home/nicolas/pocpod0 && docker compose stop community-solid-server mcp-connector qdrant   # qdrant is retired

cd /srv/nicolasdb-pods/instance-template
docker compose create          # makes the containers and the empty volumes, starts nothing
docker run --rm -v pocpod0_css-data:/from:ro -v nicolasdb-pods_css-data:/to alpine sh -c 'cp -a /from/. /to/'
docker run --rm -v pocpod0_mcp-audit:/from:ro -v nicolasdb-pods_mcp-audit:/to alpine sh -c 'cp -a /from/. /to/'
docker run --rm -v pocpod0_css-data:/a:ro -v nicolasdb-pods_css-data:/b:ro alpine du -s /a /b
docker network connect gateway oxigraph    # until the pocpod0 PR makes it permanent
docker compose up -d
docker logs nicolasdb-pods-css 2>&1 | grep solid-css-overlay
```
The two sizes match. The log says `7.2.0-10-rc.1, suffix pods, offers:
account, onboard, connector` and `welcome page: written to /data/index.html`.

Then the gateway, in hetzner-gateway: in the lines step 0 listed, the upstream
`community-solid-server:3000` becomes `nicolasdb-pods-css:3000` and
`mcp-connector:3939` becomes `nicolasdb-pods-mcp-connector:3939`. Nothing else
changes. Commit, deploy, `nginx -t`, reload (no restart).

### 5. Checks

From the workstation:
```sh
curl -sI https://pod.nicolasdb.eu/ | head -1
curl -s https://pod.nicolasdb.eu/.well-known/css/provider.json
curl -s https://solid-mcp.nicolasdb.eu/healthz
scripts/check-overrides.sh '' https://pod.nicolasdb.eu      # from the solid-css-overlay clone
```
- `provider.json`: `"version": "7.2.0-10-rc.1"`, `"layout": "suffix"`, and
  `account`, `onboard`, `connector`.
- `https://pod.nicolasdb.eu/` shows the design-system's welcome page, with
  "Apps on this pod".
- Nicolas signs in on backoffice.nicolasdb.eu with his usual password, and
  his pods and files are there.
- An agent: `solid_whoami` from claude.ai through solid-mcp.nicolasdb.eu,
  then a `graph_query` (oxigraph reached).
- A new test pod's `README` is the image's ("Welcome to your pod", no
  Databrowser). Pods made before keep theirs.
- `docker stats --no-stream`: report the instance's memory.

### Rollback

```sh
cd /srv/nicolasdb-pods/instance-template && docker compose down     # never -v
# revert the hetzner-gateway commit, deploy, nginx -t, reload
cd /home/nicolas/pocpod0 && docker compose start community-solid-server mcp-connector
```
pocpod0's volumes were only read. What people wrote between the cutover and
the rollback stays in `nicolasdb-pods_css-data` only.

### 6. After it holds

- The pocpod0 `vps-mode` PR (CSS, connector and qdrant out of its compose,
  oxigraph on the `gateway` network, backups of the new volumes) is merged
  and deployed, the same day if possible: until then the nightly backup
  archives the old volume, not the new one. From the workstation, in pocpod0
  on `vps-mode`:
  ```sh
  make vps-push            # refuses: lists infra/css/* and scripts/check-css-overrides.sh to delete
  make vps-push FORCE=1    # only if that list holds nothing else
  ssh hetzner 'cd /home/nicolas/pocpod0 && docker compose up -d --remove-orphans'
  make vps-backup-schedule
  ssh hetzner '/usr/local/sbin/pocpod0-backup; journalctl -t pocpod0-backup -n 1'
  ```
  `--remove-orphans` removes the three stopped containers, never a volume.
  The backup now fails on a volume that does not exist: if the journal says
  `no volume pocpod0_openclaw-data-default`, report it rather than create it.
  Until the PR is deployed, a backup by hand:
  ```sh
  docker run --rm -v nicolasdb-pods_css-data:/data:ro alpine tar czf - /data \
    > /home/nicolas/pocpod0/backups/nicolasdb-pods-css-data-$(date +%F).tar.gz
  ```
- After a week of nightly backups of the new volumes:
  `docker volume rm pocpod0_css-data pocpod0_mcp-audit pocpod0_qdrant-data`.
- The welcome page's apps: edit `pods/welcome/index.html` in
  nicolasdb/design-system, `git pull` in `/srv/nicolasdb-design-system`, then
  `docker compose up -d --force-recreate css` in the instance's folder.
- A new version: a new pre-release tag tried here first, with
  `/srv/nicolasdb-pods/instance-template/update.sh <version>-rc.<n>` (the
  first time, the copy from the tag: Maps of Making's handoff, "Updating to
  7.2.0-11"). README, "Updating
  an instance"); the final tag goes to Maps of Making once it holds.

## Report back

For each step: done, or the exact command and output where it stopped.
Step 0's inventory in full (secrets excepted), and the memory before and
after.
