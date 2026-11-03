// Runs before the server, on every start (start/start.sh): writes the admin
// route of account-admin/ (solid-kit ADR 012) with this instance's admins.
// Stock CSS cannot delete an account or a pod; this route can, for the login
// emails listed in ADMIN_EMAILS (comma-separated, from the instance's .env).
// Written here rather than in config/ for the reason start/email.js gives: an
// instance never edits the config, so what differs per instance comes from
// its environment at start.
//
// Stock CSS does not verify the email of a password login. An address listed
// here that is not yet a login on this server belongs to whoever signs up
// with it first, and makes them admin: list only addresses already in use
// (.env.example says so to the instance).
//
// ADMIN_EMAILS empty or unset: the route is still there and refuses everyone
// (403). Unlike a broken SMTP setting, that does not stop the start: no admin
// is the safe default, and an instance with no admin today is a normal one.
//
// The route: POST /.account/admin/delete-account/ { "email": "..." }, signed
// in to the account API. scripts/admin.sh is its front door.
const fs = require("fs");

const out = "config/identity/handler/account-admin.json";
const admins = (process.env.ADMIN_EMAILS || "")
  .split(",")
  .map((email) => email.trim().toLowerCase())
  .filter(Boolean);

const config = {
  "@context": [
    "https://linkedsoftwaredependencies.org/bundles/npm/@solid/community-server/^7.0.0/components/context.jsonld",
    "https://linkedsoftwaredependencies.org/bundles/npm/@solid-css-overlay/account-admin/^1.0.0/components/context.jsonld",
  ],
  "@graph": [
    {
      comment: "Written by start/admins.js at every start. account-admin/src/AdminDeleteAccountHandler.ts says why each piece is used.",
      "@id": "urn:solid-server:overlay:AdminDeleteAccountRouter",
      "@type": "InteractionRouteHandler",
      route: {
        "@id": "urn:solid-server:overlay:AdminDeleteAccountRoute",
        "@type": "RelativePathInteractionRoute",
        base: { "@id": "urn:solid-server:default:IndexRoute" },
        relativePath: "admin/delete-account/",
      },
      source: {
        "@type": "MethodFilterHandler",
        methods: ["POST"],
        source: {
          "@id": "urn:solid-server:overlay:AdminDeleteAccountHandler",
          "@type": "AdminDeleteAccountHandler",
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
          admins,
        },
      },
    },
    {
      "@id": "urn:solid-server:default:InteractionRouteHandler",
      "@type": "WaterfallHandler",
      handlers: [{ "@id": "urn:solid-server:overlay:AdminDeleteAccountRouter" }],
    },
  ],
};

fs.writeFileSync(out, JSON.stringify(config, null, 2) + "\n", { mode: 0o600 });
console.log(
  admins.length
    ? `[solid-css-overlay] admins: ${admins.length} (account deletion open to them)`
    : "[solid-css-overlay] admins: none (ADMIN_EMAILS unset), account deletion refused to everyone"
);
