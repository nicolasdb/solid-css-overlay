# <instance>-overlay

The look and words of one Community Solid Server instance that runs
[solid-css-overlay](https://github.com/nicolasdb/solid-css-overlay). Started
from that repo's `overlay-template/`.

| Path | What |
|---|---|
| `overlay/` | the files (its README lists them, and what each replaces) |
| `compose.override.yml` | mounts them over the image's copies |

## On the VPS

One checkout per function, beside the instance's checkout of
solid-css-overlay (Maps of Making: `/srv/mom-pods` and `/srv/mom-pods-overlay`):

```sh
git clone <this repo> /srv/<instance>-overlay
```

In `/srv/<instance>/instance-template/.env`:

```sh
COMPOSE_FILE=compose.yml:/srv/<instance>-overlay/compose.override.yml
OVERLAY_DIR=/srv/<instance>-overlay/overlay
```

Then, in `/srv/<instance>/instance-template/`: `docker compose up -d`.

**A change** is a commit here, then `git pull` in `/srv/<instance>-overlay`
and `docker compose up -d` in the instance's folder. Nothing is built, and
nothing is edited on the VPS.

**A new solid-css-overlay version**: diff its `overlay-template/` against the
previous one, and any generic file copied here against the image's new copy.
