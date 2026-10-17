/**
 * podRoot.js
 *
 * Which pod a URL belongs to, asked of the server rather than read off the
 * URL. Used by receipts (receipt.js): "is this read foreign?" and "where is
 * the data subject's access-log/?".
 *
 * Until 7.2.0-1 this was `origin + first path segment`, which holds only for
 * folder pods (pod.example/alice/). On a subdomain pod
 * (alice.pod.example/profile/card) it named `…/profile/` as the pod: a read in
 * one's own pod counted as foreign and its receipt went to a profile/access-log/
 * that does not exist. It is also the string-parsing solid-kit forbids
 * (CLAUDE.md, "Pod-root discovery"): a tier-1 WebID (ADR 002) lives on the
 * person's own domain, nowhere near their storage.
 *
 * The rule is solid-kit's src/lib/pod.ts:
 *  1. For a WebID, the profile's `pim:storage` first.
 *  2. Otherwise walk up the containers and STOP AT THE FIRST one whose
 *     response carries `Link: <pim:Storage>; rel="type"`. A server whose
 *     storage location is the root (pocpod0, storage/location/root.json)
 *     advertises pim:Storage on its own root too; walking past the first hit
 *     yields the server root, which is not the person's pod.
 *  3. A container that answers without saying (401, 403, an error) ENDS the
 *     walk with null instead of going on: past it is exactly where the server
 *     root sits. Checked against CSS 7.2: a 401 carries no type links. The
 *     storage description (rel=storageDescription) is not used: on a server
 *     with root storage it names the server root for every pod.
 *
 * Results are cached per container, both ways (storage or not), so the cost
 * is one HEAD per new container level, once.
 */

const N3 = require("n3");

const PIM_STORAGE = "http://www.w3.org/ns/pim/space#Storage";
const PIM_STORAGE_PRED = "http://www.w3.org/ns/pim/space#storage";
const CACHE_LIMIT = 5000;

// container URL -> true (it is a storage root) | false (it is not)
const known = new Map();

function remember(container, isRoot) {
  if (known.size >= CACHE_LIMIT) known.clear();
  known.set(container, isRoot);
}

/** True if a Link header value declares rel="type" pim:Storage. */
function declaresStorage(linkHeader) {
  if (!linkHeader) return false;
  return linkHeader.split(/,(?=\s*<)/).some((part) => {
    const m = /^\s*<([^>]*)>(.*)$/s.exec(part);
    if (!m || m[1] !== PIM_STORAGE) return false;
    return /;\s*rel\s*=\s*"?([^";]*)"?/i.exec(m[2])?.[1].split(/\s+/).includes("type");
  });
}

/** The container holding `url` (itself if it is one), without query or fragment. */
function containerOf(url) {
  const u = new URL(url);
  u.hash = "";
  u.search = "";
  return u.pathname.endsWith("/") ? u.href : new URL("./", u).href;
}

/**
 * The storage root `url` is in, by walking up (rule 2 and 3 above), or null
 * when the server does not say.
 *
 * @param {string} url
 * @param {(url: string, init?: object) => Promise<Response>} fetchFn an
 *   authenticated fetch (session.fetch), so a private pod's root can answer.
 */
async function storageRootOf(url, fetchFn) {
  let container = containerOf(url);
  for (;;) {
    let isRoot = known.get(container);
    if (isRoot === undefined) {
      const res = await fetchFn(container, { method: "HEAD" });
      if (!res.ok) return null;
      isRoot = declaresStorage(res.headers.get("link"));
      remember(container, isRoot);
    }
    if (isRoot) return container;
    const up = new URL("../", container).href;
    if (up === container) return null;
    container = up;
  }
}

/**
 * The storage a WebID's owner keeps their data in: the profile's pim:storage
 * when it gives one answer, else the walk from the profile document (rule 1,
 * then 2).
 */
async function storageOfWebId(webId, fetchFn) {
  const doc = webId.split("#")[0];
  try {
    const res = await fetchFn(doc, { headers: { accept: "text/turtle" } });
    if (res.ok) {
      const quads = new N3.Parser({ baseIRI: doc }).parse(await res.text());
      const storages = quads
        .filter((q) => q.subject.value === webId && q.predicate.value === PIM_STORAGE_PRED)
        .map((q) => q.object.value);
      // Several storages: the one holding the profile is the person's own
      // here; if none does, there is no honest single answer, so walk.
      if (storages.length === 1) return storages[0];
      const holding = storages.filter((s) => doc.startsWith(s));
      if (holding.length === 1) return holding[0];
    }
  } catch {
    // An unreadable or unparsable profile: fall through to the walk.
  }
  return storageRootOf(doc, fetchFn);
}

function forgetPodRoots() {
  known.clear();
}

module.exports = { storageRootOf, storageOfWebId, declaresStorage, containerOf, forgetPodRoots };
