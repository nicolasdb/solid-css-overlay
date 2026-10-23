# Roadmap

Features every instance will get, not built yet. Each one says why it is
needed and the shape agreed so far. What CSS itself does and does not do
today: README, "Accounts and pods".

## Account and pod deletion, for admins (next)

**Why.** CSS 7.2 deletes no account and no pod. Test rounds leave accounts
that cannot be removed, and a pod name once taken stays taken. pocpod0
collected many throwaway accounts this way. Until this exists, a test
instance is cleaned by a full reset (README), which only works while no real
account lives there.

**Shape.**
- **Inside CSS, as a component on an admin route under `/.account/`.**
  - It uses CSS's own stores and locks.
  - It deletes the pods' resources depth first.
  - Then it calls `delete('account', id)`, which removes the account's
    logins, pods, WebID links and client credentials in one go.
  - Deleting files from the volume from outside is not an option: that
    storage format is CSS's private business and can change at any release,
    and a script would race the server's locks.
- **Admins are login emails listed in the instance's config.**
- **Front doors**, all calling that one route:
  1. `scripts/admin.sh` (list, delete-account), with a `make` target on the
     VPS;
  2. an **account-manager page** in the overlay: accounts and their pods,
     each with a delete button.
- **Outside CSS**: the connector's `identities.json` entries for a deleted
  WebID are removed as well.
- **It is the image's second component**, so a solid-kit ADR comes first
  (CLAUDE.md): every component is code to carry across every CSS release.

## Self-service erasure: the right to erasure

**Why.** A person must be able to have their data erased (GDPR art. 17). On a
CSS instance today, nobody can do it, not even an admin.

**Shape.** "Delete my account" on the person's own account page, on the same
route as above, limited to their own account. The page says plainly what goes:
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
