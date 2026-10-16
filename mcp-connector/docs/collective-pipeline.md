# The collective's pipeline: pull as code, any format, a trigger

**Status: deferred.** Written 2026-10-16, after reviewing the procedures
against what was live. To start once the migration from pocpod0 is
confirmed (`pocpod0/docs/design/solid-css-overlay-plan.md`): it changes the
connector, and the connector is built here, not in pocpod0.

Order agreed: **A → B → D → C.** Until C, pull and confrontation still run by
hand, from claude.ai or Hermes.

## Where we are

- **Nothing runs on its own.** Pull and confrontation
  ([`../procedures/`](../procedures/README.md)) have only been run by hand,
  from a claude.ai session on the collective agent's connector. The
  `as:Announce` in the collective's `inbox/` says "follow this folder"; no
  process reads it.
- **Only text gets through.** The procedures copy a file by passing its
  content through the LLM: read, then write it back. Three limits break that:
  - `solid_read_resource` reads with `res.text()`: a `.docx`, `.pdf` or
    image comes back corrupted;
  - a tool call's body is capped near 100 kB (`MAX_BODY_BYTES`): a Markdown
    export from Google Docs with images inlined as base64 runs to several MB,
    so it cannot be written back, and it floods the agent's context first;
  - pull §4f therefore marks binaries `binaire-en-attente` (the 6 MB PNG of
    the 2026-10-01 run).
- **What's waiting:** Xavier tried `.docx`, `.pdf`, pictures, and Markdown
  with base64 images. His share is held back until this works. The folder he
  will pick holds a backlog.

**Bytes must stop passing through the LLM.** No change to the procedures'
wording fixes that.

## Identities: one WebID per agent

Every agent has its own WebID; no WebID is shared by two agents (Nicolas,
2026-10-16). Hermes runs MCP clients and has been tested against this
connector.

That splits the collective's side in two:

| Who | WebID | Holds | Does |
|---|---|---|---|
| the **puller** (code, in this connector) | `hs:agent`, the one members grant Read to | Read on members' shared folders; Read `inbox/`; Write `depots/` | follows announcements, snapshots, writes derived text |
| the **confronter** (LLM: Hermes, or claude.ai by hand) | its own | Read `depots/`, `principles/`; Write `confrontations/`, `chantiers/` | confronts, writes report + sidecar, loads the graph |

- **Members grant one WebID, once.** Changing which LLM confronts, or
  running two, never asks members to grant again: the confronter's rights
  are on the collective's pod, given by its admin.
- **Needs an amendment to solid-kit ADR 006**: §1 and §5 name a single
  collective agent; §6 says only `hs:agent` loads the graph. Either the
  confronter is declared in `config.ttl` (a new property beside `hs:agent`)
  and `graph_ingest` accepts it, or ingest also runs as code on each new
  sidecar. To settle before C.

## A. Pull as code

A connector feature acting as `hs:agent`, with no LLM in the path:

- **`solid_snapshot(source, target)`**, the primitive: GET with the agent's
  own credentials, PUT the same bytes with the same `Content-Type`, return
  size, a content hash and the source's keys. Any format, any size up to a
  cap. Keeps pull rule 5 (exact bytes) by construction.
- **The pull itself** (`procedure-pull.md` steps 1–6) as code: read
  announcements, check membership on both sides, list each source, compare
  keys, snapshot, write `provenance.ttl` and `sources.ttl`, report. Exposed
  as a tool (`collective_pull`) so claude.ai and Hermes can trigger it by
  hand, and callable by C without any LLM.
- **Hash the bytes** (ADR 006 §3, "only when the bytes changed"): CSS's ETag
  holds no content hash, so a re-save with the same content would otherwise
  make a new snapshot.
- `procedure-pull.md` v3 becomes the specification of this code and the
  report's reader, not steps an LLM performs.

## B. Derived text, for confrontation

ADR 001 and ADR 006 §3: text extracted from a file is an index, not truth.
The puller writes it beside the original, under a name that cannot be
mistaken for it (for example `<file>.texte.md`), and `provenance.ttl`
names both.

| Source | Derived text |
|---|---|
| `.md`, `.txt` | as is, with each `data:` URI (base64 image) replaced by `[image: <alt>, <type>, <size>]` |
| `.docx`, `.odt` | pandoc (or mammoth for `.docx`) |
| `.pdf` | pdftotext; no text (a scan) is flagged, not guessed |
| images | none at first: confronted from name, size and metadata, and flagged; later a vision model's description, marked as such |
| anything else | none; snapshotted, marked `format-non-lu` |

Confrontation reads the derived text only; the original stays untouched in
its snapshot. A size cap on derived text sent to the confronter (truncate
and say so).

## D. Ready for a backlog

- **Batches**: confrontation takes at most *K* pending snapshots per run,
  oldest first. "Pending" is already defined by the absence of a report, so
  the rest simply wait for the next run.
- **Before the first share, say what will be published**: in the
  backoffice's Share panel, the number of files, their types and total size
  in the folder picked (solid-backoffice; a share publishes everything
  inside, which makes the consent heavier with a backlog).
- **Limits**: a maximum size per file; an unread format is snapshotted and
  marked, never refused silently.

## C. The trigger: webhooks from CSS, polling behind

ADR 006 §4 already chose CSS notifications (`WebhookChannel2023`) with a
poll as fallback. With the pull as code, the connector receives them
itself:

1. **The collective's `inbox/`.** The puller subscribes to it as
   `hs:agent` (container topic: `Add`). On each `Add`, it GETs the new item
   with its own credentials (the notification's body is never trusted). An
   `as:Announce` from a member or a member's declared agent: record the
   source, subscribe to it, pull it now. An `as:Undo`: mark it and
   unsubscribe. Anything else: leave it for the backoffice.
2. **Each followed folder.** Container topic: `Add`/`Remove` give new and
   removed files. Edits to an existing file may not reach the container's
   channel (open in ADR 006): subscribe to each file (`Update`), or leave
   edits to the poll. A settle delay per file (ADR 006 §3) turns a series
   of saves into one snapshot.
3. **Behind it, a scheduled pass**: conditional GETs on every followed
   source, for servers without notifications and for anything missed while
   the connector was down; and re-subscription before CSS drops channels
   (14 days by default).
4. **Then the confronter.** After a pull that created snapshots, the
   confronter runs: a Hermes cron that confronts when something is pending
   (cheap to check), or a call from the connector to Hermes. Batches as in D.

What it needs: a webhook route on the connector reachable by every server a
member's pod lives on (public, through the gateway; the CSS signature
checked as defence in depth, the GET staying the authority), and
subscriptions that survive a restart (stored, re-created at boot).

## Elsewhere, when this starts

- **solid-kit ADR 006**: §1/§5/§6 for the puller and the confronter; §3 for
  derived-text naming and the hash; §4 for the webhook living in the
  connector.
- **solid-backoffice**: the summary before sharing (D).
- **Each collective's pod copy** of the procedures (`hs:procedures`):
  updated by its admin when pull v3 ships.
