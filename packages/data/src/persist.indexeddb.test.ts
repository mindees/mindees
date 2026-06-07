import { IDBFactory } from 'fake-indexeddb'
import { describe, expect, it } from 'vitest'
import { createIndexedDbPersistence } from './persist'

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
})
