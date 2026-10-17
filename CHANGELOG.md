# Changelog

Versions are `<stock CSS version>-<n>`: a new stock release starts at `-1`, a
new overlay on the same stock adds one. A tag `v<version>` publishes both
images (`.github/workflows/build.yml`).

## 7.2.0-1 — unreleased

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
- **mcp-connector**: the pod a URL belongs to is discovered (`src/podRoot.js`,
  solid-kit's rule), no longer read off the URL path; public address from
  `MCP_PUBLIC_BASE`.
