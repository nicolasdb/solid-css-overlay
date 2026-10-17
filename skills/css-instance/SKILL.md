---
name: css-instance
description: Stand up or restyle a Community Solid Server instance from the solid-css-overlay image — pods as subdomains, the identity pages (welcome, log in, sign up, password reset, OIDC consent, account, create pod, session recovery, public .md pages) in the instance's own look and words — without forking the server. Use when starting a new CSS instance (a provider, a collective's server such as Maps of Making), restyling one, rewriting its identity-page copy, or bumping its image version. Installs instance-template/, adds a per-instance skin in overlay/, checks it with solid-kit's skin audit and a local smoke run against the image, and deploys with docker compose behind a wildcard certificate.
---

# CSS instance — a stock server, one image, one skin

A CSS instance's identity pages are where a person first meets their pod. An
instance runs the published image `ghcr.io/nicolasdb/solid-css-overlay`: stock
CSS with the generic overlay baked in (pages, the "pod" skin, a secure config,
pods as subdomains). Only a **skin** (colours, fonts, mark) and the **words**
belong to the instance, mounted from its `overlay/`. Nothing is built on the
instance's side. Why: solid-kit ADR 009.

Instance 1 is pod.nicolasdb.eu (pocpod0, folder pods, `config/suffix.json`).

## Invariants — no instance breaks these

1. **Copy only on CSS's pages.** Every id, `name`, `class` the scripts use and
   every script line stays stock. CSS's own client code drives these forms;
   change a word, never a hook. The documented exceptions are in each file's
   header (consent, create-pod, account) — add one only with the same kind of
   header.
2. **What comes from outside goes in as text.** An app's name, a client ID, a
   server error, a WebID: `textContent`, never `innerHTML` or a template
   string into markup. Stock CSS gets this wrong on consent; ours does not.
3. **Light is the default.** Dark and High contrast only behind
   `<html data-theme>`, stamped before first paint by `pod-ui.js`; no
   `prefers-color-scheme: dark`; `prefers-contrast: more` only while no
   choice is stored (solid-kit ADR 008). Same storage key as the kit.
4. **The complete slot set in every theme**, text at 4.5:1 (7:1 in High
   contrast), `--border-control` at 3:1. The audit decides, not the eye.
5. **No third-party request.** Fonts are self-hosted woff2 in the skin.
6. **A WebID is never parsed for logic.** Splitting one for display (consent)
   is fine; deriving anything from the split is not.
7. **Never edit `main.css` or `pod-ui.js` for one instance.** If an instance
   needs something they cannot do, change them in solid-css-overlay, for
   every instance, and release a new image.
8. **The base URL is chosen once.** Every WebID and every link starts with
   it, and pods are subdomains of its host. Never move an instance that has
   pods from folders to subdomains or back (config/instance.json says why).

## The method, in order

### 1. Draft the look before the code (recommended)

On a Claude Design canvas with the instance's design system: tokens sheet,
log in, consent, a states board (focus, error, disabled, loading, +30 % copy),
then the other pages, desktop and 360 px. Render the **real markup** — the
`markup/` captures of the instance's pages — so only the CSS and the words
vary. pocpod0's canvas "CSS instance — Pod" is the model. Decide the copy
there, in a "stock vs proposed" table.

### 2. Install the instance

```sh
cp -r solid-css-overlay/instance-template <instance>   # compose.yml, .env.example, overlay/
cp <instance>/.env.example <instance>/.env             # INSTANCE_NAME, CSS_BASE_URL, version
```

`CSS_BASE_URL` is a host of its own (a site on the bare domain stays there):
`https://pod.mapsofmaking.org/` gives pods `https://<name>.pod.mapsofmaking.org/`.
Then DNS (`pod` and `*.pod` to the VPS), the wildcard certificate and the
gateway vhost: solid-css-overlay README, "Install from scratch".

Start the skin from the image's `pod` skin even for a very different look: it
is complete and passes, so every step after this is a change you can audit.

```sh
docker create --name s ghcr.io/nicolasdb/solid-css-overlay:<version>
docker cp s:/community-server/templates/styles/skin.css <instance>/overlay/skin.css
docker cp s:/community-server/templates/fonts/skin <instance>/overlay/fonts; docker rm s
```

### 3. The skin

Edit `skin.css` slot by slot (names and meanings: solid-kit `src/styles/core.css`
and the design system's tokens). Replace the fonts in `fonts/` and the
`@font-face` lines; keep the three roles (`--font-heading`, `--font-body`,
`--font-mono`). Then, in solid-kit:

```sh
npm run audit -- --skin <instance>/overlay/skin.css
```

until it passes. A brand colour that fails as text (a riso red on paper) stays
for marks, borders and 24 px+ type; give text a darker sibling slot.

A paper-only skin has no dark look: keep the dark block with the Daylight
values, or remove the "Dark" button (`INSTANCE: theme switch`).

### 4. The words

The welcome page is the instance's: copy the image's
(`/community-server/templates/root/intro/base/index.html`) to
`overlay/welcome/index.html` and rewrite every `INSTANCE:` line. The header and
footer words of the other pages are generic (`main.html.ejs`); an instance that
needs its own mounts its copy, which `scripts/check-overrides.sh` will then
report as drift. Plain words, second person, sentence case, every error with a
way forward (solid-kit `docs/ux-principles.md`).

### 5. Wire it

Uncomment, in `compose.yml`, the mount of each file that exists in `overlay/`.
If the gateway serves other hosts under the same domain (`mcp.pod…`), reserve
their names: a copy of the image's `config/instance.json` in `overlay/`, a
longer `reserved` list, and its mount.

### 6. Run it locally — before any deploy

```sh
cd solid-css-overlay
IMAGE=ghcr.io/nicolasdb/solid-css-overlay:<version> test/try-local.sh 3123 <instance>/overlay
node test/smoke.mjs http://localhost:3123 /tmp/shots
```

All checks green, **then look at the screenshots** — a check passes on a page
that is still wrong. If playwright's browser is missing, set `CHROMIUM_PATH`.

### 7. Deploy and verify

Copy `compose.yml`, `.env` and `overlay/` to the VPS, `docker compose pull &&
docker compose up -d`, then `scripts/check-overrides.sh '' https://<instance>`
and the "Identity pages of a CSS instance" section of solid-kit's
`docs/manual-tests.md` — stale sign-in and a real app's consent are not
covered by the smoke run. Create one pod by hand and open
`https://<name>.<host>/`: that checks DNS, the certificate and the vhost at once.

## Updating

A new `CSS_OVERLAY_VERSION` in `.env`, `pull && up -d`, then step 7. If the
instance mounts its own copy of a generic file, diff it against the new
version's first (`scripts/check-overrides.sh` lists them).
