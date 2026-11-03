#!/usr/bin/env node
// The account admin of a CSS instance, run INSIDE the css container (the
// image puts it at /opt/overlay/admin.js; scripts/admin.sh runs it with
// `docker compose exec`). Stock CSS cannot list every account nor delete one;
// account-admin/ (solid-kit ADR 012) adds a route that can, opened by a token
// that start/admins.js renews at every start in a file only this container's
// user can read. Being able to run this is the permission: ssh + docker.
//
//   admin.js                      the TUI: list, sort, filter, select, delete
//   admin.js list [--json]        every account, its logins, pods and WebIDs
//   admin.js delete <email|accountId>... --yes [--json]
//
// Plain Node, nothing to install: it ships with the image and changes with it.
//
// It calls the server on 127.0.0.1 and says which host it means with
// X-Forwarded-Host/-Proto, from CSS_BASE_URL: CSS picks the route (and, with
// subdomain pods, the pod) from the host, and the gateway is not in the way
// in here. CSS honours those headers (OriginalUrlExtractor, 7.3.0).
//
// Every deletion is also appended, one JSON line each, to DELETED_LOG, which
// scripts/admin.sh reads afterwards to remove the connector's agents (the
// connector's identities.json is outside CSS and outside this container).
"use strict";
const fs = require("fs");
const http = require("http");
const readline = require("readline");

const TOKEN_FILE = "/community-server/config/identity/handler/account-admin.token";
const DELETED_LOG = process.env.ADMIN_DELETED_LOG || "/tmp/account-admin-deleted.jsonl";
const base = new URL(process.env.CSS_BASE_URL || "http://localhost:3000/");
const port = Number(process.env.CSS_PORT || 3000);

function call(body) {
  const token = fs.readFileSync(process.env.ADMIN_TOKEN_FILE || TOKEN_FILE, "utf-8").trim();
  const data = JSON.stringify({ token, ...body });
  return new Promise((resolve, reject) => {
    const req = http.request({
      host: "127.0.0.1", port, method: "POST", path: "/.account/admin/accounts/",
      headers: {
        "content-type": "application/json", accept: "application/json",
        "content-length": Buffer.byteLength(data),
        "x-forwarded-host": base.host, "x-forwarded-proto": base.protocol.replace(":", ""),
      },
    }, (res) => {
      let text = "";
      res.on("data", (chunk) => { text += chunk; });
      res.on("end", () => {
        let json = {};
        try { json = JSON.parse(text); } catch { /* not JSON: said below */ }
        if (res.statusCode !== 200) {
          reject(new Error(`${res.statusCode} ${json.message || text.slice(0, 200)}`));
        } else {
          resolve(json);
        }
      });
    });
    req.on("error", reject);
    req.end(data);
  });
}

const list = async () => (await call({ action: "list" })).accounts;

async function remove(account) {
  const target = account.emails[0] ? { email: account.emails[0] } : { accountId: account.accountId };
  const { deleted } = await call({ action: "delete", ...target });
  fs.appendFileSync(DELETED_LOG, JSON.stringify(deleted) + "\n", { mode: 0o600 });
  return deleted;
}

const label = (a) => a.emails.join(", ") || `(no login) ${a.accountId}`;

// ---------------------------------------------------------------- commands

async function commandList(json) {
  const accounts = await list();
  if (json) {
    console.log(JSON.stringify(accounts, null, 2));
    return;
  }
  console.log(`${accounts.length} account(s) on ${base.host}`);
  for (const a of accounts) {
    console.log(`- ${label(a)}`);
    for (const pod of a.pods) console.log(`    pod   ${pod}`);
    for (const webId of a.webIds) console.log(`    WebID ${webId}`);
  }
}

async function commandDelete(targets, yes, json) {
  if (!yes) {
    throw new Error("delete deletes for good: add --yes (the TUI asks instead)");
  }
  const accounts = await list();
  const results = [];
  for (const target of targets) {
    const account = accounts.find((a) => a.accountId === target || a.emails.includes(target.toLowerCase()));
    if (!account) {
      throw new Error(`no account ${target}`);
    }
    results.push(await remove(account));
  }
  if (json) {
    console.log(JSON.stringify(results, null, 2));
  } else {
    for (const d of results) console.log(`deleted ${label(d)}: ${d.pods.length} pod(s) ${d.pods.join(" ")}`);
  }
}

// ---------------------------------------------------------------- the TUI

const SORTS = [
  ["email", (a, b) => label(a).localeCompare(label(b))],
  ["pods, most first", (a, b) => b.pods.length - a.pods.length || label(a).localeCompare(label(b))],
  ["pod name", (a, b) => (a.pods[0] || "~").localeCompare(b.pods[0] || "~")],
];

