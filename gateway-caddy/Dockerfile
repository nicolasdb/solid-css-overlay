# Stock Caddy + the OVH DNS module, for the wildcard certificate a subdomain-pod
# instance needs (*.pod.<domain>). Let's Encrypt issues a wildcard only through
# the DNS challenge, and stock Caddy ships no DNS provider: without this
# module, Caddy cannot get the certificate at all.
#
# This file is copied into the gateway's own repo (Maps of Making: vps-infra
# gateway/), which builds it: `build:` in the gateway's compose, in place of
# `image: caddy:2-alpine`.
#
# CADDY_VERSION is the version the gateway already runs (`docker exec <caddy>
# caddy version`), never lower: swapping the image must not downgrade the
# server every other site goes through. 2.11.4 is Maps of Making's on
# 2026-10-21. A Caddy upgrade is the gateway's decision, made there, not here.
# Alpine, like the stock `caddy:2-alpine` it replaces.
# Check after a build: `caddy list-modules | grep ovh` → dns.providers.ovh.
ARG CADDY_VERSION=2.11.4
FROM caddy:${CADDY_VERSION}-builder-alpine AS build
# Behind a proxy that re-signs TLS: docker build --secret id=ca,src=<ca bundle> .
RUN --mount=type=secret,id=ca,required=false \
    if [ -f /run/secrets/ca ]; then export SSL_CERT_FILE=/run/secrets/ca; fi; \
    xcaddy build --with github.com/caddy-dns/ovh

FROM caddy:${CADDY_VERSION}-alpine
COPY --from=build /usr/bin/caddy /usr/bin/caddy
