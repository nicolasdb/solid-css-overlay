# Roadmap

Features every instance will get, not built yet. Each one says why it is
needed and the shape agreed so far. What CSS itself does and does not do
today: README, "Accounts and pods".

## Account and pod deletion, for admins

**Slice 1 done (7.3.0-4, solid-kit ADR 012):** `account-admin/`, route
`POST /.account/admin/delete-account/`, admins from `ADMIN_EMAILS`
(`start/admins.js`), front door `scripts/admin.sh delete-account`, which
also drops the connector's agents for that account. The smoke run deletes an
account with a pod and takes the same name again, on both layouts.

What was learnt building it: the store refuses to delete a pod root (a root
storage, Solid §5.4) and CSS refuses to create a pod while anything is at its
base, so the root goes through the data accessor under the write lock
(`AdminDeleteAccountHandler.ts`, header). One more CSS internal to check at
each bump.

**Next, slice 2: see and choose.**
- `scripts/admin.sh list`: accounts, their logins and pods. Needs the account
  storage's `entries('account')`; the stores have no "list all".
- An **account-manager page** in the overlay for admins: accounts and their
  pods, a delete button each, calling the same route.
- A `make` target on the VPS (vps-infra, not this repo: an instance's
  checkout is never edited).

## Self-service erasure: the right to erasure

**Why.** A person must be able to have their data erased (GDPR art. 17). On a
CSS instance today, nobody can do it, not even an admin.

**Shape.** "Delete my account" on the person's own account page, on the same
handler as above, limited to their own account (the admin route refuses an
admin's own account on purpose: that is this door). Where the button lives,
the overlay or solid-backoffice, is ADR 012's open question. The page says plainly what goes:
- their pods and everything in them;
- their WebID;
- the agents' access.

It asks for the password again before deleting.

## Smaller

- **The connector's routes in the nginx template**: `mcp.<host>`, and
  `/onboard/` on the server's host only. `Caddyfile.tmpl` has them.
- **Backups of the `css-data` volume**: every account and pod lives there. An
  instance has none until someone sets them up.

## Next stock CSS

Checked 2026-10-23 by building the overlay on stock's unreleased images
(`stock-watch.yml`, job `ahead`, now weekly). Nothing to do before a release;
this is what that release will ask.

**7.3** (CSS main, Docker `edge`; its package still says 7.2.0). The image
builds and both smoke runs pass, but two stock pages the overlay replaces
changed, and both changes are a feature the overlay would hide:
- `identity/oidc/consent.html.ejs` and `identity/account/resource.html.ejs`
  gain a **"recover WebID"** link, to the new `recoverWebId` account control:
  an account restores a WebID profile in one of its pods that is missing,
  private or has a broken authorization (the server backs it up first). On
  consent: "If an application cannot read or use a WebID hosted in one of your
  pods, do not continue here: recover it first". Both pages show the link
  only when `controls.html.account.recoverWebId` exists, so the merged
  templates also run on 7.2.
- A new opt-in config, `util/resource-locker/file-capped.json`, caps file
  locks at one hour. The overlay uses the uncapped file locker; worth taking
  if stale locks show up.

So `7.3.0-1` = merge both templates (the link in the overlay's words), decide
on the capped locker, `--rebaseline`.

**8.0** (alpha.3, Docker `next`, Node 22; no release since March 2026). The
overlay does **not start** on it: `PodNameGuard.jsonld` refers to the
Components.js context of `@solid/community-server` `^7.0.0`. What an 8.0
image will need, no work before a release candidate:
- `pod-name-guard`: depend on `^8`, rebuild (its stage already uses the stock
  image's Node); check `IdentifierGenerator` and `BadRequestHttpError` are
  still exported;
- `config/instance.json`: the `^8.0.0` context, and the authorization imports,
  which 8.0 reorganises around `@solidlab/policy-engine`;
- every replaced template, against 8.0's (its alpha's create-pod still lacks
  7.2's "link storage" option, so the alphas predate 7.2 and will move again).
