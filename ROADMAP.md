# Roadmap

Features every instance will get, not built yet. Each one says why it is
needed and the shape agreed so far. What CSS itself does and does not do
today: README, "Accounts and pods".

## Account and pod deletion, for admins (planned for 7.2.0-3)

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
