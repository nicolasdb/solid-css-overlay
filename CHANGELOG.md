# Changelog

Versions are `<stock CSS version>-<n>`: a new stock release starts at `-1`, a
new overlay on the same stock adds one. A tag `v<version>` publishes both
images (`.github/workflows/build.yml`).

## 7.2.0-1 — 2026-10-20

First release: the overlay moves here from solid-kit `templates/css-instance/`
(at 2772945) and the MCP connector from pocpod0 (at 356647d).

- **Pods are subdomains** by default (`config/instance.json`). `config/suffix.json`
  keeps folder pods, for instances that already have them.
- **PodNameGuard**: a pod name must make a valid hostname and not be reserved;
  checked by the server (400) and, first, by the create-pod form.
- **Secure config**: stock DPoP/Bearer authentication only.
- **The welcome page** is written into the root on first start
  (`initialize-intro.json`), not served by `static-root.json`, which answered
  every subdomain pod's root with it.
- **Pages**: the create-pod address preview and the consent page's WebID
  display follow the pod layout (`overlay/pod-layout.js`).
- **The editorial register** (Solid Kit design system, solid-kit `design/`):
  page titles in the display serif, Newsreader 400 (`--font-display`, a new
  skin slot; a skin without it keeps its heading face), the eyebrow on the
  welcome page, `.hint` for help text (stock's `.checkbox-explanation` too).
  The welcome page's three ideas are topped by a hairline and numbered, as
  the kit's `.how-steps`, instead of ruled on the left.
- **The theme button** (solid-kit ADR 008, amended): one icon button cycling
  Light, Dark, Same as this device, in place of the three-word switch. Light
  is stamped in the HTML and clears the stored choice; `pod-ui.js` resolves
  "same as this device" (High contrast first, then dark) and follows it. The
  skin's `prefers-contrast` copy of High contrast is gone. Assets at `?v=2`.
- **Gateways**: `instance-template/Caddyfile.tmpl` beside the nginx template,
  and `gateway-caddy/` (Caddy + `caddy-dns/ovh`) for the wildcard certificate.
  The Caddy template also routes the connector (`mcp.<server host>`, and
  `/onboard/` on the server's host only); the nginx one does not yet.
- **mcp-connector**: the pod a URL belongs to is discovered (`src/podRoot.js`,
  solid-kit's rule), no longer read off the URL path; public address from
  `MCP_PUBLIC_BASE`.
