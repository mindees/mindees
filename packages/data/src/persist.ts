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

// --- IndexedDB persistence (durable browser storage; large + async, beyond localStorage's sync ~5MB) ---
//
// A minimal structural subset of the DOM IndexedDB types, declared here so @mindees/data stays
// DOM-lib-free (mirrors WebStorageLike). The real `globalThis.indexedDB` and `fake-indexeddb` are
// structurally assignable to IndexedDbFactoryLike.

interface IdbRequestLike<T> {
  result: T
  error: unknown
  onsuccess: (() => void) | null
  onerror: (() => void) | null
}
interface IdbOpenRequestLike extends IdbRequestLike<IdbDatabaseLike> {
  onupgradeneeded: (() => void) | null
}
interface IdbObjectStoreLike {
  get(key: string): IdbRequestLike<unknown>
  put(value: string, key: string): IdbRequestLike<unknown>
}
interface IdbTransactionLike {
  objectStore(name: string): IdbObjectStoreLike
}
interface IdbDatabaseLike {
  objectStoreNames: { contains(name: string): boolean }
  createObjectStore(name: string): unknown
  transaction(storeNames: string, mode: 'readonly' | 'readwrite'): IdbTransactionLike
}
/** The minimal IndexedDB factory surface (a structural subset of the DOM `IDBFactory`). */
export interface IndexedDbFactoryLike {
  open(name: string, version?: number): IdbOpenRequestLike
}

/** Options for {@link createIndexedDbPersistence}. */
export interface IndexedDbPersistenceOptions {
  /** Database name (default `'mindees'`). */
  readonly databaseName?: string
  /** Object-store name (default `'continuum'`). */
  readonly storeName?: string
  /** The IndexedDB factory; defaults to `globalThis.indexedDB`. Inject (e.g. `fake-indexeddb`) elsewhere. */
  readonly factory?: IndexedDbFactoryLike
}

/**
 * A durable {@link Persistence} backed by IndexedDB — large, asynchronous browser storage (beyond
 * `localStorage`'s synchronous ~5MB cap), a better home for a growing Continuum op log/snapshot. The
 * database + object store open lazily on first use and are reused. Inject `factory` to run outside a
 * browser (tests, or a custom environment); throws if none is available.
 */
export function createIndexedDbPersistence(options: IndexedDbPersistenceOptions = {}): Persistence {
  const dbName = options.databaseName ?? 'mindees'
  const storeName = options.storeName ?? 'continuum'
  const factory = options.factory ?? (globalThis as { indexedDB?: IndexedDbFactoryLike }).indexedDB
  if (!factory) {
    throw new Error('createIndexedDbPersistence: IndexedDB is unavailable; pass `factory`.')
  }

  let dbPromise: Promise<IdbDatabaseLike> | undefined
  const openDb = (): Promise<IdbDatabaseLike> => {
    if (!dbPromise) {
      dbPromise = new Promise<IdbDatabaseLike>((resolve, reject) => {
        const request = factory.open(dbName, 1)
        request.onupgradeneeded = () => {
          const db = request.result
          if (!db.objectStoreNames.contains(storeName)) db.createObjectStore(storeName)
        }
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error ?? new Error('IndexedDB open failed'))
      })
    }
    return dbPromise
  }

  const run = <T>(
    mode: 'readonly' | 'readwrite',
    op: (store: IdbObjectStoreLike) => IdbRequestLike<T>,
  ): Promise<T> =>
    openDb().then(
      (db) =>
        new Promise<T>((resolve, reject) => {
          const request = op(db.transaction(storeName, mode).objectStore(storeName))
          request.onsuccess = () => resolve(request.result)
          request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'))
        }),
    )

  return {
    load: (key) =>
      run('readonly', (store) => store.get(key)).then((value) =>
        value === undefined || value === null ? null : String(value),
      ),
    save: (key, value) => run('readwrite', (store) => store.put(value, key)).then(() => undefined),
  }
}
