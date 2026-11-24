# How-to: give a collective a WebID on its own domain, and a pod

The path OpenFab took on pod.syntonie.be (2026-11-24), in the order that
worked. The result: the collective signs in as
`https://id.<domain>/profile/card#me`, a WebID it owns, and its data sits in
a pod on this server. Why it is built this way: [Explanation](explanation.md).

Examples below use OpenFab: domain `openfab.be`, server `pod.syntonie.be`,
pod `openfab`. Replace them with yours.

## Before you start

- **The server runs 7.3.0-8 or later**, with a backoffice (`BACKOFFICE_URL`
  in its `.env`, so the welcome page says "Start here").
- **A role email for the collective**, for example `contact@openfab.be`,
  never a person's: the account follows the role when the people change.
- **The profile is served from the collective's domain.** A static Turtle
  file is enough. It needs:
  - DNS: `id.<domain>` pointing to a web server you control (a GitHub Pages
    apex cannot set the headers below);
  - the URL `https://id.<domain>/profile/card`, never moved afterwards: the
    URL is the identity;
  - `Content-Type: text/turtle` and `Access-Control-Allow-Origin: *` on it.
    The Caddy site used for Syntonie and OpenFab is
    [`caddy/sites/id.caddy`](https://github.com/openfab-lab/syntonie-gateway/blob/main/caddy/sites/id.caddy)
    in syntonie-gateway.
- **The profile already says which server signs it in and where its pod will
  be** (the pod does not exist yet; that is fine):

  ```turtle
  @prefix foaf: <http://xmlns.com/foaf/0.1/> .
  @prefix solid: <http://www.w3.org/ns/solid/terms#> .
  @prefix pim: <http://www.w3.org/ns/pim/space#> .
  @prefix ldp: <http://www.w3.org/ns/ldp#> .

  <> a foaf:PersonalProfileDocument ;
      foaf:maker <#me> ;
      foaf:primaryTopic <#me> .

  <#me> a foaf:Organization ;
      foaf:name "OpenFab" ;
      solid:oidcIssuer <https://pod.syntonie.be/> ;
      pim:storage <https://openfab.pod.syntonie.be/> ;
      ldp:inbox <https://openfab.pod.syntonie.be/inbox/> .
  ```

  `solid:oidcIssuer` is the server's address exactly, trailing slash
  included. Add `ldp:inbox` yourself: no app can write a static file, so the
  backoffice's "Use this inbox" step cannot do it for you (it fails with
  "NetworkError", solid-backoffice#26).

Check it:

```sh
curl -sI https://id.openfab.be/profile/card | grep -i -E 'content-type|access-control-allow-origin'
```

## 1. Create the account and the pod in the backoffice

On the server's welcome page, **Start here** opens the backoffice. Create the
account with the role email, and name the pod after the collective
(`openfab`).

The backoffice gives the pod a WebID of its own,
`https://openfab.pod.syntonie.be/profile/card#me`, and every access rule in
the pod names that one. Steps 2 to 4 add the collective's own WebID beside it.

## 2. Link the WebID to the account

1. Open the server's account page, `https://pod.syntonie.be/.account/`, and
   log in with the role email.
2. **Link a WebID from elsewhere**, enter
   `https://id.openfab.be/profile/card#me`, **Link WebID to account**.
3. The page answers "Verification token not found" with a line like this one.
   That is expected: it is how the server checks the WebID is yours.

   ```turtle
   <https://id.openfab.be/profile/card#me> <http://www.w3.org/ns/solid/terms#oidcIssuerRegistrationToken> "126146ba-…" .
   ```

4. Add that line at the end of the profile file, check it is served
   (`curl -s https://id.openfab.be/profile/card`), then click **Link WebID
   to account** again.
5. The page says the profile must name this server as its login provider and
   shows the `solid:oidcIssuer` line. The profile already has it.
6. Remove the token line from the profile.

## 3. Make the WebID an owner of the pod

On the account page, open the pod's settings, enter the WebID under
**Owners**, **Add owner**.

What this gives: the server always lets an owner read and change the pod's
access rules (`.acl` files), whatever they say. It does **not** open the
files themselves, whatever the settings page says: CSS 7.3's
`OwnerPermissionReader` only grants on `.acl` resources. It is the way back
in; step 4 is the access.

## 4. Give the WebID access in every rule that names the old one

Every `.acl` in the pod that names the pod's own WebID must name the
collective's WebID too. A fresh pod has five:

| Rule | Covers |
|---|---|
| `.acl` | the whole pod (inherited by everything without its own rule) |
| `inbox/.acl` | the inbox (anyone signed in may also append) |
| `profile/card.acl` | the pod's own profile |
| `README.acl` | the pod's README |
| `settings/publicTypeIndex.ttl.acl` | the public type index |

Missing one shows up as a 403 on that path once you sign in with the new
WebID (OpenFab hit it on `inbox/`).

On the server, from the instance's terminal (the pod's files are in the CSS
data volume; adapt the container name and the two WebIDs):

```sh
c=syntonie-pods-css
old='https://openfab.pod.syntonie.be/profile/card#me'
new='https://id.openfab.be/profile/card#me'
docker exec -e old="$old" -e new="$new" $c sh -c '
  cd /data/openfab
  mkdir -p /data/openfab-acl-backup
  for f in $(find . -name "*.acl"); do
    cp "$f" "/data/openfab-acl-backup/$(echo "$f" | tr / _)"
    sed -i "s|acl:agent <$old>;|acl:agent <$old>, <$new>;|" "$f"
  done
  grep -rn "acl:agent " .'
```

Every `acl:agent` line printed must name both WebIDs. (Folder pods live at
`/data/<pod>/` too; the grep is the check either way.)

## 5. Sign in as the collective

At the backoffice, sign in with `https://id.openfab.be/profile/card#me`; on
the server's consent page, choose that WebID. Check:

- **Pods** opens `https://openfab.pod.syntonie.be/`;
- **You** shows the profile read from `id.openfab.be`, "Your name" and
  "Your inbox" DONE.

## If something goes wrong

| You see | Why | Do |
|---|---|---|
| "Verification token not found" | The first answer of step 2, every time | Add the line it shows, link again |
| The link page is titled "Create account" | Stock CSS's heading, before overlay 7.3.0-8 | Same page; it links the WebID |
| 403 on a path after signing in with the new WebID | That path has its own `.acl` naming only the old WebID | Step 4 for that file |
| "NetworkError" on a step of the You page | The step writes the profile, and a static profile cannot be written | Add the line to the profile file yourself (`ldp:inbox`, `foaf:name`) |
| The server's login page does not offer the WebID | It is not linked to this account, or the profile's `solid:oidcIssuer` is not this server exactly | Step 2; compare the issuer with the server's address, slash included |

## The shorter path, for the next collective

Link the WebID **before** the pod exists, then create the pod from the
account page with **A WebID I already have elsewhere**: every rule then names
the collective's WebID from the start, and steps 3 and 4 are not needed. The
backoffice cannot do this yet (its sign-up always creates a WebID in the pod),
so this path uses the server's own pages: register, link, create pod.
