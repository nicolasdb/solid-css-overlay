# syntax=docker/dockerfile:1
# solid-css-overlay: stock Community Solid Server + the identity-page overlay.
# Tag: <stock version>-<n> (7.2.0-1). A new stock release is a new 7.x.y-1;
# a new overlay on the same stock is -n+1. See CHANGELOG.md.
#
# Nothing in CSS is patched. The image only adds files where stock CSS already
# looks for them (templates/), one config, and one component (PodNameGuard).
ARG CSS_VERSION=7.2.0

# PodNameGuard, built against the same CSS release it will run in (node 18,
# like the CSS image).
FROM node:18-slim AS guard
WORKDIR /guard
COPY pod-name-guard/package.json pod-name-guard/package-lock.json ./
# The optional secret is a CA bundle for a network that re-signs TLS (a proxy):
#   docker build --secret id=npm_ca,src=<ca.crt> .
# Absent everywhere else, and never part of an image layer.
RUN --mount=type=secret,id=npm_ca,required=false \
    if [ -f /run/secrets/npm_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/npm_ca; fi; \
    npm ci --no-audit --no-fund
COPY pod-name-guard/tsconfig.json ./
COPY pod-name-guard/src ./src
COPY pod-name-guard/test ./test
RUN npm test

FROM solidproject/community-server:${CSS_VERSION}
WORKDIR /community-server

# The guard goes where Components.js discovers modules (node_modules under the
# main module path). At runtime it requires @solid/community-server, which in
# this image is /community-server itself and not a package under node_modules,
# so NODE_PATH points at a folder holding just that name. Not a symlink inside
# node_modules: discovery would then find the CSS module twice.
COPY --from=guard /guard/package.json node_modules/@solid-css-overlay/pod-name-guard/package.json
COPY --from=guard /guard/dist node_modules/@solid-css-overlay/pod-name-guard/dist
RUN mkdir -p /opt/css-resolve/@solid && ln -s /community-server /opt/css-resolve/@solid/community-server
ENV NODE_PATH=/opt/css-resolve

# The overlay, at the paths the stock templates live at. Everything under
# templates/ is served by stock /.well-known/css/{styles,scripts,fonts}/.
COPY overlay/main.html.ejs templates/main.html.ejs
COPY overlay/main.css templates/styles/main.css
COPY overlay/pod-ui.js overlay/pod-layout.js templates/scripts/
COPY overlay/templates/identity/ templates/identity/
COPY overlay/doc-view/doc-view.js overlay/doc-view/doc-view.css templates/doc-view/
# The welcome page replaces the stock intro page, which initialize-intro.json
# writes into the root container on FIRST start only: on an existing data
# volume, a new welcome page has to be copied in (README, "The welcome page").
COPY overlay/welcome/index.html templates/root/intro/base/index.html
# The default skin. An instance mounts its own skin.css and fonts over these.
COPY skins/pod/skin.css templates/styles/skin.css
COPY skins/pod/fonts/ templates/fonts/skin/

COPY config/ /config/
ENV CSS_CONFIG=/config/instance.json
# CSS_BASE_URL is the instance's (compose .env); CSS_ROOT_FILE_PATH=/data is stock.
