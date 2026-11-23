# Explanation: one account per collective

## Three things that are easy to mix up

Community Solid Server 7.3 keeps three separate things:

- **An account** is a login: an email and a password. Everything below hangs
  off it, and whoever logs in can change all of it.
- **A WebID** is a name on the web, a URL such as
  `https://id.openfab.be/profile/card#me`. An account can link several. A
  WebID does not have to live on this server: it can be a small Turtle file on
  the collective's own domain (tier 1), which only has to say which server
  signs it in (`solid:oidcIssuer`) and where its data is (`pim:storage`).
- **A pod** is storage, for example `https://openfab.pod.syntonie.be/`. An
  account can create several. Each pod remembers the account that created it,
  and has a list of **owners**: WebIDs that always have full control over it.

## The question: a school and its classroom

Syntonie is an ASBL. OpenFab is one of its collectives: OpenFab members join
Syntonie first. So it is tempting to give both to one account, the school
holding the classroom's keys.

We chose two accounts, one per collective (2026-11-23).

## Why two accounts

**An account is the whole set of keys.** One account holding both pods means
whoever can log in as OpenFab can also act as Syntonie. OpenFab could never
get keyholders of its own without being given Syntonie's keys too.

**A pod cannot change account.** CSS 7.3 has no way to move a pod from one
account to another: the pod record keeps the account that created it, and no
part of the account API changes that. Splitting one account in two later
would mean a new pod, copying the data, and pointing `pim:storage` at the new
address. Possible (that is what tier 1 is for), but it is a migration.

**Two accounts can still behave as one.** The other way round costs nothing:

- the profiles already say how the two relate (`org:subOrganizationOf` on
  OpenFab's, `org:hasSubOrganization` on Syntonie's);
- OpenFab's account adds Syntonie's WebID as a **pod owner** of the openfab
  pod. CSS then always grants that WebID full control, `.acl` files
  included (`OwnerPermissionReader`), whatever the ACLs say. Syntonie keeps
  a way back in without sharing a password, and it can be removed again
  (CSS refuses only to remove a pod's last owner).

So the choice is lopsided: two accounts can be joined by one owner entry, one
account can only be split by a migration. Start with two.

## What it does not decide

Who holds OpenFab's keys (which email, which people) is the collective's
business: a proposal for the makers' council, not a server setting. This
layout only keeps every answer open.

## The setup on pod.syntonie.be

| Account | WebID | Pod | Extra owner |
|---|---|---|---|
| `contact@syntonie.be` | `https://id.syntonie.be/profile/card#me` | `syntonie` | none |
| `contact@openfab.be` | `https://id.openfab.be/profile/card#me` | `openfab` | Syntonie's WebID |

The account email is a shared role address, never a person's: the account
then follows the role when the people change.
