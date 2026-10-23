// identities.json states the connector must boot with. Run: npm test.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { loadIdentities } = require("../src/identityRegistry");

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
