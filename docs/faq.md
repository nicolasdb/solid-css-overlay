# FAQ

Questions people ask about an instance, answered against the CSS 7.2.0
source. The values below are stock CSS; the overlay changes none of them.

## Does CSS sign people out by itself?

There is no sign-out timer. Each sign-in has a lifetime, and when one ends
the user is asked again:

| What | Lasts | Set by |
|---|---|---|
| An app's access token | 1 h | `ttl.AccessToken`, `config/identity/handler/base/provider-factory.json` |
| An app's refresh token | 24 h | `ttl.RefreshToken`, same file; only if the app got one (below) |
| The sign-in at the provider, "Stay logged in" checked | 14 days | `BaseCookieStore`, `14 * 24 * 60 * 60` |
| The same, unchecked | until the browser closes | a session cookie |
| What a user agreed to on the consent page | 14 days | `ttl.Grant` |

An app that reloads signs in again silently (a `prompt=none` round trip) as
long as the sign-in at the provider is alive. So the user is asked again
when:

- the browser was closed and "Stay logged in" was unchecked at login;
- 14 days have passed;
- the site's data was cleared, or the app is opened in a private window.

## What does "Let this app stay signed in" on the consent page do?

It decides whether the app gets a refresh token. Unchecked, CSS refuses the
`offline_access` scope (`ConsentHandler.updateGrant`): the app has to come
back to the provider after an hour. Checked, it can renew itself for up to
24 hours.

It does not skip anything. CSS has no "don't ask again": every interactive
sign-in shows the choice of WebID and the consent page. Until 7.2.0-7 the
label said "Remember this app, so it doesn't ask again", which promised that.

## After a reload, an app lands on its home screen. Is that CSS?

Not CSS: the app. The silent round trip comes back to the app's redirect URL,
which has no fragment (OIDC refuses one), so an app with hash routes loses
where it was. The Inrupt library keeps the address from before the round trip
and hands it back with its `sessionRestore` event; an app has to listen for
it. solid-kit's `completeLogin` does (solid-backoffice PR #11).
