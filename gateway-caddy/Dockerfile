# Stock Caddy + the OVH DNS module, for the wildcard certificate a subdomain-pod
# instance needs (*.pod.<domain>). Let's Encrypt issues a wildcard only through
# the DNS challenge, and stock Caddy ships no DNS provider: without this
# module, Caddy cannot get the certificate at all.
#
# Build on the VPS, or wherever the gateway's compose builds from:
#   docker compose build caddy        (compose: `build: ./gateway-caddy`)
# Bump both tags together; `caddy list-modules | grep ovh` checks the result.
ARG CADDY_VERSION=2.10.2
FROM caddy:${CADDY_VERSION}-builder AS build
# Behind a proxy that re-signs TLS: docker build --secret id=ca,src=<ca bundle> .
RUN --mount=type=secret,id=ca,required=false \
    if [ -f /run/secrets/ca ]; then export SSL_CERT_FILE=/run/secrets/ca; fi; \
    xcaddy build --with github.com/caddy-dns/ovh

FROM caddy:${CADDY_VERSION}
COPY --from=build /usr/bin/caddy /usr/bin/caddy
