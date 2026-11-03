# Reference

## `scripts/admin.sh`

Run from the instance's checkout. It calls the tool in the `css` container,
then cleans up the connector.

| Command | Does |
|---|---|
| `scripts/admin.sh` | the TUI |
| `scripts/admin.sh list [--json]` | every account: logins, pods, WebIDs |
| `scripts/admin.sh delete <email\|accountId>... --yes [--json]` | deletes those accounts, without asking |

| Variable | Default | |
|---|---|---|
| `INSTANCE_DIR` | `instance-template/` next to the script | where `compose.yml` is |

Exit code: the tool's own. The connector clean-up runs even if the tool
stopped partway, for whatever was deleted before it stopped.

## TUI keys

| Key | |
|---|---|
| ↑ ↓, j k | move |
| Page Up, Page Down | move by 10 |
| space | select or unselect, then move down |
| a | select all shown; again: unselect them |
| / | filter on email and pod address; Enter applies; empty shows all |
| s | sort: email → most pods first → pod name |
| r | reload from the server |
| d | delete the selected accounts, or the one under the cursor |
| Esc | leave the filter or the confirmation |
| q, Ctrl-C | quit |

A deletion asks you to type the number of accounts about to go.

## `admin/admin.js` (in the image: `/opt/overlay/admin.js`)

| Variable | Default | |
|---|---|---|
| `CSS_BASE_URL` | set by compose | the host the tool asks CSS about (`X-Forwarded-Host`, `X-Forwarded-Proto`) |
| `CSS_PORT` | `3000` | where CSS listens inside the container |
| `ADMIN_TOKEN_FILE` | `/community-server/config/identity/handler/account-admin.token` | |
| `ADMIN_DELETED_LOG` | `/tmp/account-admin-deleted.jsonl` | one JSON line per deleted account; `admin.sh` reads it, then removes it |

## The route

`POST /.account/admin/accounts/`, JSON body:

| Body | Answer (200) |
|---|---|
| `{ "token", "action": "list" }` | `{ "accounts": [ { accountId, emails, pods, webIds } ] }` |
| `{ "token", "action": "delete", "email" }` | `{ "deleted": { accountId, emails, pods, webIds } }` |
| `{ "token", "action": "delete", "accountId" }` | same |

| Status | When |
|---|---|
| 400 | no action, or no email or accountId |
| 403 | the token is wrong or missing, or the server has none |
| 404 | no such account; or, from outside, the gateway refuses the path |

The token is 43 characters, random, renewed at every start by
`start/admins.js`. It is written, mode 600, into
`config/identity/handler/account-admin.json` (the route's config) and
`config/identity/handler/account-admin.token` (for the tool). Both live in the
container's filesystem, not in the data volume.

## What a deletion removes

| Removed | How |
|---|---|
| every resource in the account's pods | resource store, depth first |
| each pod root, with its `.acl` and `.meta` | data accessor, under the write lock |
| logins, pod records, WebID links, client credentials | `delete('account', id)` on the account storage |
| the connector's agents for its WebIDs or its pods | `scripts/admin.sh`, through `removeIdentitiesFor` |

Not removed: copies of the person's data held elsewhere, for example pulled
into a collective's pod (ADR 006). Those belong to whoever holds them.

## The gateway

`instance-template/Caddyfile.tmpl` answers 404 for `/.account/admin/*` on the
server's host, and `gateway-vhost.conf.tmpl` does so on every host. A gateway
set up before 7.3.0-4 lacks this. The token still protects the route.
