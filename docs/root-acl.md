# Known issue: a public root on instances created before the fix

**Fixed for new instances** (#47). An instance whose data volume was first
started on an older image still has the stock root `.acl`, which lets anyone
write to the root container.

## What it is

Stock CSS writes a root `.acl` on first start (`initialize-intro.json`) that
gives the public (`foaf:Agent`) Read, Write, Append and Control on the root,
with `acl:default`. Its header says "DO NOT USE UNMODIFIED UNLESS FOR TESTING
PURPOSES". The image used it as it was until the fix.

What it allowed: anyone could add files to the root, replace the welcome page
(`index.html`) and rewrite the root `.acl` itself. Pods were not exposed:
each pod has its own `.acl`. Seen on 2026-11-23: scanners had POSTed about 70
exploit-probe files into one root and 1 into another.

The image now copies `overlay/root/.acl` (public read only) where CSS takes
the template from. CSS writes it **on first start only**: it then marks the
root initialized (`.internal/setup/rootInitialized`) and never writes it
again, so updating the image does not change an existing root.

## Check an instance

```sh
curl -sI https://<server host>/ | grep -i wac-allow
```

`public="read"`: nothing to do. `public="append control read write"`: fix it.

## Fix an existing instance

On the server, in the instance's checkout (`/srv/<instance>/solid-css-overlay`).
The root folder is `/data/www/` with subdomain pods (the default),
`/data/` with folder pods (`config/suffix.json`).

1. Replace the root `.acl`. On an image with the fix, copy its own file:

   ```sh
   docker compose exec css cp /community-server/templates/root/intro/wac/.acl /data/www/.acl
   ```

   On an older image, write the same content by hand: `overlay/root/.acl` in
   this repo (the comment lines are optional).

2. Check again: `curl -sI https://<server host>/ | grep -i wac-allow` must say
   `public="read"`. CSS reads the `.acl` at each request; no restart needed.

3. Look at what the public left in the root:

   ```sh
   docker compose exec css ls -la /data/www/
   ```

   Expected: `.acl`, `.meta`, `.internal/`, `index.html`, and with
   subdomain pods nothing else (pods live beside `www/`, not in it). With
   folder pods, one folder per pod as well. Anything else came in through the
   open root: read it before deleting it, and keep a copy if it may matter.

`index.html` needs no fix: `start/welcome.js` puts the image's (or the
vertical's) page back at every start.
