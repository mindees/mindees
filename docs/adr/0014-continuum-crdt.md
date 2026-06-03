# ADR-0014: Continuum (Phase 10C) — CRDT conflict resolution (LWW + add-wins OR-Set)

- **Status:** Accepted
- **Date:** 2026-06-03

## Context

With the reactive store (10A) and HLC causality (10B) in place, Continuum needs a
**deterministic merge**: two replicas that edited offline must converge to the same
state regardless of message order, duplication, or delay. Research settled that
**app-state** (records, fields, sets) is fully served by a small set of state-based
CRDTs (CvRDTs) — full sequence/rich-text CRDTs (the hard part) are deferred to an
optional Yjs adapter. This ADR ships that subset, pure-TS and exhaustively
property-tested, keyed by the 10B HLC stamp so merge and sync share one ordering.

## Decision

Three plain-JSON, state-based CRDTs whose `merge` is commutative, associative, and
idempotent (the CvRDT laws ⇒ convergence):

### LWW-Register (`lww.ts`)
`LwwRegister<V>` is a value (or a delete tombstone) tagged with an `Hlc` stamp:
`{ stamp, op: 'set', value } | { stamp, op: 'del' }`. `mergeRegister` keeps the
register with the **greater stamp** (`compareHlc`). A stamp-only compare would
**diverge** if two *different* registers shared a stamp (reachable via a reused
`nodeId` across clock instances, or a hostile peer replaying a stamp), so a same-stamp
tie is broken **by content**, deterministically and order-independently: **delete wins**
over set, and two sets break by a stable serialization order. This keeps `merge`
commutative even on adversarial input.

### LWW-Map (`lww.ts`) — **per-field**, the key practical win
`LwwMap<V>` is `Record<field, LwwRegister<V>>`. `mergeLwwMap` merges **each field
independently** (union of fields, `mergeRegister` per field), so concurrent edits to
*different* fields of the same record both survive — unlike naïve whole-record LWW.
`lwwSet`/`lwwDelete` apply against the existing field via `mergeRegister` (a stale
stamp can never regress a field); `lwwGet`/`lwwHas`/`lwwKeys` read the live (`op:'set'`)
fields. This is the per-record field merge the store (10A) records use.

### Add-wins OR-Set (`or-set.ts`)
`OrSet` of string elements: `{ adds: Record<element, tag[]>, removed: Record<tag,
true> }`. Each `add` records a globally-unique **tag** (the caller supplies one, e.g.
`encodeHlc(clock.tick())` — unique per event incl. `nodeId`); `remove` tombstones the
tags it has **observed**. An element is present iff it has an add-tag not in `removed`,
so a concurrent add (a tag the remover never saw) **wins** over a remove. `mergeOrSet`
unions `adds` (per element) and `removed`.

### Safety + verification
All merges build results on `Object.create(null)` and read via `Object.hasOwn`, so an
untrusted `__proto__`/`constructor` field or element can't pollute or vanish.
`fast-check` proves, for both `mergeLwwMap` and `mergeOrSet`: **commutativity**
(`merge(a,b) ≡ merge(b,a)`), **associativity**, **idempotence** (`merge(a,a) ≡ a`), and
**convergence** — applying a random op set to N replicas in arbitrary (permuted +
duplicated) merge orders reaches one identical state. Add-wins semantics
(concurrent add beats remove) is asserted directly.

## Consequences
- A record in the store can be represented/merged field-by-field with `LwwMap`, and
  set-valued fields with `OrSet`; the sync engine (10D) merges remote ops into local
  state with these, gaining convergence for free.
- Pure-TS, plain-JSON, zero new runtime deps. The merge key is the 10B `Hlc` — one
  ordering mechanism shared by local merge and sync.

## Alternatives considered
- **Whole-record LWW** — rejected: loses concurrent edits to different fields.
  Per-field LWW-Map keeps both.
- **Remove-wins / 2P-Set** — rejected: a removed element can never be re-added.
  Add-wins (observed-remove) matches user expectation (re-adding works; concurrent add
  beats remove).
- **A general CRDT over arbitrary-typed elements** — deferred: OR-Set is string-keyed in
  v1 (covers tags/ids/membership); arbitrary elements need a stable key strategy.
- **Tombstone garbage collection** (causal stability) — deferred + documented: `removed`
  tags and `del` registers accumulate. Acceptable for v1; GC is future work.
