// Runs before the server, on every start (start/start.sh): puts the welcome
// page in the image (or the one the instance mounts over it, from the `pods/`
// folder of its design-system repo, solid-kit ADR 011) at the server root.
//
// Stock CSS writes that page into the data once, on first start
// (initialize-intro.json), and never again. Until 7.2.0-10 every new page, from
// a new image or from the design-system repo, had to be copied in by hand with
// `docker compose cp`, and an instance that forgot showed the old one (Maps of
// Making went live with the placeholders of 7.2.0-3). The root page is the
// instance's, not a document people edit through Solid: one edited that way
// is replaced at the next start.
//
// First start is left to CSS: the data has no root yet, and the initializer
// copies the same file from templates/root/intro/base/.
const fs = require("fs");
const path = require("path");

const root = process.env.CSS_ROOT_FILE_PATH || "/data";
const layout = /(^|\/)suffix\.json$/.test(process.env.CSS_CONFIG || "") ? "suffix" : "subdomain";
// Subdomain pods: the server's own host is the `www` base subdomain
// (config/instance.json), so its root, and the setup record that says it was
// made, live in www/. Folder pods: the data folder itself.
const site = path.join(root, layout === "suffix" ? "" : "www");
const target = path.join(site, "index.html");
const source = "templates/root/intro/base/index.html";

if (!fs.existsSync(path.join(site, ".internal/setup/rootInitialized$.json"))) {
  console.log("[solid-css-overlay] welcome page: first start, written by CSS");
} else {
  try {
    const page = fs.readFileSync(source);
    let current = null;
    try { current = fs.readFileSync(target); } catch {}
    if (current && current.equals(page)) {
      console.log("[solid-css-overlay] welcome page: up to date");
    } else {
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, page);
      console.log(`[solid-css-overlay] welcome page: written to ${target}`);
    }
  } catch (err) {
    // Never stop the server for the welcome page: it keeps the one it has.
    console.warn(`[solid-css-overlay] welcome page: could not write ${target} (${err.code}); keeping what is there`);
  }
}
