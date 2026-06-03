/**
 * The Continuum reactive document store — a signals-native, in-memory collection of
 * records keyed by `id`. Reads subscribe fine-grained (per record + per collection),
 * mutations are atomic + coalescing, and optimistic changes can be rolled back. It is
 * the substrate the later sub-phases extend: per-field CRDT merge (10C) operates on a
 * record's fields, and the sync queue (10D) captures these mutations as ops.
 *
 * Built on `@mindees/core` signals only (zero third-party deps), using the same
 * `signal(0, { equals: false })` notify-source idiom as core/router — so a query is
 * just a `() => T[]` accessor the renderer already treats as a reactive region.
 *
 * See `docs/adr/0012-continuum-reactive-store.md`.
 *
 * @module
 */

import { batch, type Signal, signal } from '@mindees/core'
import { DataError } from './errors'

/** A record identifier. */
export type Id = string | number

/** Options for {@link createCollection}. */
export interface CollectionOptions<T> {
  /** Records to seed the collection with (ids must be unique). */
  readonly initial?: readonly T[]
}

/** A handle to an optimistic change (see {@link Collection.optimistic}). */
export interface OptimisticChange {
  /** Keep the change (drop the recorded inverse). */
  commit(): void
  /** Undo the change, restoring the prior state in one batch. */
  rollback(): void
}

/** A reactive, in-memory collection of records keyed by `id`. */
export interface Collection<T extends { id: Id }> {
  /** Reactively read a record by id (subscribes to that record). */
  get(id: Id): T | undefined
  /** Reactively test membership (subscribes to that record). */
  has(id: Id): boolean
  /** Reactively read all records (subscribes to the collection). */
  all(): readonly T[]
  /** Reactively read the records matching `predicate` (linear scan; subscribes to the collection). */
  where(predicate: (record: T) => boolean): readonly T[]
  /** Reactively read the record count (subscribes to the collection). */
  size(): number
  /** A non-reactive snapshot of all records (does not subscribe). */
  snapshot(): readonly T[]
  /** Insert a new record. Throws `DUPLICATE_ID` if the id already exists. */
  insert(record: T): void
  /** Insert or replace a record. */
  upsert(record: T): void
  /**
   * Patch an existing record (object patch or updater fn). Throws `RECORD_NOT_FOUND`
   * if absent and `ID_IMMUTABLE` if the patch changes `id`. The updater fn must return
   * a NEW record — do not mutate `prev` in place (it backs optimistic rollback).
   */
  update(id: Id, patch: Partial<T> | ((prev: T) => T)): void
  /** Delete a record. Returns whether it existed. */
  delete(id: Id): boolean
  /** Remove every record. */
  clear(): void
  /** Run several mutations as one atomic, single-notification transaction. */
  tx<R>(fn: () => R): R
  /**
   * Apply mutations now, returning a handle to `commit()` or `rollback()` them. The
   * block is **atomic** (a throw inside `fn` rolls back its partial mutations and
   * rethrows) and **not reentrant** (throws `OPTIMISTIC_NESTED` if nested).
   */
  optimistic(fn: () => void): OptimisticChange
}

