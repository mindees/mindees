# ADR-0015: Continuum (Phase 10D) — local-first sync engine + transport

- **Status:** Accepted
- **Date:** 2026-06-03

## Context

The store (10A), HLC (10B), and CRDT merge (10C) are local. Phase 10D is Continuum's
headline: a **local-first sync engine** so two replicas that edited **offline**
converge to the same state through a transport — tolerating concurrent edits,
duplicate delivery, and out-of-order pulls — entirely in-process and testable with no
network. Production servers and native persistence stay research tracks; the in-memory
hub is the *real*, tested fallback.

## Decision

### Op — an HLC-stamped, idempotently-applied record mutation
`Op<T>` = `{ id, actor, seq, collection, recordId, hlc } & ({ kind:'set'; value:T } |
{ kind:'del' })`. `id = `${actor}:${seq}`` (monotonic per actor) makes ops **uniquely
identifiable and idempotent** — re-delivering an op is a no-op. The `hlc` (10B) is the
merge key.

### MutationLog — convergent materialized state (record-level LWW, reusing 10C)
`createMutationLog<T>()` holds, per `recordId`, a `LwwRegister<T>` and `apply(op)`
merges via 10C's **`mergeRegister`** (greater HLC wins; same-stamp ties broken by
content). So apply is commutative + idempotent ⇒ the log **converges** regardless of
delivery order/duplication. `get(recordId)` / `records()` read the live (non-tombstoned)
state. (Record-level LWW for v1; per-field `LwwMap` is a documented extension — the op
shape already carries everything a field-grained op would need.)

### Transport contract + in-memory hub
`SyncTransport<T>`: `push(ops): Promise<{ acked }>` and `pull(cursor): Promise<{ ops,
cursor }>` over an opaque, monotonic `cursor`. `createMemoryHub<T>()` is the reference
transport: an **append-only op log**; `push` appends (dedup by op id), `pull` returns
ops after the cursor. It models a server with **no network and no native code**, so the
whole loop runs in a unit test.

### Sync engine
`createSyncEngine<T>({ nodeId, now, transport })` wraps a `Clock`, a `MutationLog`, an
**outbox** of unpushed ops, and a pull cursor:
- `set` / `delete` — a local mutation: stamp `hlc = clock.tick()`, build an op
  (`seq` increments per actor), **apply locally immediately** (optimistic), and enqueue
  it. Reads (`get` / `records`) reflect it at once.
- `sync()` — `push` the outbox, then `pull` since the cursor and `apply` each remote op,
  advancing the cursor. `AbortSignal`-cancellable; **no timers in the core** (the caller
  decides cadence). The engine's own ops returning via `pull` re-apply idempotently.

Because apply is a CvRDT merge and ops are idempotent, the engine needs no separate
rebase: optimistic local state and merged remote state reconcile by HLC.

## Consequences
- Two engines over one hub **converge** after concurrent offline edits, duplicate
  delivery, and out-of-order pulls — the headline, proven in a pure unit test.
- Zero new runtime deps (`@mindees/core` only; ops are plain JSON). The reference hub +
  the engine are the working fallback; a production server (10E) and native persistence
  (10F) are research tracks layered behind the same `SyncTransport` / persistence seams.

### Documented invariants / known hazards
- **`sync()` is not re-entrant** — overlapping calls would double-pull and regress the
  cursor, so a concurrent call coalesces into the in-flight one (guarded; call again
  afterward).
- **Op-id uniqueness** — ids are `${nodeId}:${seq}` and the transport de-dupes by id, so
  a durable replica **must** use a globally-unique `nodeId` **and persist `seq`** across
  restarts; otherwise a reused pair is silently dropped. This in-memory v1 resets `seq`
  on construction — persistence + content-addressed ids land with 10F. (Documented on
  `SyncEngineOptions.nodeId`.)

## Alternatives considered
- **Per-field ops now** — deferred: record-level LWW already converges and is simpler to
  prove; the `Op` shape is forward-compatible with field-grained ops.
- **Operational Transformation** — rejected: needs a central authority + transforms;
  CvRDT merge converges without coordination.
- **A real WebSocket/HTTP transport in the core** — rejected: keeps `node:`/DOM out of
  the device path; the hub is in-memory and a `node:http`/WS adapter is the 10E example
  (mirroring Pulse 9C).
- **Content-addressed (hashed) op ids** — deferred: `${actor}:${seq}` is unique and
  idempotent without a hash dependency; hashing can be added later if dedup across
  re-keyed actors is needed.
