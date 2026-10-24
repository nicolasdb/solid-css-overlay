# Brief for solid-css-overlay: the MoM install, steps 6–7

From the local session that installed Maps of Making (2026-10-23). The
instance runs 7.2.0-4 at `/srv/mom-pods`; steps 1–6 done; step 7 paused.
The design decision behind items 4–6 is a **proposed** ADR, to deliberate
first: solid-kit `docs/adr/010-providers-say-what-they-offer.md` (branch
`adr-010-provider-descriptor`, https://github.com/nicolasdb/solid-kit/pull/11).

## Bugs

1. **The connector refuses to boot with no identities.** With
   `identities.json` = `{}` (as README step 4 creates it):
   `fatal: identities.json contains no identities. Add at least one slug entry`,
   and with `restart: unless-stopped` it loops. So `/onboard/mint` can never
   make the first agent: the UI route needs a manual first agent. Fix: boot
   empty, serve `healthz` and `/onboard/`, refuse `/mcp/<slug>` with 404.
2. **"Updating to 7.2.0-4" runs a plain `docker compose up -d`**, which
   starts `mcp-connector` too (and hits bug 1 on an instance without agents).
   Until 1 is fixed: `up -d css`.
3. **`scripts/check-overrides.sh`**:
   - line 58, `curl … | grep -q "Story 7.2"` under `set -o pipefail`: grep -q
     exits on the first match, curl gets SIGPIPE (`curl: (23)`), and the
     check reports `main.css is stock` while it is ours (checked by hand).
     Use `grep -q … <<<"$(curl -fsS …)"`, as lines 56–57 do.
   - the default stock image `solidproject/community-server:7.2.0` is a short
     name: podman refuses it without a TTY. Use `docker.io/…`.
   - a FAIL in part 1 does not stop part 2; the exit code is only right at
     the end.
4. **Create-pod preview**: with the name `open_fab`, the line under the field
   shows `https://open_fab.pod.mapsofmaking.org/` while the error says the
   name is invalid. Cosmetic.

## Design (ADR 010, accepted)

5. **Serve `/.well-known/css/provider.json`**: overlay version, layout, and
   the capabilities with their paths (`account`, `onboard`, `connector` with
   its public URL from `MCP_PUBLIC_BASE`). Static, versioned, fields only
   added. `check-overrides.sh` checks it is served. Generated at start from
   env (the connector URL is per instance) or a template in the image: your
   call, the checkout stays unedited.
6. **One model of an agent** (ADR 010, point 7): a WebID in its owner's pod
   (`profile/<name>#me`), linked to its owner's account, the owner a person
   or a collective; no account or pod of its own. README step 7 and the
   handoff's step 7 change to it (the backoffice makes it; by hand, it is the
   owner's account that links the WebID and makes the client credentials).
7. **Consent names the app's origin** (ADR 010, point 6). CSS 7.2's
   `ClientInfoHandler` sends no redirect URIs (checked on the 7.2.0-5 image),
   so: when `client_id` is an `https:` URL (a Client ID Document, which CSS
   fetches and redirects only to its `redirect_uris`), show its host large,
   as the thing to check, above `client_name`; otherwise say the app did not
   say where it is served from, and show `client_name` as a claim. The
   header's provider host in a readable size. No CSS component.
8. **Handoff**: `ONBOARD_CORS_ORIGINS=https://backoffice.mapsofmaking.org`
   once that deploy exists; step 7 waits for it and for 1.
9. **An instance's look comes from its vertical's design-system repo**
   (ADR 011). Maps of Making's is `mapsofmaking/design-system` (it was the
   empty `mom-pods-overlay`), folder `pods/`, checked out at
   `/srv/mom-design-system`. `overlay-template/README.md`, README step 8 and
   the handoff (lines naming `mom-pods-overlay`) describe a folder of that
   repo (`COMPOSE_FILE=compose.yml:/srv/<vertical>-design-system/pods/compose.override.yml`),
   with `skin.css` from its `skins/kit/`, shared with the backoffice.
