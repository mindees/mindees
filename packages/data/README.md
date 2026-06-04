# @mindees/data

**Continuum** — a local-first reactive store + sync for MindeesNative.

> Status: 🧪 **Experimental** — Continuum Phases 10A–10F are implemented and tested:
> the reactive document store, Hybrid Logical Clock causality, CRDT conflict resolution
> (per-field LWW + add-wins OR-Set), a local-first delta-sync engine where two peers
> converge offline, a capability-injected reference sync server, and a persistence
> contract with export/restore. Native durable adapters, production sync hardening, and
> CRDT-library/rich-text interop are 🔬 research tracks. See the repository
> [STATUS.md](../../STATUS.md).

## What works today

`createCollection<T>()` — a reactive, in-memory collection of records keyed by `id`,
built on `@mindees/core` signals (zero third-party dependencies):

- **Fine-grained reactive reads** — `get(id)` / `has(id)` subscribe to *that record*
  (per-record version signal); `all()` / `where(pred)` / `size()` subscribe to the
  collection. A query is just a `() => T[]` accessor the renderer treats as a reactive
  region, so `get`/`update` re-render exactly what changed. `snapshot()` reads
  non-reactively.
- **Atomic mutations** — `insert` (insert-only), `upsert`, `update(id, patch | fn)`,
  `delete`, `clear`, and `tx(fn)` to batch many mutations into one notification.
  Records are treated as immutable (update produces a new object).
- **Optimistic changes** — `optimistic(fn)` applies immediately and returns
  `{ commit(), rollback() }`; `rollback()` restores the prior state in one batch.
- **Stable errors** — `DataError` with a `DataErrorCode`
  (`DUPLICATE_ID` / `RECORD_NOT_FOUND` / `ID_IMMUTABLE`).

The package also ships the sync and durability pieces that build on the store:

- **Causality primitives** — `createClock`, HLC encode/decode/compare helpers, and
  version vectors for drift-guarded causal ordering.
- **CRDT conflict helpers** — per-field LWW Register/Map and add-wins OR-Set merge
  utilities, property-tested for convergence.
- **Delta sync** — `createSyncEngine`, `createMutationLog`, `createMemoryHub`, and the
  `SyncTransport` contract for optimistic local writes plus push/pull/merge.
- **Reference sync server** — `createSyncServer` from `@mindees/data/server` over an
  injected `OpLogStore`, with a runnable `node:http` example in
  [`examples/data-sync-server`](../../examples/data-sync-server).
- **Persistence contract** — `Persistence`, `createMemoryPersistence`, and engine
  `export()`/restore so replicas keep stable identity across restarts.

```ts
import { createCollection } from '@mindees/data'
import { effect } from '@mindees/core'

const todos = createCollection<{ id: string; text: string; done: boolean }>()
todos.insert({ id: 't1', text: 'Ship Continuum', done: false })

// A fine-grained reactive query — re-runs only when t1 changes:
effect(() => console.log(todos.get('t1')?.done))

todos.update('t1', { done: true }) // logs: true

// Optimistic update with rollback on server reject:
const change = todos.optimistic(() => todos.update('t1', { text: 'edited' }))
// …later: change.commit()  // or change.rollback()
```

Design rationale: [ADR-0012](../../docs/adr/0012-continuum-reactive-store.md),
[ADR-0013](../../docs/adr/0013-continuum-hlc-causality.md),
[ADR-0014](../../docs/adr/0014-continuum-crdt.md),
[ADR-0015](../../docs/adr/0015-continuum-sync-engine.md), and
[ADR-0016](../../docs/adr/0016-continuum-server-persistence.md).

## License

`MIT OR Apache-2.0`
