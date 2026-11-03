# Tutorial: your first clean-up

In ten minutes you will run the image on your own machine, make two accounts,
delete one with the admin tool, and see its pod name come free again. Nothing
here touches a real instance.

You need Docker and a clone of this repo.

## 1. Start a throwaway server

```sh
docker build -t solid-css-overlay:dev .
test/try-local.sh 3123
```

The server runs at http://localhost:3123/ with an empty data folder, in a
container called `try-css-overlay-3123`.

## 2. Make two accounts, each with a pod

In a browser, open http://localhost:3123/.account/login/password/register/
and sign up as `keep@example.org`. Create a pod called `keep`.

Sign out, sign up again as `gone@example.org`, and create a pod called
`trial`.

## 3. Open the admin tool

The tool runs inside the server's container. On an instance,
`scripts/admin.sh` does this for you. Here, call it directly:

```sh
docker exec -it try-css-overlay-3123 node /opt/overlay/admin.js
```

You see both accounts, each with its pod:

```
Accounts on localhost:3123  2 shown of 2 · sort: email · 0 selected
↑↓ move  space select  a all shown  / filter  s sort  d delete  r reload  q quit

[ ] gone@example.org                 trial.localhost:3123
[ ] keep@example.org                 keep.localhost:3123
```

Press `s` a few times and watch the order change. Press `/`, type `gone`, and
press Enter: only that account is left on screen.

## 4. Delete it

1. Press space to select `gone@example.org`.
2. Press `d`. The tool shows what will go and asks you to type how many
   accounts that is.
3. Type `1` and press Enter.

The line disappears and the tool says the pod names are free again. Press `q`.

## 5. See that the name is free

Sign up once more as `again@example.org` and create a pod called `trial`.
Before this tool, the server answered "There already is a resource" here. Now
it makes the pod.

## 6. Clean up

```sh
docker rm -f try-css-overlay-3123
```

## What you did

You used the server's own terminal as the permission: no admin password and
no list of admin emails. On a real instance the same tool runs over ssh;
[the how-to](how-to.md) shows the steps.
