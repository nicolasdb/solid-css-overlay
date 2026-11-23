#!/usr/bin/env bash
# The root container is public read only (overlay/root/.acl): the public may
# read it, and may not write, append or change its rules. Stock CSS gave the
# public all four on the root, and scanners filled two live roots with probe
# files (2026-11-23). Run on a fresh server, after test/try-local.sh <port>.
#
#   test/root-acl.sh <port>
set -euo pipefail
port="$1"; url="http://localhost:$port/"
c() { curl -s --noproxy '*' "$@"; }

wac="$(c -I "$url" | tr -d '\r' | grep -i '^wac-allow:' || true)"
if grep -qi 'public="read"' <<<"$wac"; then echo "ok   root: $wac"
else echo "FAIL root: public is not read only ($wac)"; exit 1; fi

fail=0
put="$(c -o /dev/null -w '%{http_code}' -X PUT -H 'content-type: text/plain' --data 'x' "${url}root-acl-probe.txt")"
post="$(c -o /dev/null -w '%{http_code}' -X POST -H 'content-type: text/plain' --data 'x' "$url")"
acl="$(c -o /dev/null -w '%{http_code}' "${url}.acl")"
for r in "PUT /root-acl-probe.txt:$put" "POST /:$post" "GET /.acl:$acl"; do
  if [ "${r##*:}" = 401 ]; then echo "ok   anonymous ${r%:*} -> 401"
  else echo "FAIL anonymous ${r%:*} -> ${r##*:}, expected 401"; fail=1; fi
done
exit "$fail"
