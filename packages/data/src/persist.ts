/**
 * Persistence (10F) — a minimal async key/value capability so a Continuum replica
 * survives restart (mirrors the CLI's `FileSystem` / Pulse's `UpdateStorage`). Persist a
 * sync engine's {@link "./sync".SyncEngine.export snapshot} through any `Persistence`
 * and restore it on next launch, so `seq` survives and op ids never collide.
 *
 * `createMemoryPersistence` is the reference; `localStorage`/IndexedDB (web) and native
 * SQLite are research-track adapters (see STATUS). See
 * `docs/adr/0016-continuum-server-persistence.md`.
 *
 * @module
 */

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