/** Create a reactive {@link Collection}. */
export function createCollection<T extends { id: Id }>(
  options?: CollectionOptions<T>,
): Collection<T> {
  const records = new Map<Id, T>()
  const recordVersions = new Map<Id, Signal<number>>()
  const collectionVersion = signal(0, { equals: false })
  // When set, mutations push an inverse here (drives optimistic rollback).
  let undoLog: Array<() => void> | null = null

  const recordVersion = (id: Id): Signal<number> => {
    let v = recordVersions.get(id)
    if (!v) {
      v = signal(0, { equals: false })
      recordVersions.set(id, v)
    }
    return v
  }

  const recordInverse = (inverse: () => void): void => {
    if (undoLog) undoLog.push(inverse)
  }

  // Raw write + reactivity (no inverse capture). Used by mutations and inverses alike.
  const doSet = (record: T): void => {
    records.set(record.id, record)
    recordVersion(record.id).update((n) => n + 1)
    collectionVersion.update((n) => n + 1)
  }
  const doDelete = (id: Id): void => {
    records.delete(id)
    recordVersion(id).update((n) => n + 1) // notify observers BEFORE GC
    recordVersions.delete(id) // GC the version signal so removed records don't leak
    collectionVersion.update((n) => n + 1)
  }

  if (options?.initial) {
    for (const record of options.initial) {
      if (records.has(record.id)) {
        throw new DataError('DUPLICATE_ID', `duplicate id ${String(record.id)} in initial records`)
      }
      records.set(record.id, record) // no observers yet at construction — skip reactivity
    }
  }

  return {
    get(id) {
      // Present id → subscribe fine-grained to that record. Absent id → subscribe to
      // the collection version (a missing id can only appear via a mutation, which bumps
      // it), so reads of never-existing ids never materialize a permanent per-record signal.
      if (records.has(id)) {
        recordVersion(id)()
        return records.get(id)
      }
      collectionVersion()
      return undefined
    },
    has(id) {
      if (records.has(id)) {
        recordVersion(id)()
        return true
      }
      collectionVersion()
      return false
    },
    all() {
      collectionVersion()
      return [...records.values()]
    },
    where(predicate) {
      collectionVersion()
      const out: T[] = []
      for (const record of records.values()) if (predicate(record)) out.push(record)
      return out
    },
    size() {
      collectionVersion()
      return records.size
    },
    snapshot() {
      return [...records.values()]
    },

    insert(record) {
      if (records.has(record.id)) {
        throw new DataError('DUPLICATE_ID', `record ${String(record.id)} already exists`)
      }
      batch(() => {
        recordInverse(() => doDelete(record.id))
        doSet(record)
      })
    },

    upsert(record) {
      const prev = records.get(record.id)
      batch(() => {
        recordInverse(prev !== undefined ? () => doSet(prev) : () => doDelete(record.id))
        doSet(record)
      })
    },

    update(id, patch) {
      const prev = records.get(id)
      if (prev === undefined) {
        throw new DataError('RECORD_NOT_FOUND', `no record ${String(id)} to update`)
      }
      // Reject a foreign id in either form (the object-patch spread would otherwise
      // silently drop it, making the two forms inconsistent).
      if (typeof patch !== 'function' && 'id' in patch && (patch as { id?: Id }).id !== id) {
        throw new DataError('ID_IMMUTABLE', `cannot change the id of record ${String(id)}`)
      }
      const next =
        typeof patch === 'function'
          ? (patch as (p: T) => T)(prev)
          : ({ ...prev, ...patch, id } as T)
      if (next.id !== id) {
        throw new DataError('ID_IMMUTABLE', `cannot change the id of record ${String(id)}`)
      }
      batch(() => {
        recordInverse(() => doSet(prev))
        doSet(next)
      })
    },

    delete(id) {
      const prev = records.get(id)
      if (prev === undefined) return false
      batch(() => {
        recordInverse(() => doSet(prev))
        doDelete(id)
      })
      return true
    },

    clear() {
      if (records.size === 0) return
      const prevAll = [...records.values()]
      batch(() => {
        recordInverse(() => {
          for (const record of prevAll) doSet(record)
        })
        for (const id of [...records.keys()]) doDelete(id)
      })
    },

    tx(fn) {
      return batch(fn)
    },

    optimistic(fn) {
      // Not reentrant: a nested optimistic block's inverses would not reach the outer
      // log, so the outer rollback couldn't restore them. Fail fast instead.
      if (undoLog !== null) {
        throw new DataError('OPTIMISTIC_NESTED', 'optimistic() cannot be nested')
      }
      const log: Array<() => void> = []
      const replay = (): void => {
        batch(() => {
          for (let i = log.length - 1; i >= 0; i--) log[i]?.()
        })
        log.length = 0
      }
      undoLog = log
      try {
        batch(fn)
      } catch (error) {
        // Keep optimistic application all-or-nothing: undo partial mutations, then rethrow.
        replay()
        throw error
      } finally {
        undoLog = null
      }
      let settled = false
      return {
        commit() {
          settled = true
          log.length = 0 // release the captured inverses (and their snapshots)
        },
        rollback() {
          if (settled) return
          settled = true
          replay()
        },
      }
    },
  }
}
