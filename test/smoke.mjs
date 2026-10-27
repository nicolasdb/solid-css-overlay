// Drives a CSS instance's identity pages in a real browser and checks what a
// mockup cannot: that the server's own scripts still work on our markup.
//
//   POD_LAYOUT=subdomain node test/smoke.mjs http://localhost:3123 <screenshots dir>
//
// Run it against try-local.sh (a fresh data folder: it creates an account and
// pods) — never against a live server. Exits 1 with the list of what failed;
// the screenshots are for a person to look at either way. POD_LAYOUT must be
// the one try-local.sh was started with (subdomain by default, or suffix).
//
// `playwright` comes from test/node_modules (npm ci in test/, once). A browser
// comes from PLAYWRIGHT_BROWSERS_PATH, or CHROMIUM_PATH if set.
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import crypto from "node:crypto";
import http from "node:http";

const base = (process.argv[2] || "http://localhost:3123").replace(/\/$/, "");
const out = process.argv[3] || "smoke-shots";
mkdirSync(out, { recursive: true });
const layout = process.env.POD_LAYOUT || "subdomain";
// Where CSS puts the pod called `name`: what the preview must announce and the
// server must answer with.
const podUrl = (name) => {
  const u = new URL(`${base}/`);
  return layout === "subdomain" ? `${u.protocol}//${name}.${u.host}/` : `${base}/${name}/`;
};

const failures = [];
const check = (ok, what) => { if (!ok) failures.push(what); console.log(`${ok ? "  ok  " : "  FAIL"} ${what}`); };

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const desk = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await desk.newPage();
const pageErrors = [];
page.on("pageerror", (e) => pageErrors.push(e.message));
const shot = (p, name) => p.screenshot({ path: `${out}/${name}.png`, fullPage: true });
const submitReady = (p) => p.waitForFunction(() => { const b = document.querySelector("button[type=submit]"); return b && !b.disabled; });
const email = `smoke-${Date.now()}@example.org`;
const password = "smoke-pass-123";

