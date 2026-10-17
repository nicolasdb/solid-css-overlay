// Pod-root discovery against the headers CSS 7.2 really sends (checked
// 2026-10-14 against the image in subdomain mode, suffix mode, and suffix mode
// with root storage as pocpod0 runs it). Run: npm test.
const { test, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const { storageRootOf, storageOfWebId, declaresStorage, forgetPodRoots } = require("../src/podRoot");
const { isForeignResource } = require("../src/receipt");

const STORAGE = '<http://www.w3.org/ns/pim/space#Storage>; rel="type", <http://www.w3.org/ns/ldp#Container>; rel="type"';
const CONTAINER = '<http://www.w3.org/ns/ldp#Container>; rel="type"';

// A fake server: url -> { status, link, body }. Records what was asked.
function server(map) {
  const asked = [];
  const fetchFn = async (url, init = {}) => {
    asked.push(`${init.method || "GET"} ${url}`);
    const r = map[url] || { status: 404 };
    return {
      ok: r.status >= 200 && r.status < 300,
      status: r.status,
      headers: { get: (h) => (h.toLowerCase() === "link" ? r.link || null : null) },
      text: async () => r.body || "",
    };
  };
  return { fetchFn, asked };
}

beforeEach(() => forgetPodRoots());

test("declaresStorage reads rel=type pim:Storage, and nothing else", () => {
  assert.equal(declaresStorage(STORAGE), true);
  assert.equal(declaresStorage(CONTAINER), false);
  assert.equal(declaresStorage('<http://www.w3.org/ns/pim/space#Storage>; rel="describedby"'), false);
  assert.equal(declaresStorage(null), false);
});

test("subdomain pod: the origin is the root, never /profile/", async () => {
  const { fetchFn } = server({
    "https://openfab-bxl.pod.example/profile/": { status: 200, link: CONTAINER },
    "https://openfab-bxl.pod.example/": { status: 200, link: STORAGE },
  });
  assert.equal(await storageRootOf("https://openfab-bxl.pod.example/profile/card#me", fetchFn), "https://openfab-bxl.pod.example/");
});

test("folder pod on a server that is a storage too: stops at the first match", async () => {
  // pocpod0 (storage/location/root.json): the server root advertises
  // pim:Storage as well. Going past alice/ would name the server root.
  const { fetchFn, asked } = server({
    "https://pod.example/alice/notes/": { status: 200, link: CONTAINER },
    "https://pod.example/alice/": { status: 200, link: STORAGE },
    "https://pod.example/": { status: 200, link: STORAGE },
  });
  assert.equal(await storageRootOf("https://pod.example/alice/notes/a.md", fetchFn), "https://pod.example/alice/");
  assert.ok(!asked.includes("HEAD https://pod.example/"), "never asked past the first storage");
});

test("a container that will not say ends the walk: null, not the server root", async () => {
  const { fetchFn } = server({
    "https://pod.example/bob/shared/": { status: 200, link: CONTAINER },
    "https://pod.example/bob/": { status: 401 },
    "https://pod.example/": { status: 200, link: STORAGE },
  });
  assert.equal(await storageRootOf("https://pod.example/bob/shared/x.ttl", fetchFn), null);
});

test("answers are cached per container, so a second read asks nothing", async () => {
  const { fetchFn, asked } = server({
    "https://a.pod.example/notes/": { status: 200, link: CONTAINER },
    "https://a.pod.example/": { status: 200, link: STORAGE },
  });
  await storageRootOf("https://a.pod.example/notes/1.md", fetchFn);
  const before = asked.length;
  assert.equal(await storageRootOf("https://a.pod.example/notes/2.md", fetchFn), "https://a.pod.example/");
  assert.equal(asked.length, before);
});

test("a cached server root does not capture another pod's resources", async () => {
  const { fetchFn } = server({
    "https://pod.example/": { status: 200, link: STORAGE },
    "https://pod.example/carol/": { status: 200, link: STORAGE },
  });
  assert.equal(await storageRootOf("https://pod.example/index.html", fetchFn), "https://pod.example/");
  assert.equal(await storageRootOf("https://pod.example/carol/x", fetchFn), "https://pod.example/carol/");
});

test("a WebID on its own domain (ADR 002 tier 1): pim:storage, no walk", async () => {
  const { fetchFn, asked } = server({
    "https://openfab.be/id": {
      status: 200,
      body: "<#org> <http://www.w3.org/ns/pim/space#storage> <https://openfab-bxl.pod.example/> .",
    },
  });
  assert.equal(await storageOfWebId("https://openfab.be/id#org", fetchFn), "https://openfab-bxl.pod.example/");
  assert.ok(!asked.some((a) => a.startsWith("HEAD")));
});

test("isForeignResource on subdomain pods: own pod is not foreign, another is", async () => {
  const { fetchFn } = server({
    "https://agent.pod.example/profile/card": { status: 200, body: "<#me> a <http://xmlns.com/foaf/0.1/Agent> ." },
    "https://agent.pod.example/profile/": { status: 200, link: CONTAINER },
    "https://agent.pod.example/": { status: 200, link: STORAGE },
    "https://agent.pod.example/notes/": { status: 200, link: CONTAINER },
    "https://openfab-bxl.pod.example/shared/": { status: 200, link: CONTAINER },
    "https://openfab-bxl.pod.example/": { status: 200, link: STORAGE },
  });
  const me = "https://agent.pod.example/profile/card#me";
  assert.equal(await isForeignResource("https://agent.pod.example/notes/a.md", me, fetchFn), false);
  assert.equal(await isForeignResource("https://openfab-bxl.pod.example/shared/b.md", me, fetchFn), true);
});

test("isForeignResource throws rather than guess", async () => {
  const { fetchFn } = server({});
  await assert.rejects(isForeignResource("https://x.example/a", "not a url", fetchFn));
  await assert.rejects(isForeignResource("https://x.example/a", "https://y.example/card#me", fetchFn));
});
