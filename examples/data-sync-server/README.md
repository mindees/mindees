# Continuum reference sync server

A runnable `node:http` adapter for the **Continuum** reference sync server
([`@mindees/data/server`](../../packages/data/src/server.ts)).

The append/serve logic lives in the pure, unit-tested `createSyncServer` core (over an
injected `OpLogStore`); this example is **only the HTTP wiring**. In a real deployment
you'd back `createMemoryOpLog` with a database or object store. See
[ADR-0016](../../docs/adr/0016-continuum-server-persistence.md).

## Run

```bash
pnpm --filter @mindees/data build
pnpm --filter @mindees/example-data-sync-server start
```

Then point a `@mindees/data` sync client's transport at it:

```ts
import { createSyncEngine } from '@mindees/data'

const transport = {
  push: (ops) =>
    fetch('http://localhost:4500/sync/push', { method: 'POST', body: JSON.stringify(ops) }).then((r) => r.json()),
  pull: (cursor) =>
    fetch(`http://localhost:4500/sync/pull?cursor=${cursor ?? ''}`).then((r) => r.json()),
}
const engine = createSyncEngine({ nodeId: 'device-1', transport })
```

## Endpoints

| Method & path | Body / query | Returns |
| --- | --- | --- |
| `POST /sync/push` | an array of `Op` | `{ acked: string[] }` |
| `GET /sync/pull?cursor=N` | `cursor` (omit for the start) | `{ ops: Op[], cursor: number }` |

The server **never signs and never trusts blindly** — it stores ops verbatim; each
client validates on apply (the engine HLC-validates pulled ops, skipping malformed or
far-future ones).