async function tui() {
  const out = process.stdout;
  const state = { all: await list(), cursor: 0, top: 0, selected: new Set(), sort: 0, filter: "", mode: "list", input: "", message: "" };
  const esc = (s) => `\x1b[${s}`;
  const bold = (s) => `${esc("1m")}${s}${esc("0m")}`;
  const dim = (s) => `${esc("2m")}${s}${esc("0m")}`;
  const inverse = (s) => `${esc("7m")}${s}${esc("0m")}`;
  const fit = (s, n) => (s.length > n ? `${s.slice(0, n - 1)}…` : s.padEnd(n));

  const visible = () => state.all
    .filter((a) => !state.filter || `${label(a)} ${a.pods.join(" ")}`.toLowerCase().includes(state.filter.toLowerCase()))
    .sort(SORTS[state.sort][1]);
  const chosen = () => {
    const rows = visible();
    return state.selected.size ? state.all.filter((a) => state.selected.has(a.accountId)) : rows.slice(state.cursor, state.cursor + 1);
  };

  function draw() {
    const width = out.columns || 100;
    const height = (out.rows || 30) - 6;
    const rows = visible();
    state.cursor = Math.max(0, Math.min(state.cursor, rows.length - 1));
    if (state.cursor < state.top) state.top = state.cursor;
    if (state.cursor >= state.top + height) state.top = state.cursor - height + 1;
    const lines = [
      bold(`Accounts on ${base.host}`) + dim(`  ${rows.length} shown of ${state.all.length} · sort: ${SORTS[state.sort][0]}` +
        `${state.filter ? ` · filter: "${state.filter}"` : ""} · ${state.selected.size} selected`),
      dim("↑↓ move  space select  a all shown  / filter  s sort  d delete  r reload  q quit"),
      "",
    ];
    const emailWidth = Math.max(20, Math.floor(width * 0.4));
    rows.slice(state.top, state.top + height).forEach((a, i) => {
      const mark = state.selected.has(a.accountId) ? "[x]" : "[ ]";
      const pods = a.pods.map((p) => p.replace(/^https?:\/\//, "").replace(/\/$/, "")).join(" ") || dim("no pod");
      const line = fit(`${mark} ${fit(label(a), emailWidth)} ${pods}`, width - 1);
      lines.push(state.top + i === state.cursor ? inverse(line) : line);
    });
    if (rows.length === 0) lines.push(dim("  (nothing matches)"));
    lines.push("");
    if (state.mode === "filter") lines.push(`filter: ${state.input}█`);
    else if (state.mode === "confirm") {
      const doomed = chosen();
      lines.push(bold(`Delete ${doomed.length} account(s), all their pods and everything in them, for good?`));
      for (const a of doomed.slice(0, 5)) lines.push(`  ${label(a)}  ${a.pods.join(" ")}`);
      if (doomed.length > 5) lines.push(`  … and ${doomed.length - 5} more`);
      lines.push(`Type ${doomed.length} then Enter to delete, Esc to go back: ${state.input}█`);
    } else lines.push(state.message);
    out.write(esc("H") + esc("2J") + lines.join("\n"));
  }

  async function deleteChosen() {
    const doomed = chosen();
    state.mode = "busy";
    let done = 0;
    for (const a of doomed) {
      state.message = `deleting ${label(a)} (${done + 1}/${doomed.length})…`;
      draw();
      try {
        await remove(a);
        done += 1;
      } catch (error) {
        state.message = `stopped at ${label(a)}: ${error.message} — ${done} deleted before it`;
        break;
      }
    }
    if (done === doomed.length) state.message = `${done} account(s) deleted; their pod names are free again.`;
    state.selected.clear();
    state.all = await list();
    state.mode = "list";
  }

  return new Promise((resolve) => {
    readline.emitKeypressEvents(process.stdin);
    process.stdin.setRawMode(true);
    out.write(esc("?1049h") + esc("?25l"));
    const quit = () => {
      out.write(esc("?25h") + esc("?1049l"));
      process.stdin.setRawMode(false);
      process.stdin.pause();
      resolve();
    };
    process.stdin.on("keypress", async (str, key = {}) => {
      if (key.ctrl && key.name === "c") return quit();
      if (state.mode === "busy") return undefined;
      const rows = visible();
      if (state.mode === "filter" || state.mode === "confirm") {
        if (key.name === "escape") { state.mode = "list"; state.input = ""; }
        else if (key.name === "backspace") state.input = state.input.slice(0, -1);
        else if (key.name === "return") {
          if (state.mode === "filter") { state.filter = state.input; state.cursor = 0; state.mode = "list"; }
          else if (state.input === String(chosen().length)) { state.input = ""; await deleteChosen(); }
          else { state.message = "Not the number shown: nothing deleted."; state.mode = "list"; }
          state.input = "";
        } else if (str && !key.ctrl && str.length === 1) state.input += str;
        return draw();
      }
      state.message = "";
      switch (key.name) {
        case "q": return quit();
        case "up": case "k": state.cursor -= 1; break;
        case "down": case "j": state.cursor += 1; break;
        case "pageup": state.cursor -= 10; break;
        case "pagedown": state.cursor += 10; break;
        case "space": {
          const a = rows[state.cursor];
          if (a) state.selected.has(a.accountId) ? state.selected.delete(a.accountId) : state.selected.add(a.accountId);
          state.cursor += 1;
          break;
        }
        case "a": {
          const all = rows.every((a) => state.selected.has(a.accountId));
          for (const a of rows) all ? state.selected.delete(a.accountId) : state.selected.add(a.accountId);
          break;
        }
        case "s": state.sort = (state.sort + 1) % SORTS.length; break;
        case "r": state.all = await list(); state.message = "reloaded"; break;
        case "d": if (chosen().length) { state.mode = "confirm"; state.input = ""; } break;
        default: if (str === "/") { state.mode = "filter"; state.input = state.filter; }
      }
      return draw();
    });
    process.stdout.on("resize", draw);
    draw();
  });
}

// ---------------------------------------------------------------- main

(async () => {
  const [command, ...rest] = process.argv.slice(2);
  const json = rest.includes("--json");
  const args = rest.filter((a) => !a.startsWith("--"));
  if (!command) {
    if (!process.stdin.isTTY) throw new Error("the TUI needs a terminal: `admin.js list` or `admin.js delete … --yes` without one");
    await tui();
  } else if (command === "list") await commandList(json);
  else if (command === "delete" && args.length) await commandDelete(args, rest.includes("--yes"), json);
  else throw new Error("usage: admin.js | admin.js list [--json] | admin.js delete <email|accountId>... --yes [--json]");
})().catch((error) => {
  console.error(`admin: ${error.message}`);
  process.exit(1);
});
