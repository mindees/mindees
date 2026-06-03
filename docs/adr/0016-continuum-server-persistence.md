# ADR-0016: Continuum (Phase 10E/10F) — reference sync server + persistence

- **Status:** Accepted
- **Date:** 2026-06-03

## Context

The Continuum core (10A–10D) delivers the reactive store, causality, CRDT merge, and a
sync engine that converges two peers through a `SyncTransport`. This ADR closes Phase
10 with the two pieces a real deployment needs, behind the same capability seams:
**10E** a reference sync *server* (the durable counterpart of the in-memory hub) and
**10F** a *persistence* contract so a replica survives restart — which also fixes the
10D op-id hazard (a restarted replica that resets `seq` would collide ids). Both stay
pure-TS, Hermes-safe, zero-new-deps; native/IndexedDB/CRDT-lib backends are labeled
research tracks.

## Decision

### 10E — reference sync server (`@mindees/data/server`)
An **injected, append-only op log** + a pure server that serves the transport:
- `OpLogStore<T>` — `append(ops) → { acked }` (de-dupes by op id) and `since(cursor) →
  { ops, cursor }`. `createMemoryOpLog<T>()` is the reference; a DB/object-store backs
  it later without touching the server.
- `createSyncServer<T>({ log })` — implements `SyncTransport<T>` server-side (`push →
  log.append`, `pull → log.since`). It is the durable generalization of 10D's
  `createMemoryHub` (which stays the zero-config in-memory shortcut). The server **never
  signs and never trusts blindly**: it stores ops verbatim and lets each client validate
  on apply (the engine already HLC-validates pulled ops).
- A thin `node:http` adapter lives in `examples/data-sync-server/` (mirrors
  `examples/pulse-server`): `POST /sync/push`, `GET /sync/pull?cursor=`. The only
  Node-specific code; the core is tested in-memory.

### 10F — persistence (`@mindees/data/persist`) + durable replicas
- `Persistence` — `load(key) → string | null` and `save(key, value)`: a minimal async
  key/value capability (mirrors the CLI's `FileSystem` / Pulse's `UpdateStorage`).
  `createMemoryPersistence()` is the reference; web `localStorage`/IndexedDB and native
  SQLite are research-track adapters (STATUS).
- The sync engine gains `export(): SyncSnapshot<T>` (serializable: `seq`, `cursor`, and
  the applied ops) and a `snapshot?` restore option on `createSyncEngine`. An app
  persists `engine.export()` via any `Persistence` and restores it on next launch — so
  `seq` survives restart and op ids never collide (closing the 10D hazard). Restore
  replays the snapshot's ops into the materialized log and resumes `seq`/`cursor`.

### Interop research tracks (documented, not faked)
Yjs (pure-JS rich-text adapter), Automerge/Loro (Node/web-only, WASM) interop and
native persistence are listed in STATUS as 🔬 research tracks with the in-memory
fallback as the real, tested path.

## Consequences
- A runnable end-to-end loop: clients ↔ `node:http` server over a persistent op log,
  and replicas that resume after restart with stable identity — all pure-TS + tested
  in-memory, zero new runtime deps.
- The `OpLogStore` and `Persistence` seams let a production DB/native backend slot in
  later without changing the engine, server, or client.

## Alternatives considered
- **Per-client version-vector cursors** instead of a single monotonic log cursor —
  deferred: the append-only log + opaque cursor converges and is simpler; VV-based
  diffing is an additive `OpLogStore` capability later.
- **Auto-persisting engine (async factory that loads on construct)** — rejected for v1:
  an explicit `export()`/`snapshot` keeps `createSyncEngine` synchronous and lets the
  app own the persistence cadence; an async `loadSyncEngine` helper can wrap it later.
- **A real WebSocket push server in the package** — rejected: keeps `node:`/sockets out
  of the device path; the `node:http` adapter is an example, like Pulse 9C.
