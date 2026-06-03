/**
 * The Continuum reference **sync server** (10E) — the durable counterpart of 10D's
 * in-memory hub. `createSyncServer` serves the {@link SyncTransport} contract over an
 * **injected, append-only op log** (`OpLogStore`), so a DB/object-store backend slots
 * in later without touching the server. It never signs and never trusts blindly: ops
 * are stored verbatim and each client validates on apply (the engine HLC-validates
 * pulled ops). Pure-TS; a `node:http` adapter lives in `examples/data-sync-server/`.
 * See `docs/adr/0016-continuum-server-persistence.md`.
 *
 * @module
 */

import type { Cursor, Op, SyncTransport } from './sync'

/** An injected, append-only op log the server reads/writes (de-dupes by op id). */
export interface OpLogStore<T> {
  /** Append ops not already present; resolves with the ids accepted (incl. already-known). */
  append(ops: readonly Op<T>[]): Promise<{ readonly acked: readonly string[] }>
  /** Ops after `cursor` (null = from the beginning), plus the new cursor. */
  since(cursor: Cursor | null): Promise<{ readonly ops: readonly Op<T>[]; readonly cursor: Cursor }>
}

/** An in-memory reference {@link OpLogStore}. */
export function createMemoryOpLog<T>(): OpLogStore<T> {
  const log: Op<T>[] = []
  const seen = new Set<string>()
  return {
    append(ops): Promise<{ acked: string[] }> {
      const acked: string[] = []
      for (const op of ops) {
        if (!seen.has(op.id)) {
          seen.add(op.id)
          log.push(op)
        }
        acked.push(op.id)
      }
      return Promise.resolve({ acked })
    },
    since(cursor): Promise<{ ops: Op<T>[]; cursor: Cursor }> {
      const from = cursor ?? 0
      return Promise.resolve({ ops: log.slice(from), cursor: log.length })
    },
  }
}

/** A sync server — the server side of the {@link SyncTransport} contract. */
export type SyncServer<T> = SyncTransport<T>

/** Create a {@link SyncServer} backed by an injected {@link OpLogStore}. */
export function createSyncServer<T>(options: { readonly log: OpLogStore<T> }): SyncServer<T> {
  const { log } = options
  return {
    push: (ops) => log.append(ops),
    pull: (cursor) => log.since(cursor),
  }
}
