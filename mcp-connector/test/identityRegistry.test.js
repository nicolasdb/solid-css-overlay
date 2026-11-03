// identities.json states the connector must boot with. Run: npm test.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { loadIdentities, removeIdentitiesFor } = require("../src/identityRegistry");

function file(obj) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "identities-"));
  const f = path.join(dir, "identities.json");
  fs.writeFileSync(f, JSON.stringify(obj), { mode: 0o600 });
  return f;
}

// Until 7.2.0-5 this threw "contains no identities", and a new instance (whose
// install creates `{}`) crash-looped before /onboard/ could mint a first agent.
test("an empty file loads as no identities", () => {
  assert.equal(loadIdentities(file({})).size, 0);
});

test("a file whose every identity is revoked loads as no identities", () => {
  const f = file({
    ["a".repeat(22)]: {
      label: "Gone",
      webId: "https://pod.example.org/gone/profile/card#me",
      clientId: "client-gone",
      clientSecret: "secret-gone",
      revoked: true,
    },
  });
  assert.equal(loadIdentities(f).size, 0);
});

// An account deleted by an admin (solid-kit ADR 012, scripts/admin.sh): its
// WebIDs' entries go, and so do agents whose WebID lived in its pods.
test("removeIdentitiesFor drops a deleted account's WebIDs and its pods' agents, keeps the rest", async () => {
  const entry = (label, webId) => ({ label, webId, clientId: `client-${label}`, clientSecret: `secret-${label}` });
  const f = file({
    ["a".repeat(22)]: entry("Person", "https://gone.example.org/profile/card#me"),
    ["b".repeat(22)]: entry("Agent", "https://gone.example.org/agents/claude/card#me"),
    ["c".repeat(22)]: entry("Other", "https://stays.example.org/profile/card#me"),
    ["d".repeat(22)]: entry("Elsewhere", "https://elsewhere.org/me#i"),
  });
  const removed = await removeIdentitiesFor(
    { webIds: ["https://elsewhere.org/me#i"], pods: ["https://gone.example.org/"] }, f);
  assert.deepEqual(removed.sort(), ["Agent", "Elsewhere", "Person"]);
  assert.deepEqual([...loadIdentities(f).values()].map((id) => id.label), ["Other"]);
  assert.equal(fs.statSync(f).mode & 0o777, 0o600);
});

test("removeIdentitiesFor leaves the file untouched when nothing matches", async () => {
  const f = file({ ["a".repeat(22)]: { label: "P", webId: "https://a.example.org/c#me", clientId: "c", clientSecret: "s" } });
  const before = fs.readFileSync(f, "utf-8");
  assert.deepEqual(await removeIdentitiesFor({ webIds: ["https://x.org/#me"], pods: [] }, f), []);
  assert.equal(fs.readFileSync(f, "utf-8"), before);
});
