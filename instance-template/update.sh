#!/usr/bin/env bash
# Update this instance to another solid-css-overlay version, in one command,
# on the VPS:
#
#   /srv/<instance>/instance-template/update.sh 7.2.0-11
#
# It does what README "Updating an instance" says, in order, and checks as it
# goes. Until 7.2.0-11 that was eight commands typed by hand, plus a check of
# the welcome page, and a step missed (a plain `up -d`, the version left in
# .env) gave a server that looked updated and was not.
#
#   1. Checks, changing nothing: the checkout has no edits (it is never
#      edited), the version is a tag, the images exist.
#   2. The welcome page: from 7.2.0-10 it is rewritten at every start (from
#      the design-system repo, or the image's generic page). If the live page
#      is neither, it was copied in by hand and is about to go: it is saved
#      first, and the update asks before going on.
#   3. Asks, unless -y.
#   4. Checks out the tag, sets CSS_OVERLAY_VERSION in .env, pulls, and
#      recreates the containers (`--force-recreate`: a plain `up -d` keeps
#      the files mounted before a design-system pull), then waits until they
#      are healthy and the server says it runs the new version.
#   5. Any failure in 4 goes back to the version it started from, the same
#      way, and says so. The data volume is never touched.
#
# The first time, on an instance whose checkout predates this script, run
# the new version's copy from the instance-template folder:
#   cd /srv/<instance>/instance-template && git fetch --tags
#   git show v7.2.0-11:instance-template/update.sh > /tmp/update.sh
#   bash /tmp/update.sh 7.2.0-11
# Not piped into bash: a command in it that reads stdin (docker compose
# exec) would swallow the rest of the script, which then stops silently.
set -euo pipefail

# The instance-template folder: this script's own when it is run from the
# checkout, the current folder when it is run from a copy (the first time,
# above).
here="${UPDATE_SH_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]:-.}")" 2>/dev/null && pwd || pwd)}"
[ -f "$here/.env" ] && [ -f "$here/compose.yml" ] || here="$PWD"
# Bash reads a script as it runs it, and step 4 checks out another version
# of this very file: run from a copy, so the checkout cannot change it
# mid-run.
if [ -z "${UPDATE_SH_DIR:-}" ] && [ -f "${BASH_SOURCE[0]:-}" ]; then
  copy="$(mktemp)"; cp "${BASH_SOURCE[0]}" "$copy"
  UPDATE_SH_DIR="$here" exec bash "$copy" "$@"
fi

yes=0
case "${1:-}" in -y) yes=1; shift ;; esac
new="${1:-}"; new="${new#v}"
[ -n "$new" ] || { echo "usage: update.sh [-y] <version>   e.g. update.sh 7.2.0-11"; exit 2; }

say()  { printf '\n== %s\n' "$*"; }
stop() { printf '\nSTOPPED, nothing changed: %s\n' "$*" >&2; exit 1; }

cd "$here"
[ -f .env ] && [ -f compose.yml ] || stop "run it from the instance's instance-template folder (no .env or compose.yml in $here)"
root="$(git rev-parse --show-toplevel)"

env_get() { sed -n "s/^$1=//p" .env | tail -1; }
old="$(env_get CSS_OVERLAY_VERSION)"; name="$(env_get INSTANCE_NAME)"
[ -n "$old" ] && [ -n "$name" ] || stop ".env has no CSS_OVERLAY_VERSION or INSTANCE_NAME"
[ "$old" != "$new" ] || stop "$name already runs $new"

say "1. Checks"
[ -z "$(git -C "$root" status --porcelain --untracked-files=no)" ] \
  || stop "the checkout has edits (git -C $root status); it is never edited: move them to .env or the design-system repo"
