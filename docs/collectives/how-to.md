# How-to: give a collective a WebID on its own domain, and a pod

The collective signs in as `https://id.<domain>/profile/card#me`, a WebID it
owns, and its data sits in a pod on this server. Why it is built this way:
[Explanation](explanation.md) and solid-kit ADR 002 (portability tiers, and
its amendment of 2026-11-26: what goes in the profile, what goes in the pod).

Two paths, both run on pod.syntonie.be:

- **[No pod yet](#a-no-pod-yet-the-shorter-path)**, the shorter one (Syntonie,
  2026-11-26). Use it for every new collective.
- **[A pod already exists](#b-a-pod-already-exists)** (OpenFab, 2026-11-24):
  the account was created from the backoffice, with a WebID of the pod's own.

Examples use Syntonie: domain `syntonie.be`, server `pod.syntonie.be`, pod
`syntonie`. Replace them with yours.

## Before you start

- **The server runs 7.3.0-8 or later.**
- **A role email for the collective**, for example `contact@syntonie.be`,
  never a person's: the account follows the role when the people change.
- **The profile is served from the collective's domain**, as a static Turtle
  file:
  - DNS: `id.<domain>` pointing to a web server you control (a GitHub Pages
    apex cannot set the headers below);
  - the URL `https://id.<domain>/profile/card`, never moved afterwards: the
    URL is the identity;
  - `Content-Type: text/turtle` and `Access-Control-Allow-Origin: *` on it.
    The Caddy site used for Syntonie and OpenFab is
    [`caddy/sites/id.caddy`](https://github.com/openfab-lab/syntonie-gateway/blob/main/caddy/sites/id.caddy)
    in syntonie-gateway.

### The profile

Written by hand, once. It holds only what is stable, or what any Solid app must
find without following a link (ADR 002, amendment, point 1). The pod does not
exist yet; the addresses can point to it anyway:

```turtle
@prefix foaf: <http://xmlns.com/foaf/0.1/> .
@prefix solid: <http://www.w3.org/ns/solid/terms#> .
@prefix pim: <http://www.w3.org/ns/pim/space#> .
@prefix ldp: <http://www.w3.org/ns/ldp#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .

<> a foaf:PersonalProfileDocument ;
    foaf:maker <#me> ;
    foaf:primaryTopic <#me> .

<#me> a foaf:Organization ;
    foaf:name "Syntonie ASBL" ;
    solid:oidcIssuer <https://pod.syntonie.be/> ;
    pim:storage <https://syntonie.pod.syntonie.be/> ;
    ldp:inbox <https://syntonie.pod.syntonie.be/inbox/> ;
    pim:preferencesFile <https://syntonie.pod.syntonie.be/settings/prefs.ttl> ;
    solid:publicTypeIndex <https://syntonie.pod.syntonie.be/settings/publicTypeIndex.ttl> ;
    rdfs:seeAlso <https://syntonie.pod.syntonie.be/profile/about.ttl> ;
    foaf:isPrimaryTopicOf <https://syntonie.pod.syntonie.be/profile/about.ttl> .
```

- `solid:oidcIssuer` is the server's address exactly, trailing slash
  included.
- `profile/about.ttl` is the *extended profile*: what apps change later
  (agents with `acl:delegates`, `org:memberOf`, links to other documents)
  goes there, in the pod, because no app can write this file.
- Relations between collectives that do not change (`org:subOrganizationOf`,
  `org:hasSubOrganization`) may stay here.

Check it:

```sh
curl -sI https://id.syntonie.be/profile/card | grep -i -E 'content-type|access-control-allow-origin'
```

## A. No pod yet: the shorter path

### 1. Create the account on the server's own page

Not from the backoffice: its sign-up creates a pod with a WebID of the pod's
own, which is path B. Open
`https://pod.syntonie.be/.account/login/password/register/`, register with the
role email, and **do not create a pod yet**.

### 2. Link the WebID

1. On the account page, **Link a WebID from elsewhere**, enter
   `https://id.syntonie.be/profile/card#me`, **Link WebID to account**.
2. The page answers "Verification token not found" with a line like this one.
   That is expected: it is how the server checks the WebID is yours.

   ```turtle
   <https://id.syntonie.be/profile/card#me> <http://www.w3.org/ns/solid/terms#oidcIssuerRegistrationToken> "288335a0-…" .
   ```

3. Add that line at the end of the profile file, check it is served
   (`curl -s https://id.syntonie.be/profile/card`), then **Link WebID to
   account** again.
4. The page then shows the `solid:oidcIssuer` line the profile must have. It
   already has it.
5. Remove the token line from the profile.

### 3. Create the pod with that WebID

On the account page, **Create a pod**: name `syntonie`, and **A WebID I
already have elsewhere** → `https://id.syntonie.be/profile/card#me`.

Every access rule the server writes in the pod names that WebID from the
start: nothing to edit by hand. The pod also gets a `profile/card` document
the server writes for every pod; it describes the same `#me` as a person,
nothing links to it, and it is harmless.

### 4. Create the extended profile

`profile/about.ttl`, readable by everyone, written by the owners. Until the
backoffice creates it by itself (solid-backoffice#26), on the server:

```sh
c=syntonie-pods-css
pod=syntonie
webid='https://id.syntonie.be/profile/card#me'

# The rule first, so the document is never public-writable or unreadable.
docker exec -i $c sh -c "cat > /data/$pod/profile/about.ttl.acl" <<EOF
@prefix acl: <http://www.w3.org/ns/auth/acl#>.
@prefix foaf: <http://xmlns.com/foaf/0.1/>.

<#public>
    a acl:Authorization;
    acl:agentClass foaf:Agent;
    acl:accessTo <./about.ttl>;
    acl:mode acl:Read.

<#owner>
    a acl:Authorization;
    acl:agent <$webid>;
    acl:accessTo <./about.ttl>;
    acl:mode acl:Read, acl:Write, acl:Control.
EOF

docker exec -i $c sh -c "cat > /data/$pod/profile/about.ttl" <<EOF
@prefix foaf: <http://xmlns.com/foaf/0.1/> .

<> foaf:primaryTopic <$webid> .
EOF

curl -s https://$pod.pod.syntonie.be/profile/about.ttl
```

### 5. Sign in as the collective, and create the inbox

At the backoffice, sign in with `https://id.syntonie.be/profile/card#me`; on
the server's consent page, choose that WebID. Then:

- **Pods** opens `https://syntonie.pod.syntonie.be/`;
- **You**, "Your inbox": **Create my inbox** creates `inbox/` in the pod
  (you, plus anyone signed in may append), then fails with "Failed to fetch"
  when it tries to write the profile. The inbox is there; the profile already
  names it (`ldp:inbox`). Reload: the step shows DONE.
  (solid-backoffice#26 removes the error.)

### 6. If the collective belongs to another one

Syntonie keeps a way into OpenFab's pod (explanation, "Two accounts can still
behave as one"):

1. Logged in as the sub-collective's account, the pod's settings: add the
   parent's WebID under **Owners**. That gives control of the pod's `.acl`
   files only, not of its data (CSS `OwnerPermissionReader`).
2. Add the parent's WebID to every `.acl` in the pod, as in
   [B, step 4](#4-give-the-webid-access-in-every-rule-that-names-the-old-one).

## B. A pod already exists

The account and pod were created from the backoffice, so every rule in the pod
names the pod's own WebID (`https://openfab.pod.syntonie.be/profile/card#me`).
The collective's WebID is added beside it, then the old one is removed.

### 1. Link the WebID

As in [A, step 2](#2-link-the-webid), logged in with the account's email.

### 2. Make the WebID an owner of the pod

On the account page, the pod's settings, **Owners**, **Add owner**. It gives
control of the pod's `.acl` files, whatever they say; not its files,
whatever the settings page says. It is the way back in; step 3 is the access.

### 3. Give the WebID access in every rule that names the old one

A pod made by the backoffice has five:

| Rule | Covers |
|---|---|
| `.acl` | the whole pod (inherited by everything without its own rule) |
| `inbox/.acl` | the inbox (anyone signed in may also append) |
| `profile/card.acl` | the pod's own profile |
| `README.acl` | the pod's README |
| `settings/publicTypeIndex.ttl.acl` | the public type index |

Missing one shows up as a 403 on that path once you sign in with the new
WebID (OpenFab hit it on `inbox/`). On the server:

```sh
c=syntonie-pods-css
pod=openfab
old='https://openfab.pod.syntonie.be/profile/card#me'
new='https://id.openfab.be/profile/card#me'
docker exec -e old="$old" -e new="$new" -e pod="$pod" $c sh -c '
  cd /data/$pod
  mkdir -p /data/$pod-acl-backup
  for f in $(find . -name "*.acl"); do
    cp "$f" "/data/$pod-acl-backup/$(echo "$f" | tr / _)"
    sed -i "s|acl:agent <$old>;|acl:agent <$old>, <$new>;|" "$f"
  done
  grep -rn "acl:agent " .'
```

Every `acl:agent` line printed must name both WebIDs. The backoffice may
have rewritten a rule meanwhile (OpenFab's `inbox/.acl` got a second
authorization when "Use this inbox" ran): check each file the grep prints,
not only the count.

### 4. Extended profile, inbox, sign in

As in [A, steps 4 and 5](#4-create-the-extended-profile). A pod made by the
backoffice already has `inbox/`: the profile names it, nothing to create.

### 5. Remove the old WebID

Once signing in as the new WebID works:

1. Account page, WebIDs: **Remove** the old one. The server then says to
   remove its `solid:oidcIssuer` line, so that tokens already issued for it
   stop working.
2. In the pod, `profile/card` (on the server: `/data/<pod>/profile/card$.ttl`):
   delete the `solid:oidcIssuer` line.
3. Every `.acl`: delete the old WebID (`sed -i "s|<$old>, ||"` with the
   variables above, after a backup), and any authorization that names only
   it.
4. The pod's settings, **Owners**: delete the old WebID.

## If something goes wrong

| You see | Why | Do |
|---|---|---|
| "Verification token not found" | The first answer when linking, every time | Add the line it shows, link again |
| The link page is titled "Create account" | Stock CSS's heading, before overlay 7.3.0-8 | Same page; it links the WebID |
| The pod was created with a WebID of its own | The account was made from the backoffice (or "A new WebID" was chosen) | Path B |
| 403 on a path after signing in with the new WebID | That path has its own `.acl` naming only the old WebID | B, step 3, for that file |
| "Failed to fetch" / "NetworkError" on a step of the You page | The step writes the profile, and a static profile cannot be written (until solid-backoffice#26) | Add the line to the profile file yourself, or to `about.ttl` |
| The server's login page does not offer the WebID | Not linked to this account, or the profile's `solid:oidcIssuer` is not this server exactly | Step "Link the WebID"; compare the issuer, slash included |
