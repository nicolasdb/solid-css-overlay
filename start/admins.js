// Runs before the server, on every start (start/start.sh): writes the account
// admin route of account-admin/ (solid-kit ADR 012) with a fresh random token,
// and the same token in a file only the container's user can read. Stock CSS
// cannot list every account nor delete one; this route can, for whoever sends
// the token, which is whoever can run a command in this container: the
// admin TUI (admin/admin.js, `scripts/admin.sh` from the instance's checkout).
//
// Why a token and not a list of admin emails (the first draft of 7.3.0-4):
// stock CSS never verifies a login's email, so a listed address nobody had
// signed up with yet made whoever took it first an admin. Who may delete an
// account is who runs the server, and ssh already says that.
//
// A new token at every start: nothing to rotate, nothing stored in the data
// volume, nothing to put in .env. Both files live in the container's own
// filesystem and go with it.
const crypto = require("crypto");
const fs = require("fs");

const out = "config/identity/handler/account-admin.json";
const tokenFile = "config/identity/handler/account-admin.token";
const token = crypto.randomBytes(32).toString("base64url");

const config = {
  "@context": [
    "https://linkedsoftwaredependencies.org/bundles/npm/@solid/community-server/^7.0.0/components/context.jsonld",
    "https://linkedsoftwaredependencies.org/bundles/npm/@solid-css-overlay/account-admin/^1.0.0/components/context.jsonld",
  ],
  "@graph": [
    {
      comment: "Written by start/admins.js at every start. account-admin/src/AccountAdminHandler.ts says why each piece is used.",
      "@id": "urn:solid-server:overlay:AccountAdminRouter",
      "@type": "InteractionRouteHandler",
      route: {
        "@id": "urn:solid-server:overlay:AccountAdminRoute",
        "@type": "RelativePathInteractionRoute",
        base: { "@id": "urn:solid-server:default:IndexRoute" },
        relativePath: "admin/accounts/",
      },
      source: {
        "@type": "MethodFilterHandler",
        methods: ["POST"],
        source: {
          "@id": "urn:solid-server:overlay:AccountAdminHandler",
          "@type": "AccountAdminHandler",
          accountStorage: { "@id": "urn:solid-server:default:AccountStorage" },
          passwordStore: { "@id": "urn:solid-server:default:PasswordStore" },
          podStore: { "@id": "urn:solid-server:default:PodStore" },
          webIdStore: { "@id": "urn:solid-server:default:WebIdStore" },
          store: { "@id": "urn:solid-server:default:ResourceStore" },
          // The image's backend is the file one (config/*.json import
          // storage/backend/file.json); another backend names its own accessor.
          accessor: { "@id": "urn:solid-server:default:FileDataAccessor" },
          auxiliaryStrategy: { "@id": "urn:solid-server:default:AuxiliaryStrategy" },
          locker: { "@id": "urn:solid-server:default:ResourceLocker" },
          token,
        },
      },
    },
    {
      "@id": "urn:solid-server:default:InteractionRouteHandler",
      "@type": "WaterfallHandler",
      handlers: [{ "@id": "urn:solid-server:overlay:AccountAdminRouter" }],
    },
  ],
};

fs.writeFileSync(out, JSON.stringify(config, null, 2) + "\n", { mode: 0o600 });
fs.writeFileSync(tokenFile, token + "\n", { mode: 0o600 });
// writeFileSync keeps the mode of a file that already exists: set it again.
fs.chmodSync(out, 0o600);
fs.chmodSync(tokenFile, 0o600);
console.log("[solid-css-overlay] account admin: route ready, token renewed (scripts/admin.sh on the server)");
