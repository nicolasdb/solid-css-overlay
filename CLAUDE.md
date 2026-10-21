# CLAUDE.md

Guidance for Claude Code working in this repository. The map of how this repo
relates to solid-kit, pocpod0 and the instances is solid-kit's `docs/atlas.md`;
why the image exists is solid-kit's ADR 009. This file owns facts about the
image only.

## What this repo is

The product: stock Community Solid Server + the identity-page overlay + the MCP
connector, as two published images. An instance (Maps of Making, pod.nicolasdb.eu)
pins a version and mounts its own `overlay/`. **A feature every instance will
get is built here**, not in an instance.

CSS is never patched. The image adds files where stock CSS looks for them
(`templates/`), one config, and one component (`pod-name-guard/`). Adding a
second component is a decision to write down (an ADR in solid-kit), not a
commit: every component is code to carry across every CSS release.

A collective's procedures and the `collectif` skill live beside the
connector (`mcp-connector/procedures/`, `mcp-connector/skills/collectif/`):
a procedure and the tools it calls change together. The protocol they
implement is solid-kit's ADR 006.

The comments explaining *what went wrong before* are the most valuable content
in these files. Keep them when changing the code around them.

Planned features (account deletion, the right to erasure, ...) and their
agreed shape: `ROADMAP.md`. What CSS itself does and does not do with
accounts: README, "Accounts and pods".

## Commands

See README, "Working on the image". The gate before a tag: both smoke runs
green and their screenshots looked at, `pod-name-guard` and `mcp-connector`
tests, `scripts/check-overrides.sh`.

## Rules that are easy to break

- **Subdomains and folders are not interchangeable** on an instance with pods
  (`config/instance.json`, first comment). Never "migrate" one.
- **No `static-root.json`** with subdomain pods: static assets match on the
  path, not the host, so `/` would answer on every pod. The same holds for any
  new `StaticAssetEntry`: it hides a pod resource of that path on every pod.
- **The pages never assume a layout.** A pod's address comes from the server's
  answer or from `window.podLayout`; a WebID is split for display only.
- **The connector never derives a pod root from a URL's shape**: `src/podRoot.js`.
- The create-pod form and `PodNameGuard` say the same thing in the same words;
  change both.
- `overlay/doc-view/` is generated in solid-kit (`scripts/export-doc-view.sh`);
  never edit it here.
- Changing a file in `overlay/` that replaces a stock template: keep every id,
  `name` and script hook stock (each file's header lists the exceptions), then
  run `scripts/check-overrides.sh`.