git -C "$root" fetch -q --tags origin || stop "git fetch failed"
git -C "$root" rev-parse -q --verify "refs/tags/v$new" >/dev/null || stop "there is no tag v$new"
from_ref="$(git -C "$root" describe --tags --exact-match 2>/dev/null || git -C "$root" rev-parse HEAD)"
echo "   $name: $old ($from_ref) -> $new (v$new)"

say "2. The welcome page"
page=www/index.html
docker compose config | grep 'CSS_CONFIG: /config/suffix.json' >/dev/null && page=index.html
mounted="$(docker compose config --format json 2>/dev/null \
  | grep -o '"source": *"[^"]*pods/welcome/index.html"' | sed 's/.*"\([^"]*\)"$/\1/' || true)"
if [ -n "$mounted" ]; then next="$(cat "$mounted")"; from="the design-system repo ($mounted)"
else next="$(git -C "$root" show "v$new:overlay/welcome/index.html")"; from="the image's generic page"; fi
if live="$(docker compose exec -T css cat "/data/$page" 2>/dev/null </dev/null)"; then
  if [ "$live" = "$next" ]; then
    echo "   the live page is already $from: nothing changes"
  elif [ "$live" = "$(git -C "$root" show "$from_ref:overlay/welcome/index.html" 2>/dev/null)" ]; then
    # The image's own page is never lost: it is in every version.
    echo "   the live page is the image's generic page; it is replaced by $from's page"
  else
    saved="$HOME/$name-welcome-before-$new.html"
    printf '%s\n' "$live" > "$saved"
    echo "   WARNING: the live page is not $from: it was copied in by hand."
    echo "   It is replaced at start. Saved to $saved: put it in the design-system repo"
    echo "   (pods/welcome/index.html) to keep it."
    [ "$yes" = 1 ] && stop "the live welcome page would be lost; saved to $saved (run without -y to go on anyway)"
  fi
else
  echo "   no page at /data/$page to compare (css not running, or no page yet)"
fi

if [ "$yes" != 1 ]; then
  printf '\nUpdate %s from %s to %s? CSS restarts (a few seconds down). [y/N] ' "$name" "$old" "$new"
  read -r answer < /dev/tty || answer=""
  case "$answer" in y|Y|yes) ;; *) stop "not confirmed" ;; esac
fi

switch() { # version ref -> 0 when it runs and says so
  git -C "$root" checkout -q "$2" || return 1
  sed -i "s/^CSS_OVERLAY_VERSION=.*/CSS_OVERLAY_VERSION=$1/" .env
  # A pull that fails is fine only if the image is already here (checked next).
  docker compose pull -q --ignore-pull-failures || true
  for image in $(docker compose config --images); do
    docker image inspect "$image" >/dev/null 2>&1 || { echo "   no image $image (not published, or the pull failed)"; return 1; }
  done
  docker compose up -d --force-recreate --wait --wait-timeout 180 || return 1
  # Not `grep -q`: it stops reading at the first match, `docker logs` then
  # dies of SIGPIPE, and with pipefail the check fails on an instance whose
  # log is long (mom-pods, 2026-10-31: a healthy 7.2.0-11 rolled back).
  docker logs "$name-css" 2>&1 | grep "\[solid-css-overlay\] $1, " >/dev/null \
    || { echo "   $name-css does not say it runs $1"; return 1; }
}

say "3. Updating to $new"
if switch "$new" "v$new"; then
  say "Done: $name runs $new"
  docker logs "$name-css" 2>&1 | grep '\[solid-css-overlay\]' | tail -3 | sed 's/^/   /'
  docker stats --no-stream --format '   {{.Name}} {{.MemUsage}}' $(docker compose ps -q)
  echo "   Look at the welcome page in a browser, and make one agent call if the connector runs."
else
  say "FAILED: going back to $old"
  if switch "$old" "$from_ref"; then
    echo "   $name runs $old again. Nothing in the data changed. Report the lines above."
  else
    echo "   GOING BACK FAILED TOO: $name may be down. Report everything above."
  fi
  exit 1
fi
