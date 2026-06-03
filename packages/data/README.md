# @mindees/data

**Continuum** — a local-first reactive store + sync for MindeesNative.

> Status: 🧪 **Experimental** — the Continuum core (Phases 10A–10D) is implemented and
> tested: the reactive document store, Hybrid Logical Clock causality, CRDT conflict
> resolution (per-field LWW + add-wins OR-Set), and a local-first delta-sync engine
> where two peers converge offline. On-device native persistence and a production sync
> server are 🔬 research tracks (10E/10F). See the repository [STATUS.md](../../STATUS.md).

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
