// How this server names pods, for the pages that show a pod's address before
// it exists (create-pod). Served at /.well-known/css/scripts/pod-layout.js.
//
//   "subdomain"  https://<name>.<server>/   the image's default (config/instance.json)
//   "suffix"     https://<server>/<name>/   config/suffix.json
//
// The pages cannot ask CSS which one it runs, so this file says it. Since
// 7.2.0-6 the image rewrites it at every start from CSS_CONFIG
// (start/describe.js, with provider.json): this copy is only the default the
// image is built with. Until then a suffix instance mounted its own copy, and
// forgetting it showed wrong addresses in the preview (never a wrong pod: the
// server decides that).
window.podLayout = "subdomain";
