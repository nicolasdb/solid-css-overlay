#!/usr/bin/env bash
# The welcome page comes back at every start (start/welcome.js), on a server
# that already has data: replace it in the data, restart, and the root serves
# the image's page again. Until 7.2.0-10 only the first start wrote it.
#
#   test/welcome-restart.sh <port>    # after test/try-local.sh <port>
set -euo pipefail
port="$1"; name="try-css-overlay-$port"
layout="${POD_LAYOUT:-subdomain}"
page="/data/$([ "$layout" = suffix ] || echo www/)index.html"
# Inside the container: the data is the server's (root), not the runner's.
docker exec "$name" sh -c "test -f $page && echo '<!doctype html><title>stale</title><p>an old welcome page' > $page" \
  || { echo "FAIL no welcome page at $page"; exit 1; }
docker restart "$name" >/dev/null
for _ in $(seq 60); do
  curl -fs --noproxy '*' -o /dev/null "http://localhost:$port/.account/login/password/" && break; sleep 1
done
docker logs "$name" 2>&1 | grep 'welcome page:' | tail -1
served="$(curl -fsS --noproxy '*' -H 'Accept: text/html' "http://localhost:$port/")"
if grep -q 'id="server-host"' <<<"$served" && ! grep -q 'an old welcome page' <<<"$served"; then
  echo "ok   welcome: the page is put back at start ($layout pods)"
else
  echo "FAIL welcome: the root still serves the old page after a restart ($layout pods)"; exit 1
fi
