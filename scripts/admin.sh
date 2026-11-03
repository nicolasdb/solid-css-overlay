#!/usr/bin/env bash
# The account admin of an instance, from a terminal on its server (solid-kit
# ADR 012). Run from the instance's checkout:
#
#   scripts/admin.sh                         the TUI: list, sort, filter, select, delete
#   scripts/admin.sh list [--json]
#   scripts/admin.sh delete <email|accountId>... --yes [--json]
#
# Deleting an account takes all its pods and everything in them (the names are
# free again), its logins, WebID links and client credentials. Cannot be
# undone. Afterwards this script removes the connector's agents that acted for
# what went (identities.json, outside CSS).
#
# Permission is being here: the tool runs inside the css container (admin/
# admin.js in the image) and reads the token start/admins.js renews at every
# start. No admin list, no password: whoever has ssh and docker on this
# server runs it already.
#
#   INSTANCE_DIR  where the instance's compose.yml is (default: instance-template/
#                 next to this script)
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
instance="${INSTANCE_DIR:-$here/../instance-template}"
cd "$instance"

log=/tmp/account-admin-deleted.jsonl
tty=-T
[ -t 0 ] && [ -t 1 ] && tty=-it

status=0
docker compose exec "$tty" css node /opt/overlay/admin.js "$@" || status=$?

# What was deleted, even if the tool stopped halfway: one JSON line per account.
deleted="$(docker compose exec -T css sh -c "cat $log 2>/dev/null; rm -f $log" || true)"
[ -n "$deleted" ] || exit "$status"

# The connector keeps its agents in identities.json, outside CSS: drop those
# that acted for a deleted account (its WebIDs, or a WebID inside one of its
# pods), through the connector's own writer (validated, mode 600, safe on the
# single-file bind mount).
if docker compose ps --status running --services 2>/dev/null | grep -qx mcp-connector; then
  removed="$(printf '%s\n' "$deleted" | docker compose exec -T mcp-connector node -e '
    const { removeIdentitiesFor } = require("/app/src/identityRegistry");
    const lines = require("fs").readFileSync(0, "utf-8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
    removeIdentitiesFor({ webIds: lines.flatMap((d) => d.webIds), pods: lines.flatMap((d) => d.pods) }, "/app/identities.json")
      .then((labels) => console.log(labels.join(", ") || "none"))
      .catch((error) => { console.error(error.message); process.exit(1); });')"
  echo "connector agents removed: $removed"
else
  echo "connector: not running here, identities.json not touched. If this instance has one,"
  echo "remove the entries whose webId is one of these, or lives in one of these pods:"
  printf '%s\n' "$deleted"
fi
exit "$status"
