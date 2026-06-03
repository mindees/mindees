# ADR-0013: Continuum (Phase 10B) — Hybrid Logical Clocks + version vectors

- **Status:** Accepted
- **Date:** 2026-06-03

## Context

The reactive store (10A) is local-only. To merge concurrent edits (10C) and sync
(10D), Continuum needs **causality primitives**: a way to order events across replicas
with no central coordinator, and a compact summary of "what each replica has seen".
This ADR covers those primitives. They are pure, tiny, and exhaustively
property-tested, matching the doctrine (pure-TS, Hermes-safe, capability-injected
clock, zero runtime deps).

## Decision

### Hybrid Logical Clock (`hlc.ts`)
An `Hlc` is `{ wallMs, counter, nodeId }` — physical wall-clock milliseconds plus a
logical counter that breaks ties when wall time doesn't advance, plus the replica's
`nodeId`. It tracks physical time closely (good for TTL/debugging) while guaranteeing a
**monotonic, total causal order** (the classic Kulkarni et al. HLC).

`createClock({ nodeId, now })` — `now` is the **injected** physical clock
(`() => Date.now()` by default), so tests are fully deterministic:
- **`tick()`** (a local event / send): `pt = now()`; if `pt > last.wallMs` →
  `(pt, 0)`, else `(last.wallMs, last.counter + 1)`.
- **`update(remote)`** (on receive): `w = max(last.wallMs, remote.wallMs, now())`; the
  counter is `max(local,remote)+1` / `local+1` / `remote+1` / `0` depending on which
  of the three supplied `w` — so the result is strictly greater than **both** the
  previous local timestamp and the received one.
- **`peek()`** returns the current timestamp without advancing.

`compareHlc(a, b)` is the total order `(wallMs, counter, nodeId)`. `encodeHlc` produces
a **lexicographically-sortable** fixed-width string (`wallMs`:`counter`:`nodeId`) so
HLCs sort correctly as plain strings (for transport, indexing, and content-addressed
keys); `decodeHlc` is its inverse (splitting on the first two `:` so a `nodeId`
containing `:` round-trips).

### Version vector (`version-vector.ts`)
A `VersionVector` is `Readonly<Record<nodeId, number>>` mapping each replica to the
highest op sequence number seen from it — the standard "what have I seen" summary the
sync layer (10D) diffs to compute deltas. Pure helpers: `vvGet`, `vvObserve` (raise one
entry to `max(current, seq)`), `vvMerge` (per-key max), `vvDominates` (does `a` cover
all of `b`?), `vvEquals`. All return new objects (immutable).

### Verification
`fast-check` property tests assert the load-bearing laws:
- **HLC monotonicity** — any sequence of `tick()` / `update(arbitrary remote)` yields a
  strictly increasing local timestamp; `update(remote)` always returns a timestamp
  greater than `remote`.
- **Total order** — `compareHlc` is irreflexive/antisymmetric/transitive/total over
  random HLCs, and `encodeHlc` string-sort order matches `compareHlc`.
- **Version vector** — `vvMerge` is commutative/associative/idempotent and dominates
  both inputs; `vvDominates`/`vvObserve` behave as specified.

## Consequences
- 10C tags every field write with an `Hlc` stamp (its per-field LWW merge key) and 10D
  diffs `VersionVector`s to sync only missing ops — one ordering mechanism shared by
  merge and sync, never two competing ones.
- `fast-check` is added to `@mindees/data` devDependencies (pure-JS, test-only). No new
  runtime dependency.

## Alternatives considered
- **Lamport clocks** — rejected: lose wall-clock proximity (no TTL/debug affinity),
  same ordering power as HLC but less useful metadata.
- **Pure wall-clock LWW** — rejected: ties and backward clock steps break monotonicity;
  the HLC counter fixes both deterministically.
- **Vector clocks for per-event ordering** — rejected as the event timestamp: they grow
  O(replicas) per event. Version vectors are used only as the sync *cursor* (one per
  replica state), where that size is appropriate; HLC orders individual events in O(1).

## Op encoding note
Content-addressed **op** encoding (canonical bytes + SHA-256 op ids) lands with the
`Op` type in the sync engine (10D), reusing the `stableStringify` + `@noble/hashes`
pattern already shipped in `@mindees/updates`; it is deliberately not pre-built here
without its consumer.
