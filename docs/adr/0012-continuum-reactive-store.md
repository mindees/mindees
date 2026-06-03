# ADR-0012: Continuum (Phase 10A) — the reactive local-first document store

- **Status:** Accepted
- **Date:** 2026-06-03

## Context

Phase 10 (`@mindees/data`, **Continuum**) is a local-first reactive store + delta
sync + conflict resolution. Research (live-verified) settled the foundational choice:
**Automerge and Loro are Rust→WASM** (35 MB / 18 MB of `.wasm`) and **cannot run on
Hermes** (no WebAssembly engine), so they're disqualified from the device path; **Yjs**
is the only pure-JS mainstream CRDT but is a sequence/text engine that owns its own
model and reactivity — wrong shape for a v1 app-state store. The decision: **hand-roll
a small, pure-TS, capability-injected core on `@mindees/core` signals, with zero new
runtime dependencies** (exactly as the Pulse delta codec was hand-rolled), sub-phased
10A–10F. This ADR covers **10A — the reactive document store** (the offline-usable
foundation the later CRDT/sync sub-phases build on).

## Decision

`createCollection<T extends { id: Id }>()` is a signals-native, in-memory collection
of records keyed by `id`. It is the reactive substrate; CRDT merge (10C) and sync
(10D) layer on top without changing this surface.

### Reactive reads (fine-grained, no renderer changes)
Reads subscribe when called inside a tracking scope (a `computed`/`effect`/render
region), via the **same `signal(0, { equals: false })` notify-source idiom already
shipped in core/router**:
- **`get(id)` / `has(id)`** subscribe to a **per-record** version signal (lazily
  created), so only observers of *that* record re-run when it changes.
- **`all()` / `where(pred)` / `size()`** subscribe to one **collection** version
  signal (they scan, so they must re-run on any change). `where` is a documented
  linear scan in v1; the accessor contract is index-agnostic, so indexes are a
  non-breaking future addition.
- **`snapshot()`** is a non-reactive (`peek`) read.

A query is therefore just a `() => T[]` accessor the renderer already treats as a
fine-grained reactive region — **no renderer changes**.

### Mutations (atomic, reactivity-coalescing)
`insert` (insert-only; throws on duplicate id), `upsert` (insert-or-replace),
`update(id, patch | fn)` (patch an existing record; throws if missing; `id` is
immutable), `delete`, `clear`. Each mutation runs in a `batch()` and bumps the touched
record's version + the collection version once. `tx(fn)` batches many mutations into a
**single** reactive notification. Records are treated as **immutable** — `update`
produces a new object (`{ ...prev, ...patch, id }`); callers must not mutate stored
objects in place (documented).

### Optimistic updates (pre-sync primitive)
`optimistic(fn)` applies mutations immediately and records an **inverse** for each,
returning `{ commit(), rollback() }`: `rollback()` replays the inverses in reverse (in
one batch) to restore the prior state, `commit()` drops them. This is the local half
of optimistic-then-reconcile; the sync engine (10D) drives commit/rollback on
server ack/reject.

### Errors + leak safety
`DataError` carries a stable `DataErrorCode` (`DUPLICATE_ID`, `RECORD_NOT_FOUND`,
`ID_IMMUTABLE`, `OPTIMISTIC_NESTED`), mirroring `UpdateError`. The store never
accumulates signals for ids that aren't live: a read of an **absent** id subscribes to
the collection version (it can only appear via a mutation, which bumps that) rather
than materializing a per-record signal, and `delete`/`clear` GC the per-record signal.
`optimistic()` is **atomic** (a throw inside the block rolls back its partial mutations
and rethrows) and **not reentrant** (nesting throws `OPTIMISTIC_NESTED`).

## Consequences
- A real, offline-usable reactive database that drops straight into the renderer and
  unblocks app code, with **zero new runtime dependencies** (`@mindees/core` only).
- Built so 10B (HLC), 10C (CRDT merge), and 10D (sync) extend it: a record's fields
  become the unit the per-field LWW merge (10C) operates on, and mutations are the ops
  the sync queue (10D) captures.
- `@mindees/data` maturity moves scaffold → 🧪 experimental once 10A lands; native
  persistence, a production sync server, and rich-text CRDTs remain labeled research
  tracks (later sub-phases / STATUS.md).

## Alternatives considered
- **Depend on Yjs / TinyBase / TanStack DB / Legend-State** — rejected for the core:
  each brings a second reactive graph that breaks fine-grained renderer integration;
  Yjs also imposes its own doc/encoding model. Yjs stays a documented optional
  `@experimental` rich-text adapter behind the same interface.
- **Coarse single-version reactivity** (one signal, every query re-runs on any
  mutation) — rejected: it abandons the framework's fine-grained model. Per-record +
  per-collection signals keep `get(id)` isolated.
- **`update` as upsert** — rejected: distinct `insert` / `update` / `upsert` with
  explicit errors is clearer and catches bugs; `update` on a missing record throws.
