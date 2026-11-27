/**
 * memberDelegates.js
 *
 * One decision: does member M declare agent A as their agent (acl:delegates)?
 * Kept in one small function so a UMA/ODRL backend can replace it later
 * (solid-kit ADR 002, amendment 2026-11-26).
 *
 * A tier-1 WebID profile (on the owner's own domain, e.g.
 * https://id.openfab.be/profile/card#me) is a static file no app can write,
 * so the backoffice writes acl:delegates in an extended profile in the pod
 * (profile/about.ttl) that the static card links with BOTH rdfs:seeAlso and
 * foaf:isPrimaryTopicOf. Either predicate is followed.
 *
 * The rule, because this decides who may read a collective's graph:
 * - M's profile document is read first, as before (a failure there is the
 *   caller's to handle).
 * - Linked documents count only when their URL lies inside a pim:storage
 *   that M's profile ITSELF declares (prefix match). A profile can link any
 *   document; one outside M's own storage is not M's to vouch with.
 * - One level only: links found inside a linked document are not followed.
 * - A linked document that cannot be read or parsed is ignored; it never
 *   fails the whole check.
 */

const N3 = require("n3");

const ACL_DELEGATES = "http://www.w3.org/ns/auth/acl#delegates";
const PIM_STORAGE = "http://www.w3.org/ns/pim/space#storage";
const LINKS = ["http://www.w3.org/2000/01/rdf-schema#seeAlso", "http://xmlns.com/foaf/0.1/isPrimaryTopicOf"];

const objectsOf = (quads, subject, predicate) =>
  quads.filter((q) => q.subject.value === subject && q.predicate.value === predicate).map((q) => q.object.value);

/** The document a URL lives in: no fragment, or fetching "…/about.ttl#me" would ask for a fragment. */
function documentOf(url) {
  const u = new URL(url);
  u.hash = "";
  return u.href;
}

async function readDocument(url, fetchFn) {
  const res = await fetchFn(url, { headers: { Accept: "text/turtle" } });
  if (!res.ok) {
    const err = new Error(`GET ${url} failed: [${res.status}] ${res.statusText || ""}`.trim());
    if (res.status === 401) err.statusCode = 401;
    throw err;
  }
  return new N3.Parser({ baseIRI: url }).parse(await res.text());
}

/**
 * Whether `member` (a WebID) delegates to `agent`, in its profile or in a
 * document that profile links inside its own storage. Throws when the profile
 * itself cannot be read or parsed (the caller treats that as "no").
 */
async function memberDelegatesTo(member, agent, fetchFn) {
  const profileUrl = documentOf(member);
  const profile = await readDocument(profileUrl, fetchFn);
  if (objectsOf(profile, member, ACL_DELEGATES).includes(agent)) return true;

  // Trailing slash, so https://pod/alice does not cover https://pod/alice-evil/.
  const storages = objectsOf(profile, member, PIM_STORAGE).map((s) => (s.endsWith("/") ? s : s + "/"));
  if (!storages.length) return false;

  const linked = new Set();
  for (const predicate of LINKS) {
    for (const target of objectsOf(profile, member, predicate)) {
      let doc;
      try {
        doc = documentOf(target); // already resolved against the profile by the parser
      } catch {
        continue;
      }
      if (doc !== profileUrl && storages.some((s) => doc.startsWith(s))) linked.add(doc);
    }
  }

  const found = await Promise.all(
    [...linked].map(async (doc) => {
      try {
        return objectsOf(await readDocument(doc, fetchFn), member, ACL_DELEGATES).includes(agent);
      } catch (err) {
        if (err.statusCode === 401) throw err; // the session expired: let the caller re-authenticate
        return false;
      }
    })
  );
  return found.some(Boolean);
}

module.exports = { memberDelegatesTo };
