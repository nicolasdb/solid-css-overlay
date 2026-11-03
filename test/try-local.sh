#!/usr/bin/env bash
# Run the image locally, as an instance would, with a throwaway data folder.
#
#   test/try-local.sh [port] [instance overlay dir]
#   then: node test/smoke.mjs http://localhost:<port> <shots dir>
#
# IMAGE      the image to run (default solid-css-overlay:dev, `docker build -t
#            solid-css-overlay:dev .` first)
# POD_LAYOUT subdomain (default: config/instance.json) or suffix
#            (config/suffix.json, what pocpod0 runs). smoke.mjs reads the same
#            variable, so export it once for both.
# COMPOSE_PROFILES, MCP_PUBLIC_BASE  passed through when set, as compose does:
#            they decide what /.well-known/css/provider.json offers.
# TRY_NETWORK=host  share the host's network instead of publishing the port
#            (Linux; for a sandbox where published ports do not answer).
#
# The instance overlay dir, if given, is mounted the way instance-template's
# compose.yml mounts overlay/: skin.css, fonts/, welcome/index.html.
#
# Pods are http://<name>.localhost:<port>/ in subdomain mode. Browsers resolve
# *.localhost to this machine by themselves; curl needs
# --resolve <name>.localhost:<port>:127.0.0.1, and node's fetch cannot reach
# them at all, which is why smoke.mjs checks them from inside the browser.
#
# Why this exists: on instance 1 it caught a submit that stayed disabled, a
# missing gap and a double message before deploy. A mockup cannot show any of
# those; only the server's own scripts running on our markup can. It runs the
# built image, not CSS under node, so what passes here is what ships.
set -euo pipefail

port="${1:-3123}"
overlay="${2:-}"
image="${IMAGE:-solid-css-overlay:dev}"
layout="${POD_LAYOUT:-subdomain}"
name="try-css-overlay-$port"
work="${TMPDIR:-/tmp}/$name"

rm -rf "$work" && mkdir -p "$work/data"
chmod 777 "$work/data"
args=(--rm -d --name "$name" -v "$work/data:/data"
  -e "CSS_BASE_URL=http://localhost:$port/" -e "CSS_PORT=$port")
[ -n "${COMPOSE_PROFILES:-}" ] && args+=(-e "COMPOSE_PROFILES=$COMPOSE_PROFILES")
[ -n "${MCP_PUBLIC_BASE:-}" ] && args+=(-e "MCP_PUBLIC_BASE=$MCP_PUBLIC_BASE")
if [ "${TRY_NETWORK:-}" = host ]; then args+=(--network host); else args+=(-p "$port:$port"); fi

case "$layout" in
  subdomain) ;;
  suffix)
    # The config only: since 7.2.0-6 the image tells the pages itself
    # (start/describe.js writes pod-layout.js from CSS_CONFIG). Until then this
    # script mounted a pod-layout.js, as every suffix instance had to.
    args+=(-e CSS_CONFIG=/config/suffix.json) ;;
  *) echo "POD_LAYOUT must be subdomain or suffix, not $layout" >&2; exit 2 ;;
esac

if [ -n "$overlay" ]; then
  overlay="$(cd "$overlay" && pwd)"
  [ -f "$overlay/skin.css" ] && args+=(-v "$overlay/skin.css:/community-server/templates/styles/skin.css:ro")
  [ -d "$overlay/fonts" ] && args+=(-v "$overlay/fonts:/community-server/templates/fonts/skin:ro")
  [ -f "$overlay/welcome/index.html" ] && args+=(-v "$overlay/welcome/index.html:/community-server/templates/root/intro/base/index.html:ro")
fi

docker rm -f "$name" >/dev/null 2>&1 || true
docker run "${args[@]}" "$image" >/dev/null

for _ in $(seq 1 90); do
  curl -fs -o /dev/null "http://localhost:$port/.account/login/password/" && break
  sleep 1
done
curl -fs -o /dev/null "http://localhost:$port/.account/login/password/" \
  || { echo "server did not start:"; docker logs "$name" 2>&1 | tail -20; docker rm -f "$name" >/dev/null; exit 1; }

echo "$image ($layout pods) on http://localhost:$port/ — container $name, data $work/data"
echo "next: POD_LAYOUT=$layout node $(cd "$(dirname "$0")" && pwd)/smoke.mjs http://localhost:$port <screenshots dir>"
echo "stop: docker rm -f $name"
