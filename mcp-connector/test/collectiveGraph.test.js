// A collective's config.ttl in either vocabulary (solid-kit ADR 006 §7,
// amended 2026-11-17): the parsing in src/collectiveGraph.js, and what the
// graph tools do with a collective that has no agent. No Oxigraph: every
// refusal below happens before the connector would talk to it. Run: npm test.
const { test, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const graph = require("../src/collectiveGraph");

const SC = "https://w3id.org/solid-collective/vocab#";
const HS = "https://pod.nicolasdb.eu/hyperscope/vocab#";
const ROOT = "https://pod.example/collectif/";
const CONFIG = ROOT + "config.ttl";
const AGENT = ROOT + "profile/agent#me";
const MEMBER = "https://pod.example/xavier/profile/card#me";

const prefixes = `
@prefix sc: <${SC}> . @prefix hs: <${HS}> .
@prefix foaf: <http://xmlns.com/foaf/0.1/> . @prefix ldp: <http://www.w3.org/ns/ldp#> .`;

// The documents of the three configs the connector meets, and their mixtures.
const configs = {
  // A new collective with sharing: sc:, an agent, the feature that needs it.
  sc: `${prefixes}
<#fab> a sc:Collective, foaf:Group ; foaf:name "fab" ; sc:roster <membres.ttl> ; ldp:inbox <inbox/> ;
  sc:feature sc:Sharing ; sc:agent <profile/agent#me> ; sc:suggestedFolder "shared/fab/" .`,
  // OpenFab as the coordinator sets it up: membership only, no agent.
  scMembershipOnly: `${prefixes}
<#fab> a sc:Collective, foaf:Group ; foaf:name "fab" ; sc:roster <membres.ttl> ; ldp:inbox <inbox/> .`,
  // An agent named, Sharing not switched on: allowed, but not a sharing collective.
  scAgentNoSharing: `${prefixes}
<#fab> a sc:Collective, foaf:Group ; foaf:name "fab" ; sc:roster <membres.ttl> ; ldp:inbox <inbox/> ;
  sc:agent <profile/agent#me> .`,
  // HyperScope as it is on its pod today: nothing in sc:, agent and bundleFolder required.
  hs: `${prefixes}
<#fab> a hs:Collective, foaf:Group ; foaf:name "fab" ; hs:roster <membres.ttl> ; ldp:inbox <inbox/> ;
  hs:agent <profile/agent#me> ; hs:bundleFolder "output2/fab/" .`,
  // Half a migration: a different property in each vocabulary is not a conflict.
  scClassHsTerms: `${prefixes}
<#fab> a sc:Collective ; foaf:name "fab" ; hs:roster <membres.ttl> ; ldp:inbox <inbox/> ;
  sc:feature sc:Sharing ; hs:agent <profile/agent#me> .`,
  // The same property in both: refused, whichever one a reader would pick.
  mixedAgent: `${prefixes}
<#fab> a sc:Collective ; foaf:name "fab" ; sc:roster <membres.ttl> ; ldp:inbox <inbox/> ;
  sc:feature sc:Sharing ; sc:agent <profile/agent#me> ; hs:agent <profile/other#me> .`,
  mixedAgentSameValue: `${prefixes}
<#fab> a sc:Collective ; foaf:name "fab" ; sc:roster <membres.ttl> ; ldp:inbox <inbox/> ;
  sc:feature sc:Sharing ; sc:agent <profile/agent#me> ; hs:agent <profile/agent#me> .`,
  mixedRoster: `${prefixes}
<#fab> a hs:Collective ; foaf:name "fab" ; hs:roster <membres.ttl> ; sc:roster <autre.ttl> ; ldp:inbox <inbox/> ;
  hs:agent <profile/agent#me> .`,
  // Sharing promises an agent it does not name.
  sharingNoAgent: `${prefixes}
<#fab> a sc:Collective ; foaf:name "fab" ; sc:roster <membres.ttl> ; ldp:inbox <inbox/> ; sc:feature sc:Sharing .`,
  twoAgents: `${prefixes}
<#fab> a sc:Collective ; foaf:name "fab" ; sc:roster <membres.ttl> ; ldp:inbox <inbox/> ;
  sc:feature sc:Sharing ; sc:agent <profile/agent#me>, <profile/other#me> .`,
  // The old rule still holds for an old document: no agent, not a collective it can read.
  hsNoAgent: `${prefixes}
<#fab> a hs:Collective ; foaf:name "fab" ; hs:roster <membres.ttl> ; ldp:inbox <inbox/> ; hs:bundleFolder "output2/fab/" .`,
  noRoster: `${prefixes}
<#fab> a sc:Collective ; foaf:name "fab" ; ldp:inbox <inbox/> .`,
  notACollective: `${prefixes}
<#fab> a foaf:Group ; foaf:name "fab" ; sc:roster <membres.ttl> .`,
};

// A pod serving one config.ttl; `asked` records what was fetched.
function pod(name) {
  const asked = [];
  const fetchFn = async (url, init = {}) => {
    asked.push(`${init.method || "GET"} ${url}`);
    if (url !== CONFIG) return new Response("", { status: 404 });
    return new Response(configs[name], { status: 200, headers: { "content-type": "text/turtle" } });
  };
  return { fetchFn, asked, identity: (webId) => ({ webId, session: { fetch: fetchFn } }) };
}

const load = (name, address = CONFIG) => graph.loadCollective(address, pod(name).fetchFn);

beforeEach(() => graph.forgetReaders());

test("a config in sc: reads: roster, agent, Sharing on", async () => {
  const c = await load("sc");
  assert.equal(c.group, CONFIG + "#fab");
  assert.equal(c.roster, ROOT + "membres.ttl");
  assert.equal(c.agent, AGENT);
  assert.equal(c.sharing, true);
  assert.equal(c.vocabulary, "sc");
  assert.equal(c.root, ROOT);
});

test("a config in hs: reads as before: agent required, Sharing on without a feature", async () => {
  const c = await load("hs", CONFIG + "#fab");
  assert.equal(c.group, CONFIG + "#fab");
  assert.equal(c.roster, ROOT + "membres.ttl");
  assert.equal(c.agent, AGENT);
  assert.equal(c.sharing, true);
  assert.equal(c.vocabulary, "hs");
});

test("an hs: config with no agent is refused, as it always was", async () => {
  await assert.rejects(load("hsNoAgent"), /expected exactly one hs:agent, found 0/);
});

test("a membership-only sc: config has no agent and no Sharing, and is still a collective", async () => {
  const c = await load("scMembershipOnly");
  assert.equal(c.agent, null);
  assert.equal(c.sharing, false);
  assert.equal(c.roster, ROOT + "membres.ttl");
});

test("an sc: config may name an agent without switching Sharing on", async () => {
  const c = await load("scAgentNoSharing");
  assert.equal(c.agent, AGENT);
  assert.equal(c.sharing, false);
});

test("different properties in different vocabularies are read together", async () => {
  const c = await load("scClassHsTerms");
  assert.equal(c.roster, ROOT + "membres.ttl");
  assert.equal(c.agent, AGENT);
  assert.equal(c.sharing, true);
});

test("the same property in both vocabularies is refused, even with the same value", async () => {
  for (const name of ["mixedAgent", "mixedAgentSameValue"]) {
    await assert.rejects(load(name), (err) => {
      assert.match(err.message, /agent is given in both sc: and hs:/);
      assert.match(err.message, /will not guess/);
      assert.equal(err.statusCode, undefined, "a refusal carries no status, so the tool shows its words");
      return true;
    });
  }
  await assert.rejects(load("mixedRoster"), /roster is given in both sc: and hs:/);
});

test("Sharing needs exactly one agent; an agent is never more than one", async () => {
  await assert.rejects(load("sharingNoAgent"), /sc:Sharing needs exactly one sc:agent, found 0/);
  await assert.rejects(load("twoAgents"), /at most one agent, found 2/);
});

test("a roster is required in either vocabulary; a subject must be declared a collective", async () => {
  await assert.rejects(load("noRoster"), /expected exactly one sc:roster .* found 0/);
  await assert.rejects(load("notACollective"), /does not declare exactly one sc:Collective/);
  await assert.rejects(load("sc", CONFIG + "#elsewhere"), /does not declare .*#elsewhere/);
});

test("graph_ingest on a collective with no agent says there is no agent to ingest as", async () => {
  const p = pod("scMembershipOnly");
  await assert.rejects(
    graph.ingest({ collective: CONFIG, url: ROOT + "depots/" }, p.identity(AGENT)),
    (err) => {
      assert.match(err.message, /declares no agent/);
      assert.match(err.message, /no agent to ingest as/);
      assert.match(err.message, /membership only/);
      assert.equal(err.statusCode, undefined);
      return true;
    }
  );
  assert.deepEqual(p.asked, [`GET ${CONFIG}`], "nothing was read or loaded beyond the config");
});

test("graph_query on a collective with no agent says there is no graph, without reading the roster", async () => {
  const p = pod("scMembershipOnly");
  await assert.rejects(
    graph.queryGraph({ collective: CONFIG, query: "SELECT * WHERE { ?s ?p ?o }" }, p.identity(MEMBER)),
    (err) => {
      assert.match(err.message, /membership only/);
      assert.match(err.message, /no graph is built/);
      assert.equal(err.statusCode, undefined);
      return true;
    }
  );
  assert.deepEqual(p.asked, [`GET ${CONFIG}`], "neither the roster nor a profile was read");
});

test("graph_ingest on a collective with an agent still checks who is asking", async () => {
  for (const name of ["sc", "hs"]) {
    const p = pod(name);
    await assert.rejects(
      graph.ingest({ collective: CONFIG, url: ROOT + "depots/" }, p.identity(MEMBER)),
      new RegExp(`Only the collective's agent \\(${AGENT.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\) ingests`)
    );
  }
});

test("a reader of an sc: collective with no agent branch is never taken for the agent", async () => {
  // authorizeReader on a collective object with agent null: webId null/undefined must not match.
  const collective = await load("scMembershipOnly");
  const fetchFn = async (url) => (url === collective.roster ? new Response("", { status: 403 }) : new Response("", { status: 404 }));
  await assert.rejects(graph.authorizeReader(collective, undefined, fetchFn), /cannot read the roster/);
});

test("graph_ingest by the agent of an sc: collective and of an hs: one loads the same way", async () => {
  // Oxigraph stands in as a global fetch that records the PUTs it receives.
  const realFetch = global.fetch;
  const puts = [];
  global.fetch = async (url, init = {}) => {
    puts.push(`${init.method} ${decodeURIComponent(String(url))}`);
    return new Response("", { status: 200 });
  };
  try {
    for (const name of ["sc", "hs"]) {
      puts.length = 0;
      const docs = {
        [CONFIG]: configs[name],
        [ROOT + "depots/"]: `@prefix ldp: <http://www.w3.org/ns/ldp#>. <> a ldp:Container ; ldp:contains <p.ttl> .`,
        [ROOT + "depots/p.ttl"]: `<#a> <http://purl.org/dc/terms/title> "t" .`,
      };
      const fetchFn = async (url) =>
        docs[url] ? new Response(docs[url], { status: 200, headers: { "content-type": "text/turtle" } }) : new Response("", { status: 404 });
      const out = await graph.ingest({ collective: CONFIG, url: ROOT + "depots/" }, { webId: AGENT, session: { fetch: fetchFn } });
      assert.match(out, /Ingested 1 of 1/, name);
      assert.equal(puts.length, 1, name);
      assert.match(puts[0], /^PUT .*\/store\?graph=https:\/\/pod\.example\/collectif\/depots\/p\.ttl$/, name);
    }
  } finally {
    global.fetch = realFetch;
  }
});
