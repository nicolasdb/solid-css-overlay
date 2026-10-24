#!/usr/bin/env bash
# Are our Community Solid Server customisations still applied, and still valid?
#
# The overlay is copied over stock templates when the image is built
# (Dockerfile). An override is a whole-file copy of a stock template, so if a
# new CSS release changes that template (new EJS variable, renamed form id),
# ours keeps shipping the old one, silently. Two checks, run before bumping
# CSS_VERSION and against an instance after a deploy:
#
#   1. upstream  — hash the stock templates inside IMAGE (the STOCK image, not
#                  ours) against upstream-baseline.sha256. A mismatch means
#                  re-diff upstream vs overlay/ and merge before releasing.
#   2. served    — against a running server at URL, that what it serves is ours.
#
# Usage:
#   scripts/check-overrides.sh [STOCK_IMAGE] [URL] [MD_URL]
#   scripts/check-overrides.sh --rebaseline [STOCK_IMAGE]   # after merging
# STOCK_IMAGE defaults to the CSS_VERSION the Dockerfile builds from.
# Runs locally (podman) or on the VPS (docker): CONTAINER_CLI overrides.
set -uo pipefail
cd "$(dirname "$0")/.."

CLI="${CONTAINER_CLI:-$(command -v docker || echo podman)}"
[ -f /run/.containerenv ] && [ -z "${CONTAINER_CLI:-}" ] && CLI="distrobox-host-exec podman"
BASELINE=upstream-baseline.sha256
# Fully qualified: podman refuses a short name without a TTY to ask on.
IMAGE_DEFAULT="docker.io/solidproject/community-server:$(sed -n 's/^ARG CSS_VERSION=//p' Dockerfile | head -1)"

stock_hashes() { # image -> "hash  path" lines for every overridden template
  local paths; paths="$(grep -v '^#' "$BASELINE" | awk '{print $2}' | sed 's/\$/\\$/g' | tr '\n' ' ')"
  $CLI run --rm --entrypoint sh "$1" -c "cd /community-server/templates && sha256sum $paths"
}

if [ "${1:-}" = "--rebaseline" ]; then
  image="${2:-$IMAGE_DEFAULT}"
  { grep '^#' "$BASELINE" | grep -v '^# image:'; echo "# image: $image"; stock_hashes "$image"; } > "$BASELINE.new" \
    && mv "$BASELINE.new" "$BASELINE" && echo "rebaselined against $image"
  exit
fi

image="${1:-$IMAGE_DEFAULT}"; url="${2:-}"; md_url="${3:-}"
# Part 2 runs even when part 1 fails, on purpose: one run reports everything.
# The last line names the parts that failed; the exit code is non-zero if any did.
fail=0; failed_parts=""; part=1
ok()  { echo "  ok    $*"; }
bad() { echo "  FAIL  $*"; fail=1; case " $failed_parts " in *" $part "*) ;; *) failed_parts="$failed_parts $part";; esac; }

echo "1. upstream templates in $image vs $BASELINE"
actual="$(stock_hashes "$image")" || { bad "could not read templates from $image"; exit 1; }
while read -r hash path; do
  if grep -qF "$hash  $path" <<<"$actual"; then ok "$path unchanged upstream"
  else bad "$path CHANGED upstream: diff it against overlay/, merge, then --rebaseline"; fi
done < <(grep -v '^#' "$BASELINE")

if [ -n "$url" ]; then
  url="${url%/}"
  part=2; echo "2. served by $url"
  page="$(curl -fsS -H "Accept: text/html" "$url/.account/login/password/")" || bad "login page unreachable"
  grep -q "Stale-sign-in self-repair" <<<"$page" && ok "main.html.ejs is ours" || bad "main.html.ejs is stock"
  grep -q "doc-view.js" <<<"$page" && ok "template loads doc-view.js" || bad "template does not load doc-view.js"
  # Never `curl | grep -q` here: under pipefail, grep -q exits at the first
  # match, curl dies of SIGPIPE (exit 23), and a stylesheet that IS ours was
  # reported stock (Maps of Making install, 2026-10-23).
  grep -q "Story 7.2" <<<"$(curl -fsS "$url/.well-known/css/styles/main.css")" && ok "main.css is ours" || bad "main.css is stock"
  # doc-view.* only if the instance serves the solid-kit document page (config.json).
  for a in .well-known/css/styles/skin.css .well-known/css/scripts/pod-ui.js .well-known/css/scripts/pod-layout.js doc-view.css doc-view.js; do
    code="$(curl -s -o /dev/null -w '%{http_code}' "$url/$a")"
    [ "$code" = 200 ] && ok "/$a served" || bad "/$a -> $code (not in the image, or a mount hides it)"
  done
  # What this instance offers (solid-kit ADR 010): a public contract apps read.
  desc="$(curl -fsS "$url/.well-known/css/provider.json")" || desc=""
  if [ -z "$desc" ]; then bad "/.well-known/css/provider.json not served"
  elif ! layout="$(node -e 'const d = JSON.parse(require("fs").readFileSync(0, "utf8")); if (d.software !== "solid-css-overlay" || !d.capabilities || !d.capabilities.account) process.exit(1); process.stdout.write(d.layout)' <<<"$desc" 2>/dev/null)"; then
    bad "provider.json is not a solid-css-overlay descriptor"
  else
    ok "provider.json served ($layout pods, offers: $(node -e 'process.stdout.write(Object.keys(JSON.parse(require("fs").readFileSync(0, "utf8")).capabilities).join(", "))' <<<"$desc"))"
    grep -q "podLayout = \"$layout\"" <<<"$(curl -fsS "$url/.well-known/css/scripts/pod-layout.js")" \
      && ok "pod-layout.js says $layout too" || bad "pod-layout.js disagrees with provider.json ($layout)"
  fi
  if [ -n "$md_url" ]; then
    curl -fsS -H 'Accept: text/html' "$md_url" | grep -q "doc-view.js" && ok ".md page carries doc-view" || bad ".md page lacks doc-view"
  fi
fi

[ "$fail" = 0 ] && echo "all checks passed" || echo "CHECKS FAILED in part(s):$failed_parts"
exit "$fail"
