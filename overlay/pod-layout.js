// How this server names pods, for the pages that show a pod's address before
// it exists (create-pod). Served at /.well-known/css/scripts/pod-layout.js.
//
//   "subdomain"  https://<name>.<server>/   the image's default (config/instance.json)
//   "suffix"     https://<server>/<name>/   config/suffix.json
//
// The pages cannot ask CSS which one it runs, so this file says it. An
// instance on config/suffix.json mounts its own copy reading "suffix"; if it
// forgets, the only thing wrong is the preview under the name field, never the
// pod that gets created (the server decides that).
window.podLayout = "subdomain";
