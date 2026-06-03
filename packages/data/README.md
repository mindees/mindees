# @mindees/data

**Continuum** — a local-first reactive store + sync for MindeesNative.

> Status: 🧪 **Experimental** (Phase 10A — the reactive document store). A
> signals-native, in-memory collection with fine-grained reactive reads is implemented
> and tested. HLC causality (10B), CRDT conflict resolution (10C), and the delta-sync
> engine (10D) build on it. On-device native persistence and a production sync server
> are 🔬 research tracks. See the repository [STATUS.md](../../STATUS.md).

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
  `{ commit(), rollback() }`; `rollback()` restores the prior state in one batch. (The
  local half of optimistic-then-reconcile; the sync engine will drive it.)
- **Stable errors** — `DataError` with a `DataErrorCode`
  (`DUPLICATE_ID` / `RECORD_NOT_FOUND` / `ID_IMMUTABLE`).

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

Design rationale: [ADR-0012](../../docs/adr/0012-continuum-reactive-store.md).

## License

`MIT OR Apache-2.0`
