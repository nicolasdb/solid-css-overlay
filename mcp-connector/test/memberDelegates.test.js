// Does a member delegate to an agent: the profile, and the extended profile a
// tier-1 WebID links (solid-kit ADR 002 amendment). No network. Run: npm test.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { memberDelegatesTo } = require("../src/memberDelegates");

const MEMBER = "https://id.example/profile/card#me";
const CARD = "https://id.example/profile/card";
const STORAGE = "https://pod.example/openfab/";
const ABOUT = STORAGE + "profile/about.ttl";
const AGENT = STORAGE + "profile/agent#me";
const P = "@prefix acl: <http://www.w3.org/ns/auth/acl#> . @prefix pim: <http://www.w3.org/ns/pim/space#> . " +
  "@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> . @prefix foaf: <http://xmlns.com/foaf/0.1/> . ";

const card = (extra) => P + "<#me> pim:storage <" + STORAGE + "> ; " + extra + " .";
const delegating = P + "<" + MEMBER + "> acl:delegates <" + AGENT + "> .";

function web(docs) {
  const asked = [];
  const fetchFn = async (url) => {
    asked.push(url);
    return url in docs ? new Response(docs[url], { status: 200 }) : new Response("", { status: 404 });
  };
  return { fetchFn, asked };
}

test("delegation in the card itself", async () => {
  const { fetchFn } = web({ [CARD]: P + "<#me> acl:delegates <" + AGENT + "> ." });
  assert.equal(await memberDelegatesTo(MEMBER, AGENT, fetchFn), true);
});

test("delegation only in about.ttl inside the storage, via rdfs:seeAlso", async () => {
  const { fetchFn, asked } = web({ [CARD]: card("rdfs:seeAlso <" + ABOUT + ">"), [ABOUT]: delegating });
  assert.equal(await memberDelegatesTo(MEMBER, AGENT, fetchFn), true);
  assert.deepEqual(asked, [CARD, ABOUT]);
});

test("delegation only in about.ttl, via foaf:isPrimaryTopicOf, link with a fragment", async () => {
  const { fetchFn, asked } = web({ [CARD]: card("foaf:isPrimaryTopicOf <" + ABOUT + "#it>"), [ABOUT]: delegating });
  assert.equal(await memberDelegatesTo(MEMBER, AGENT, fetchFn), true);
  assert.ok(!asked.some((u) => u.includes("#")), "never fetches with a fragment");
});

test("a link outside the declared storage is ignored, and not even fetched", async () => {
  const other = "https://elsewhere.example/about.ttl";
  const sibling = "https://pod.example/openfab-evil/about.ttl";
  const { fetchFn, asked } = web({
    [CARD]: card("rdfs:seeAlso <" + other + ">, <" + sibling + ">"),
    [other]: delegating,
    [sibling]: delegating,
  });
  assert.equal(await memberDelegatesTo(MEMBER, AGENT, fetchFn), false);
  assert.deepEqual(asked, [CARD]);
});

test("a linked document that 404s is ignored; the answer is still no", async () => {
  const { fetchFn } = web({ [CARD]: card("rdfs:seeAlso <" + ABOUT + ">") });
  assert.equal(await memberDelegatesTo(MEMBER, AGENT, fetchFn), false);
});

test("a relative link resolves against the card (outside the storage here: ignored)", async () => {
  const { fetchFn, asked } = web({ [CARD]: card("rdfs:seeAlso <rel.ttl>"), "https://id.example/profile/rel.ttl": delegating });
  assert.equal(await memberDelegatesTo(MEMBER, AGENT, fetchFn), false);
  assert.ok(!asked.includes("https://id.example/profile/rel.ttl"));
});

test("links inside an extended document are not followed", async () => {
  const deeper = STORAGE + "profile/deeper.ttl";
  const { fetchFn, asked } = web({
    [CARD]: card("rdfs:seeAlso <" + ABOUT + ">"),
    [ABOUT]: P + "<" + MEMBER + "> rdfs:seeAlso <" + deeper + "> .",
    [deeper]: delegating,
  });
  assert.equal(await memberDelegatesTo(MEMBER, AGENT, fetchFn), false);
  assert.ok(!asked.includes(deeper));
});

test("a card that cannot be read still throws, as before", async () => {
  await assert.rejects(memberDelegatesTo(MEMBER, AGENT, web({}).fetchFn));
});