// Sign up -> account
await page.goto(`${base}/.account/login/password/register/`);
await submitReady(page);
await shot(page, "01-register");
await page.fill("#email", email);
await page.fill("#password", password);
await page.fill("#confirmPassword", password);
await page.click("button[type=submit]");
await page.waitForURL(/\/\.account\/account\//);

// With subdomain pods the name becomes a hostname: a name that cannot be one
// is refused by the form before any request, and by the server (PodNameGuard)
// when the form is not used, with a reserved name refused too. The API calls
// go to the bare domain, which node can reach; pod subdomains it cannot.
if (layout === "subdomain") {
  await page.waitForFunction(() => document.getElementById("createPod")?.getAttribute("href"));
  await page.click("#createPod");
  await submitReady(page);
  await page.fill("#name", "open_fab");
  await page.click("button[type=submit]");
  const refused = await page.waitForFunction(() => document.getElementById("error")?.textContent.trim(), null, { timeout: 5000 })
    .then((h) => h.jsonValue(), () => "");
  check(/cannot be a pod name/.test(refused), `create pod: the form refuses "open_fab" (got "${refused}")`);
  // Until 7.2.0-5 the preview still showed https://open_fab.<host>/ beside the refusal.
  const badPreview = await page.textContent("#podUrlPreview");
  check(!/open_fab\./.test(badPreview) && /cannot be a pod name/.test(badPreview), `create pod: the preview gives the reason, not an address, for "open_fab" (got "${badPreview}")`);
  check(await page.$eval("#response", (r) => r.classList.contains("hidden")), "create pod: no pod made for \"open_fab\"");
  await shot(page, "02b-create-pod-refused");
  const { controls } = await (await page.request.get(`${base}/.account/`, { headers: { accept: "application/json" } })).json();
  for (const [name, why] of [["open_fab", /cannot be a pod name/], ["mcp", /reserved/], ["x".repeat(64), /63 characters/]]) {
    const res = await page.request.post(controls.account.pod, { data: { name } });
    const message = (await res.json().catch(() => ({}))).message || "";
    check(res.status() === 400 && why.test(message), `create pod: the server refuses "${name.slice(0, 12)}" without the form (${res.status()} "${message.slice(0, 50)}")`);
  }
  await page.click("#account-link");
}

// Two pods, so consent has a choice to make. The address preview on the way.
for (const name of ["Atelier", "nicolas"]) {
  const lower = name.toLowerCase();
  await page.waitForFunction(() => document.getElementById("createPod")?.getAttribute("href"));
  await page.click("#createPod");
  await submitReady(page);
  await page.fill("#name", name);
  const preview = await page.textContent("#podUrlPreview");
  check(preview === podUrl(lower), `create pod: the address preview reads ${podUrl(lower)} (got "${preview}")`);
  if (name === "Atelier") await shot(page, "02-create-pod");
  await page.click("button[type=submit]");
  await page.waitForSelector("#response:not(.hidden)");
  check((await page.textContent("#response-podBaseUrl")) === podUrl(lower), `create pod: the server made ${podUrl(lower)}`);
  check((await page.textContent("#response-webId")) === `${podUrl(lower)}profile/card#me`, `create pod: the WebID is ${podUrl(lower)}profile/card#me`);
  await page.click("#response-account-link");
}
// The README a new pod starts with is ours (issue #13): stock's sent people to
// the Databrowser. Public, like stock's.
// Fetched by the browser: node cannot resolve <name>.localhost (try-local.sh).
const readme = await page.evaluate((u) => fetch(u, { headers: { accept: "text/markdown" } }).then((r) => r.text()), `${podUrl("nicolas")}README`);
check(readme.startsWith("# Welcome to your pod") && /What is here already/.test(readme) && !/Databrowser|\{\{/.test(readme),
  `pod README: ours, filled in, no Databrowser (got "${readme.slice(0, 40)}")`);
check(readme.includes(`${podUrl("nicolas")}profile/card#me`), "pod README: names the pod's WebID");

// The pod root is a storage an app can read: Turtle, marked pim:Storage. With
// static-root.json every pod root answered the welcome page instead (CSS
// matches static assets on the path, not the host). Asked from the browser,
// which resolves *.localhost; CSS exposes Link to scripts.
const root = await page.evaluate(async (url) => {
  const res = await fetch(url, { headers: { accept: "text/turtle" } });
  return { status: res.status, type: res.headers.get("content-type"), link: res.headers.get("link") || "" };
}, podUrl("atelier"));
check(root.status === 200 && /turtle/.test(root.type) && /pim\/space#Storage>; rel="type"/.test(root.link),
  `pod root: ${podUrl("atelier")} answers Turtle and pim:Storage (${root.status} ${root.type})`);
await page.waitForFunction(() => document.querySelectorAll("#podEntries li").length >= 2);
await shot(page, "03-account");

// Theme (solid-kit ADR 008): Light, Dark, Same as this device; kept across a reload
const theme = () => page.evaluate(() => document.documentElement.dataset.theme);
check((await theme()) === "light", "theme: Light by default, stamped");
await page.click("[data-theme-button]");
await page.reload();
await page.waitForLoadState("domcontentloaded");
check((await theme()) === "dark", "theme: Dark survives a reload");
check((await page.getAttribute("[data-theme-button]", "aria-label")) === "Theme: dark. Change it", "theme: the button names Dark");
await shot(page, "04-account-dark");
// Same as this device, on a system asking for more contrast: High contrast.
await page.emulateMedia({ contrast: "more" });
await page.click("[data-theme-button]");
check((await theme()) === "contrast", "theme: same as this device gives High contrast when the system asks for it");
await shot(page, "05-account-contrast");
// The media query's change event arrives after emulateMedia returns: wait for it.
await page.emulateMedia({ contrast: "no-preference", colorScheme: "dark" });
const followed = await page.waitForFunction(() => document.documentElement.dataset.theme === "dark", null, { timeout: 3000 })
  .then(() => true, () => false);
check(followed, "theme: same as this device follows the system while the page is open");
await page.emulateMedia({ colorScheme: "light" });
await page.click("[data-theme-button]");
check((await theme()) === "light" && (await page.evaluate(() => localStorage.getItem("solid-kit:theme"))) === null,
  "theme: back to Light, the stored choice cleared");

// Consent through a real OIDC flow
const reg = await (await fetch(`${base}/.oidc/reg`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ client_name: "Smoke test app", redirect_uris: ["http://localhost:9/cb"], grant_types: ["authorization_code"], response_types: ["code"], token_endpoint_auth_method: "none" }),
})).json();
const challenge = crypto.createHash("sha256").update(crypto.randomBytes(32).toString("base64url")).digest("base64url");
const auth = `${base}/.oidc/auth?client_id=${encodeURIComponent(reg.client_id)}&redirect_uri=${encodeURIComponent("http://localhost:9/cb")}` +
  `&response_type=code&scope=openid%20webid&code_challenge=${challenge}&code_challenge_method=S256&state=s&prompt=consent`;
