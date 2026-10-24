// Runs before the server, on every start (start/start.sh): writes what this
// instance offers where the pages and apps read it, from the image's version
// and the instance's environment. Nothing is mounted for it and nothing in an
// instance's checkout is edited (CLAUDE.md).
//
//   templates/provider.json        -> /.well-known/css/provider.json
//     solid-kit ADR 010: apps read the issuer's descriptor and offer what it
//     lists; no capability listed means not offered. A public contract: fields
//     are only ever added, never renamed or removed.
//   templates/scripts/pod-layout.js -> /.well-known/css/scripts/pod-layout.js
//     the same layout fact for the pages. Until 7.2.0-6 a suffix instance had
//     to mount its own copy, and forgetting it showed wrong addresses.
const fs = require("fs");

const env = process.env;
const layout = /(^|\/)suffix\.json$/.test(env.CSS_CONFIG || "") ? "suffix" : "subdomain";

const capabilities = { account: { path: "/.account/" } };
// The connector runs only with the compose profile on (instance-template); its
// public URL is another host, listed for apps to show, never to call with the
// person's credentials (ADR 010, point 2).
const profiles = (env.COMPOSE_PROFILES || "").split(",").map((p) => p.trim());
if (profiles.includes("connector") && env.MCP_PUBLIC_BASE) {
  capabilities.onboard = { path: "/onboard/" };
  capabilities.connector = { url: env.MCP_PUBLIC_BASE };
}

const descriptor = {
  software: "solid-css-overlay",
  version: env.OVERLAY_VERSION || "dev",
  layout,
  capabilities,
};

const write = (path, text) => {
  try {
    fs.writeFileSync(path, text);
  } catch (err) {
    // A read-only mount from an older instance setup wins; say so, start anyway.
    console.warn(`[solid-css-overlay] could not write ${path} (${err.code}); keeping what is there`);
  }
};
write("templates/provider.json", JSON.stringify(descriptor, null, 2) + "\n");
write(
  "templates/scripts/pod-layout.js",
  "// Written at start by solid-css-overlay (start/describe.js), from CSS_CONFIG.\n" +
    `window.podLayout = ${JSON.stringify(layout)};\n`
);
console.log(`[solid-css-overlay] ${descriptor.version}, ${layout} pods, offers: ${Object.keys(capabilities).join(", ")}`);
