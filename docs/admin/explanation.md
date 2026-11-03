# Explanation: why the account admin works this way

## The problem

Community Solid Server 7.3 never deletes an account or a pod. Its account API
removes a login (never the last one), a WebID link, client credentials and a
pod owner, and nothing more. So:

- **a pod name, once taken, stays taken.** Every test round burned names, and
  pocpod0 collected many throwaway accounts.
- **a server could only be cleaned by wiping it** (`docker compose down -v`),
  which stops being possible the day one real person has an account there.
- **nobody could honour the right to erasure** (GDPR art. 17), not even an
  admin.

We checked upstream before building (2026-11-03): nothing in CSS up to 7.3.0
or in 8.0.0-alpha.3, nothing planned that we could find.

## Why inside CSS, and not a script on the data folder

The data folder's layout is CSS's own business: it can change at any release.
A script deleting files there would also race the server, which may be
writing to the same pod at that moment. So the deletion runs inside CSS,
through its own resource store and locks (`account-admin/`). That is the
image's second piece of code inside CSS (ADR 009 allowed one). Every CSS
upgrade checks it, and the smoke run is what tells.

## Why the pod root is the odd one out

The resource store deletes everything inside a pod, but it refuses to delete
the pod itself. The Solid protocol forbids deleting a storage's root container
(§5.4), and every pod root is one. The root cannot simply stay either: CSS
refuses to create a pod while anything sits at its address, so the name would
remain taken.

So the contents go through the store, as a DELETE request would (locks,
`.acl` files, notifications). The root alone goes one level lower, through
the data accessor, while holding the same write lock the store would take.
The account record is deleted last: if anything fails before that, the
account is still there, and running the deletion again finishes it.

## Why the terminal, and no admin emails

A web page needs some way to tell an admin apart from anyone else. The first
draft listed admin login emails, but CSS never checks that an email belongs to
whoever signs up with it. An address on the list that nobody had used yet
would have made whoever signed up with it first an admin.

The people who run the server already have a stronger proof: ssh, and Docker
on that machine. So the permission is being on the server. At every start the
container writes a fresh random token into a file only it can read; the tool
runs inside the container and reads it. Nothing goes into `.env`, there is
nothing to rotate, and a guessed token is refused (and, with the gateway
templates, never reaches CSS).

That means no browser page for admins. If one is ever wanted, it needs its own
answer to "who is this?", and ADR 012 is the place to decide it.

## Why the connector clean-up is in the script

The MCP connector keeps its agents' credentials in `identities.json`, outside
CSS and outside the css container. An agent acting for a deleted account can
no longer do anything, but its entry would sit there. `scripts/admin.sh`
removes those entries after the tool exits, through the connector's own
writer, so the file stays valid for the connector's next start.

## What comes next

"Delete my account" for the person themself, the right to erasure, uses the
same deletion with a different permission: their own sign-in, and their
passphrase asked again. Where that button lives (the account page or
solid-backoffice) is still open in ADR 012. The roadmap tracks it.
