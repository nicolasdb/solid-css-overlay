#!/usr/bin/env bash
# An instance admin's front door to what stock CSS cannot do (solid-kit ADR 012).
#
#   scripts/admin.sh delete-account <email> [--yes]
#
# Deletes the account whose login is <email>, every pod it made and
# everything in them, its WebID links and client credentials; the pod names
# are free again. Then removes from the connector's identities.json the
# agents that acted for it. Cannot be undone.
#
# It calls the server's admin route (POST /.account/admin/delete-account/,
# account-admin/ in this repo); nothing is deleted from the data folder by
# hand: that layout is CSS's own, and a script would race the server's locks.
#
# Who may: an account whose login email is in the instance's ADMIN_EMAILS.
#   CSS_URL         the server (default: CSS_BASE_URL from the instance's .env)
#   ADMIN_EMAIL     your login (asked if unset)
#   ADMIN_PASSWORD  your passphrase (asked, not echoed, if unset)
#   INSTANCE_DIR    where the instance's compose.yml is, for the connector
#                   cleanup (default: instance-template/ next to this script)
#
# Needs curl and python3 (JSON), and docker for the connector cleanup.
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
instance="${INSTANCE_DIR:-$here/../instance-template}"

usage() { sed -n '4,5p' "$0" | sed 's/^# //' >&2; exit 2; }
[ "${1:-}" = delete-account ] && [ -n "${2:-}" ] || usage
target="$2"
yes="${3:-}"

json() { python3 -c "import json,sys; d=json.load(sys.stdin); print(eval(sys.argv[1], {'d': d, 'json': json}) or '')" "$1"; }

if [ -z "${CSS_URL:-}" ] && [ -f "$instance/.env" ]; then
  CSS_URL="$(sed -n 's/^CSS_BASE_URL=//p' "$instance/.env" | tail -1)"
fi
[ -n "${CSS_URL:-}" ] || { echo "set CSS_URL (or CSS_BASE_URL in $instance/.env)" >&2; exit 2; }
base="${CSS_URL%/}"

[ -n "${ADMIN_EMAIL:-}" ] || read -r -p "Your admin login email: " ADMIN_EMAIL
[ -n "${ADMIN_PASSWORD:-}" ] || { read -r -s -p "Your passphrase: " ADMIN_PASSWORD; echo; }

if [ "$yes" != --yes ]; then
  echo "This deletes, on $base and for good: the account of $target, all its pods and everything in them,"
  echo "its WebIDs, and the agents that act for it."
  read -r -p "Type the email again to go on: " again
  [ "$again" = "$target" ] || { echo "Not the same: nothing deleted." >&2; exit 1; }
fi

# Sign in to the account API: the token goes in Authorization, as the stock
# JSON API documents (no cookie jar needed).
login_url="$(curl -fsS -H 'accept: application/json' "$base/.account/" | json "d['controls']['password']['login']")"
login="$(python3 -c 'import json,sys; print(json.dumps({"email": sys.argv[1], "password": sys.argv[2]}))' "$ADMIN_EMAIL" "$ADMIN_PASSWORD")"
token="$(curl -fsS -H 'content-type: application/json' -H 'accept: application/json' -d "$login" "$login_url" | json "d.get('authorization')")" \
  || { echo "Sign-in refused for $ADMIN_EMAIL." >&2; exit 1; }

body="$(python3 -c 'import json,sys; print(json.dumps({"email": sys.argv[1]}))' "$target")"
answer="$(curl -sS -w '\n%{http_code}' -H 'content-type: application/json' -H 'accept: application/json' \
  -H "authorization: CSS-Account-Token $token" -d "$body" "$base/.account/admin/delete-account/")"
status="${answer##*$'\n'}"
answer="${answer%$'\n'*}"
if [ "$status" != 200 ]; then
  echo "Refused ($status): $(printf '%s' "$answer" | json "d.get('message')" 2>/dev/null || printf '%s' "$answer")" >&2
  exit 1
fi

deleted="$(printf '%s' "$answer" | json "json.dumps(d['deleted'])")"
echo "Deleted on $base:"
printf '%s' "$deleted" | python3 -c '
import json, sys
d = json.load(sys.stdin)
print("  account", d["accountId"], "(" + ", ".join(d["emails"]) + ")")
for pod in d["pods"]: print("  pod    ", pod)
for webId in d["webIds"]: print("  WebID  ", webId)'

# The connector keeps its agents in identities.json, outside CSS: drop those
# that acted for this account, through the connector's own writer (validated,
# mode 600, safe on the single-file bind mount).
if [ -f "$instance/compose.yml" ] && (cd "$instance" && docker compose ps --status running --services 2>/dev/null | grep -qx mcp-connector); then
  removed="$(cd "$instance" && docker compose exec -T mcp-connector node -e '
    const { removeIdentitiesFor } = require("/app/src/identityRegistry");
    removeIdentitiesFor(JSON.parse(process.argv[1]), "/app/identities.json")
      .then((labels) => console.log(labels.join(", ") || "none"))
      .catch((error) => { console.error(error.message); process.exit(1); });' "$deleted")"
  echo "  connector agents removed: $removed"
else
  echo "  connector: not running here, identities.json not touched. If this instance has one, remove"
  echo "  the entries whose webId is listed above (or lives in a pod above), or run this again where it runs."
fi
