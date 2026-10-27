# pods/ — the pods' look and words

A folder of a vertical's **design-system repo** (solid-kit ADR 011), started
from solid-css-overlay's `overlay-template/`. Maps of Making's is
`mapsofmaking/design-system`, folder `pods/`, checked out on the VPS at
`/srv/mom-design-system`, beside the instance's checkout `/srv/mom-pods`.

The design-system repo, as ADR 011 lays it out:

| Path | What | Read by |
|---|---|---|
| `tokens/` | the vertical's tokens, fonts and logos, in its own names | its own apps (the map, the landing) |
| `skins/kit/skin.css` | those tokens mapped onto the kit's slots: the **complete** slot set, in every theme it offers; its CI runs solid-kit's `npm run audit -- --skin skins/kit/skin.css` | every horizontal image: the pods (this override), the backoffice |
| `skins/kit/fonts/` | the skin's font files | the same |
| `pods/` | this folder: the pods' own words, and the override that mounts all of it | solid-css-overlay |
| `backoffice/` | the backoffice's own values | solid-backoffice |

## What goes in `pods/`

Empty but for `compose.override.yml` is fine: the image serves the generic
pages, with the kit skin once `skins/kit/skin.css` exists.

| File | Replaces | Notes |
|---|---|---|
| `welcome/index.html` | the welcome page | the server's home page: where the vertical lists its family of apps (the commented example in the image's page). Put at the root at every start. |
| `pod/README.md.hbs` | the README every new pod starts with | the image's (`overlay/templates/pod/base/README$.md.hbs`) is the one to start from; same Handlebars variables. Pods made before keep theirs. |
| `instance.json` | `config/instance.json` | only to reserve more pod names (every service host the gateway serves under this domain) |

The skin's fonts are served by this image from the mounted `skins/kit/fonts/`,
at `/.well-known/css/fonts/skin/<file>`. Font URLs in a skin shared with the
backoffice must resolve in both images: ADR 011 leaves that open.

Any other generic file can be mounted the same way, at the path the image's
Dockerfile copies it to. That is allowed drift: `scripts/check-overrides.sh`
in solid-css-overlay tells you what diverges from the version you pin.

## On the VPS

```sh
git clone <the design-system repo> /srv/<vertical>-design-system
```

In `/srv/<instance>/instance-template/.env`:

```sh
COMPOSE_FILE=compose.yml:/srv/<vertical>-design-system/pods/compose.override.yml
DESIGN_SYSTEM=/srv/<vertical>-design-system
```

Then, in `/srv/<instance>/instance-template/`: `docker compose up -d`.

**A change** of look is a commit in the design-system repo, then `git pull` in
`/srv/<vertical>-design-system` and, in the instance's folder,
`docker compose up -d --force-recreate css`. No image is rebuilt, and nothing
is edited on the VPS. A plain `up -d` is not enough: Compose sees no change and
keeps the container, and a file mounted on its own (`skin.css`) stays the copy
from before the pull, because git replaces the file rather than rewriting it.

**A new solid-css-overlay version**: diff its `overlay-template/` against the
previous one, and any generic file copied here against the image's new copy.