const toConsent = async (p) => {
  await p.goto(auth);
  await p.waitForURL(/consent/, { timeout: 15000 });
  await p.waitForFunction(() => document.querySelectorAll("#webIdList input").length > 0);
};
await toConsent(page);
await page.waitForTimeout(300);
await shot(page, "06-consent");
const rows = await page.$$eval("#webIdList label", (ls) => ls.map((l) => ({ key: l.querySelectorAll(".webid-key").length, value: l.querySelector("input").value })));
check(rows.length >= 2, `consent: lists the account's WebIDs (${rows.length})`);
check(rows.every((r) => r.key >= 2), "consent: every WebID shows its pod and document as key parts");
check((await page.evaluate(() => document.activeElement?.tagName)) === "H1", "consent: focus starts on the heading");
check(!(await page.$eval("#client", (dl) => dl.innerHTML.includes("<script"))), "consent: client info is text");
// A dynamically registered app proves nothing about where it runs (ADR 010, point 6).
check(/did not say where it runs/.test(await page.textContent("#client-origin")), "consent: a registered app is said not to have shown where it runs");
const chosen = rows[rows.length - 1].value;
await page.check(`#webIdList input[value="${chosen}"]`);
await Promise.all([page.waitForURL(/localhost:9\//, { timeout: 15000 }).catch(() => {}), page.click("#authorize")]);
const again = await desk.newPage();
await toConsent(again);
check((await again.$eval("#webIdList input:checked", (i) => i.value).catch(() => null)) === chosen, "consent: the last WebID chosen is pre-selected");

// An app with a Client ID Document: the server fetched it and sends the sign-in
// only to its redirect URIs, so the page names the document's host. Served
// here, on the machine running the smoke run; the server must reach it, which
// it does with TRY_NETWORK=host (try-local.sh, and CI).
const DOC_PORT = 3199;
const docId = `http://localhost:${DOC_PORT}/id.jsonld`;
const docServer = http.createServer((req, res) => {
  res.writeHead(200, { "content-type": "application/ld+json" });
  res.end(JSON.stringify({
    "@context": ["https://www.w3.org/ns/solid/oidc-context.jsonld"],
    client_id: docId, client_name: "Smoke test app (document)",
    redirect_uris: ["http://localhost:9/cb"], grant_types: ["authorization_code"],
    response_types: ["code"], scope: "openid webid", token_endpoint_auth_method: "none",
  }));
}).listen(DOC_PORT);
const docPage = await desk.newPage();
await docPage.goto(auth.replace(`client_id=${encodeURIComponent(reg.client_id)}`, `client_id=${encodeURIComponent(docId)}`));
const docReached = await docPage.waitForURL(/consent/, { timeout: 15000 }).then(() => true, () => false);
if (docReached) {
  await docPage.waitForFunction(() => document.getElementById("client-origin")?.textContent.trim());
  const said = await docPage.textContent("#client-origin");
  check(said.includes(`This app runs at localhost:${DOC_PORT}`), `consent: a Client ID Document's host is named (got "${said.slice(0, 60)}")`);
  await shot(docPage, "06b-consent-client-id-document");
} else {
  check(false, `consent: the server could not use the Client ID Document at ${docId} (is it reachable from the server? TRY_NETWORK=host)`);
}
docServer.close();

// Log in: a wrong password, then a server that never answers
const fresh = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const login = await fresh.newPage();
login.on("pageerror", (e) => pageErrors.push(e.message));
await login.goto(`${base}/.account/login/password/`);
await submitReady(login);
await login.fill("#email", email);
await login.fill("#password", "not-the-password");
await login.click("button[type=submit]");
await login.waitForFunction(() => document.getElementById("error")?.textContent.trim());
check(true, "log in: a wrong password shows the server's message");
await shot(login, "07-login-error");
const cut = await fresh.newPage();
await cut.route("**/.account/", (r) => r.abort());
await cut.goto(`${base}/.account/login/password/`);
const reached = await cut.waitForFunction(() => document.getElementById("error")?.textContent.trim(), null, { timeout: 15000 }).then(() => true, () => false);
check(reached, "log in: when the server never answers, #error says so");
await shot(cut, "08-login-unreachable");

// 360px: no sideways scroll on the two densest pages
const phone = await browser.newContext({ viewport: { width: 360, height: 780 }, storageState: await desk.storageState() });
const p360 = await phone.newPage();
await p360.goto(`${base}/.account/login/password/`);
await p360.waitForLoadState("networkidle");
check(!(await p360.evaluate(() => document.documentElement.scrollWidth > innerWidth)), "360px: log in has no sideways scroll");
await shot(p360, "09-login-360");
await toConsent(p360);
check(!(await p360.evaluate(() => document.documentElement.scrollWidth > innerWidth)), "360px: consent has no sideways scroll");
await shot(p360, "10-consent-360");

// Welcome page and forgot password
const w = await fresh.newPage();
await w.goto(`${base}/`);
check(/skin\.css/.test(await w.content()), "welcome: the root page is ours (links skin.css)");
// Until 7.2.0-4 the generic page shipped placeholders an instance had to
// replace, and one went live showing them (pod.example.org, a dead app link).
check((await w.textContent("#server-host")) === new URL(base).host, "welcome: the header names this server's host");
check(!/example\.org/.test(await w.innerText("body")) && !(await w.$$eval("a[href*=\"example.org\"]", (a) => a.length)), "welcome: no placeholder host or link a visitor sees");
await shot(w, "11-welcome");
await w.goto(`${base}/.account/login/password/forgot/`);
await submitReady(w);
await shot(w, "12-forgot");

check(pageErrors.length === 0, `no script errors in the pages${pageErrors.length ? `: ${pageErrors.join(" | ")}` : ""}`);
await browser.close();

console.log(failures.length ? `\n${failures.length} check(s) failed. Screenshots: ${out}/` : `\nsmoke: all checks passed. Screenshots: ${out}/`);
process.exit(failures.length ? 1 : 0);
