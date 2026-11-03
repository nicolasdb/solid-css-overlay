# How-to: delete accounts on a VPS

**Deleting cannot be undone.** An account's pods and everything in them go
with it.

## Before you start

- You can ssh to the server and run `docker compose` in the instance's
  checkout, for example `/srv/<instance>/solid-css-overlay`.
- The instance runs 7.3.0-4 or later. `docker compose exec css cat
  /community-server/templates/provider.json` names the version.
- The instance mounts its own `instance.json` (for more reserved pod names)?
  Then its `import` list has this line after the email one. Without it, the
  tool answers 404:
  ```json
  "css:config/identity/handler/account-admin.json",
  ```

## Look and choose

```sh
ssh <server>
cd /srv/<instance>/solid-css-overlay
scripts/admin.sh
```

| To | Press |
|---|---|
| move | ↑ ↓ (or j k), Page Up / Page Down |
| select or unselect one | space |
| select every account shown | a |
| show only some accounts | `/`, type part of an email or pod name, Enter (empty: show all) |
| change the order | s: email, most pods first, pod name |

## Delete

1. Select the accounts. With none selected, `d` takes the one under the
   cursor.
2. Press `d`, check the list the tool shows, type the number it asks for,
   and press Enter.
3. Press `q`.

When you quit, the script also removes the connector's agents that acted for
what went (`connector agents removed: …`). If the connector does not run on
this server, the script prints the WebIDs and pods instead, so you can remove
them where it runs.

## Without the TUI

For a script, or when you already know the email:

```sh
scripts/admin.sh list
scripts/admin.sh delete gone@example.org other@example.org --yes
```

An account with no login (a sign-up left halfway) has no email. Use the
account id from `scripts/admin.sh list` instead. Stock CSS also removes those
by itself after 30 minutes.

## If something goes wrong

| You see | It means |
|---|---|
| `admin: 404 …` | the instance's own `instance.json` lacks the import line (above), or the image is older than 7.3.0-4 |
| `admin: 403 …` | the token did not match. Restart the css container: it writes a new one |
| `stopped at <email>: …` | the deletion failed partway. That account is still there; run it again |
| `the TUI needs a terminal` | run it from an ssh session, not through a pipe |
