import { IDBFactory } from 'fake-indexeddb'
import { describe, expect, it } from 'vitest'
import { createIndexedDbPersistence, type IndexedDbFactoryLike } from './persist'

describe('createIndexedDbPersistence', () => {
  it('round-trips values (load null when absent, then save/overwrite)', async () => {
    const p = createIndexedDbPersistence({ factory: new IDBFactory() })
    expect(await p.load('k')).toBeNull()
    await p.save('k', 'hello')
    expect(await p.load('k')).toBe('hello')
    await p.save('k', 'world')
    expect(await p.load('k')).toBe('world')
  })

  it('persists across separate persistence handles on the same factory+db', async () => {
    const factory = new IDBFactory()
    await createIndexedDbPersistence({ factory }).save('snapshot', '{"v":1}')
    // a fresh handle (e.g. next launch) reads what the previous one wrote
    expect(await createIndexedDbPersistence({ factory }).load('snapshot')).toBe('{"v":1}')
  })

  it('isolates by database name', async () => {
    const factory = new IDBFactory()
    await createIndexedDbPersistence({ factory, databaseName: 'a' }).save('k', 'in-a')
    expect(await createIndexedDbPersistence({ factory, databaseName: 'b' }).load('k')).toBeNull()
  })

  it('throws when no factory and no global IndexedDB', () => {
    expect(() => createIndexedDbPersistence()).toThrow(/IndexedDB is unavailable/)
  })

  it('retries after a transient open failure (does not cache the rejected open promise)', async () => {
    const real = new IDBFactory()
    let opens = 0
    const flaky: IndexedDbFactoryLike = {
      open(name, version) {
        opens += 1
        if (opens === 1) {
          // a request that asynchronously fires onerror (transient: blocked upgrade / concurrent tab)
          const req = {
            result: undefined as never,
            error: new Error('transient open failure'),
            onsuccess: null as null | (() => void),
            onerror: null as null | (() => void),
            onupgradeneeded: null as null | (() => void),
          }
          void Promise.resolve().then(() => req.onerror?.())
          return req
        }
        return real.open(name, version)
      },
    }
    const p = createIndexedDbPersistence({ factory: flaky })
    await expect(p.load('k')).rejects.toThrow(/transient open failure/) // first open fails
    await p.save('k', 'v') // a fresh open is attempted (not the cached rejection) → succeeds
    expect(await p.load('k')).toBe('v')
    expect(opens).toBeGreaterThanOrEqual(2) // proved it retried factory.open
  })
})
