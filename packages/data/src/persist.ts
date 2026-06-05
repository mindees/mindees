/**
 * Persistence (10F) — a minimal async key/value capability so a Continuum replica
 * survives restart (mirrors the CLI's `FileSystem` / Pulse's `UpdateStorage`). Persist a
 * sync engine's {@link "./sync".SyncEngine.export snapshot} through any `Persistence`
 * and restore it on next launch, so `seq` survives and op ids never collide.
 *
 * `createMemoryPersistence` is the reference; `createWebStoragePersistence` adapts a Web Storage
 * (`localStorage`/`sessionStorage`); {@link persistEngine} wires auto-save + restore so a replica is
 * durable with one call. See `docs/adr/0016-continuum-server-persistence.md`.
 *
 * @module
 */

import {
  createSyncEngine,
  type SyncEngine,
  type SyncEngineOptions,
  type SyncSnapshot,
} from './sync'

/** A minimal async key/value store for persisting Continuum state. */
export interface Persistence {
  /** Read a value, or `null` if absent. */
  load(key: string): Promise<string | null>
  /** Write a value. */
  save(key: string, value: string): Promise<void>
}

/** An in-memory reference {@link Persistence} for tests and as a contract example. */
export function createMemoryPersistence(): Persistence {
  const store = new Map<string, string>()
  return {
    load: (key) => Promise.resolve(store.get(key) ?? null),
    save: (key, value) => {
      store.set(key, value)
      return Promise.resolve()
    },
  }
}

/** The synchronous Web Storage shape (`localStorage`/`sessionStorage`), injected so this stays DOM-free. */
export interface WebStorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

/**
 * Adapt a Web Storage (`localStorage`/`sessionStorage`) to {@link Persistence}. Inject the storage
 * (`createWebStoragePersistence(localStorage)`) rather than reaching for a global, so it runs in any
 * environment and tests. Storage is synchronous; the async contract is satisfied trivially.
 */
export function createWebStoragePersistence(storage: WebStorageLike): Persistence {
  return {
    load: (key) => Promise.resolve(storage.getItem(key)),
    save: (key, value) => {
      storage.setItem(key, value)
      return Promise.resolve()
    },
  }
}

/** Load + parse a persisted {@link SyncSnapshot}, or `undefined` if absent / unparseable. */
export async function loadSnapshot<T>(
  persistence: Persistence,
  key: string,
): Promise<SyncSnapshot<T> | undefined> {
  const raw = await persistence.load(key)
  if (raw === null) return undefined
  try {
    return JSON.parse(raw) as SyncSnapshot<T>
  } catch {
    // A corrupt/partial blob must not wedge startup — start fresh rather than throw.
    return undefined
  }
}

/**
 * Wrap a {@link SyncEngine} so every mutation (`set`/`delete`) and `sync()` auto-saves its snapshot
 * to `persistence` under `key`. Saves are SERIALIZED (chained) so a burst of edits can't write an
 * older snapshot last, and failures are swallowed (best-effort durability never breaks a mutation).
 * To RESTORE on next launch, pass `snapshot: await loadSnapshot(...)` into the engine first —
 * {@link createPersistentEngine} does both.
 */
export function persistEngine<T>(
  engine: SyncEngine<T>,
  persistence: Persistence,
  key: string,
): SyncEngine<T> {
  let chain: Promise<void> = Promise.resolve()
  const save = (): void => {
    const snapshot = JSON.stringify(engine.export())
    chain = chain
      .then(() => persistence.save(key, snapshot))
      .then(
        () => undefined,
        () => undefined,
      )
  }
  return {
    ...engine,
    set(collection, recordId, value) {
      const op = engine.set(collection, recordId, value)
      save()
      return op
    },
    delete(collection, recordId) {
      const op = engine.delete(collection, recordId)
      save()
      return op
    },
    async sync(signal) {
      await engine.sync(signal)
      save()
    },
  }
}

/** Options for {@link createPersistentEngine}: a {@link SyncEngineOptions} minus `snapshot` (loaded here). */
export interface PersistentEngineOptions<T> extends Omit<SyncEngineOptions<T>, 'snapshot'> {
  /** Where to persist. */
  readonly persistence: Persistence
  /** The storage key for this replica's snapshot. */
  readonly key: string
}

/**
 * Create a durable {@link SyncEngine}: restore the persisted snapshot (so `seq`/HLC survive and op
 * ids never collide across restarts), then auto-save on every change. One call for a replica that
 * survives restart.
 */
export async function createPersistentEngine<T>(
  options: PersistentEngineOptions<T>,
): Promise<SyncEngine<T>> {
  const { persistence, key, ...syncOptions } = options
  const snapshot = await loadSnapshot<T>(persistence, key)
  const engine = createSyncEngine<T>(snapshot ? { ...syncOptions, snapshot } : syncOptions)
  return persistEngine(engine, persistence, key)
}
