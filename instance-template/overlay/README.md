# overlay/ — this instance's own look and words

Empty is fine: the image serves the generic overlay with its "pod" skin.
Whatever is put here is mounted over the image's copy (uncomment the line in
`compose.yml`), and `docker compose up -d` applies it. Nothing is built.

| File | Replaces | Notes |
|---|---|---|
| `skin.css` | the "pod" skin | define the **complete** slot set, in every theme it offers; check with solid-kit's `npm run audit -- --skin overlay/skin.css` |
| `fonts/*.woff2` | the skin's fonts | self-hosted, referenced from `skin.css` as `/.well-known/css/fonts/skin/<file>` |
| `welcome/index.html` | the welcome page | written into the data **once, on first start**; afterwards see the image README, "The welcome page" |
| `instance.json` | `config/instance.json` | only to reserve more pod names (every service host the gateway serves under this domain) |

Any other generic file can be mounted the same way, at the path the image's
Dockerfile copies it to. That is allowed drift: `scripts/check-overrides.sh`
in solid-css-overlay tells you what diverges from the version you pin.
