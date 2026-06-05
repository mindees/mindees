import { describe, expect, it } from 'vitest'
import {
  createMemoryPersistence,
  createPersistentEngine,
  createWebStoragePersistence,
  persistEngine,
} from './persist'
import { createMemoryOpLog, createSyncServer } from './server'
import { createSyncEngine, type SyncSnapshot } from './sync'

const tick = () => new Promise((r) => setTimeout(r, 0))

interface Note {
  text: string
}

describe('persistence', () => {
  it('round-trips values', async () => {
    const p = createMemoryPersistence()
    expect(await p.load('k')).toBeNull()
    await p.save('k', 'hello')
    expect(await p.load('k')).toBe('hello')
  })

  it('a restored replica resumes seq (no op-id collision) and keeps its state', async () => {
    const server = createSyncServer<Note>({ log: createMemoryOpLog<Note>() })
    const p = createMemoryPersistence()
    const KEY = 'engine:a'

    // Session 1: edit, sync, persist the snapshot, then "shut down".
    const a1 = createSyncEngine<Note>({ nodeId: 'a', transport: server, now: () => 1000 })
    a1.set('notes', 'x', { text: 'one' })
    await a1.sync()
    await p.save(KEY, JSON.stringify(a1.export()))
    expect(a1.export().seq).toBe(1)

    // Session 2: a fresh engine restored from the snapshot — NOT reset to seq 0.
    const restored = JSON.parse((await p.load(KEY)) as string) as SyncSnapshot<Note>
    const a2 = createSyncEngine<Note>({
      nodeId: 'a',
      transport: server,
      now: () => 1000,
      snapshot: restored,
    })
    expect(a2.get('x')?.text).toBe('one') // state preserved across restart
    const op = a2.set('notes', 'y', { text: 'two' })
    expect(op.id).toBe('a:2') // seq resumed at 2 — NOT 'a:1' again (no collision/silent drop)

    // The new op reaches a second peer (it wasn't dropped as a duplicate).
    const b = createSyncEngine<Note>({ nodeId: 'b', transport: server, now: () => 1000 })
    await a2.sync()
    await b.sync()
    expect(b.get('x')?.text).toBe('one')
    expect(b.get('y')?.text).toBe('two')
  })

  it('restores the HLC clock so a same-record edit after restart wins (no regression)', async () => {
    const server = createSyncServer<Note>({ log: createMemoryOpLog<Note>() })
    const p = createMemoryPersistence()
    // Session 1: write a record under a frozen clock, then persist.
    const a1 = createSyncEngine<Note>({ nodeId: 'a', transport: server, now: () => 1000 })
    a1.set('notes', 'x', { text: 'before' }) // stamp (1000,0,a)
    await a1.sync()
    await p.save('k', JSON.stringify(a1.export()))

    // Session 2: restore and edit the SAME record under the SAME frozen physical time.
    const restored = JSON.parse((await p.load('k')) as string) as SyncSnapshot<Note>
    const a2 = createSyncEngine<Note>({
      nodeId: 'a',
      transport: server,
      now: () => 1000,
      snapshot: restored,
    })
    a2.set('notes', 'x', { text: 'after' }) // seeded clock ticks to (1000,1,a) > the persisted stamp
    expect(a2.get('x')?.text).toBe('after') // pre-fix: 'before' — the edit lost the same-stamp tie
  })
})

describe('persistence adapters + auto-persist', () => {
  it('createWebStoragePersistence round-trips via injected web storage', async () => {
    const store = new Map<string, string>()
    const p = createWebStoragePersistence({
      getItem: (k) => store.get(k) ?? null,
      setItem: (k, v) => {
        store.set(k, v)
      },
    })
    expect(await p.load('k')).toBeNull()
    await p.save('k', 'v')
    expect(await p.load('k')).toBe('v')
  })

  it('persistEngine auto-saves the snapshot on each mutation', async () => {
    const server = createSyncServer<Note>({ log: createMemoryOpLog<Note>() })
    const p = createMemoryPersistence()
    const engine = persistEngine(
      createSyncEngine<Note>({ nodeId: 'a', transport: server, now: () => 1 }),
      p,
      'k',
    )
    engine.set('notes', 'x', { text: 'hi' })
    await tick() // let the serialized save flush
    const saved = JSON.parse((await p.load('k')) as string) as SyncSnapshot<Note>
    expect(saved.seq).toBe(1)
    const restored = createSyncEngine<Note>({
      nodeId: 'a',
      transport: server,
      now: () => 1,
      snapshot: saved,
    })
    expect(restored.get('x')?.text).toBe('hi')
  })

  it('createPersistentEngine restores prior state and resumes seq across a restart', async () => {
    const server = createSyncServer<Note>({ log: createMemoryOpLog<Note>() })
    const p = createMemoryPersistence()
    // Session 1.
    const a1 = await createPersistentEngine<Note>({
      nodeId: 'a',
      transport: server,
      now: () => 1,
      persistence: p,
      key: 'a',
    })
    a1.set('notes', 'x', { text: 'one' })
    await tick()
    // Session 2: a fresh persistent engine restores the auto-saved snapshot.
    const a2 = await createPersistentEngine<Note>({
      nodeId: 'a',
      transport: server,
      now: () => 1,
      persistence: p,
      key: 'a',
    })
    expect(a2.get('x')?.text).toBe('one') // state survived restart
    expect(a2.set('notes', 'y', { text: 'two' }).id).toBe('a:2') // seq resumed (no op-id collision)
  })

  it('loadSnapshot via createPersistentEngine tolerates a corrupt blob (starts fresh)', async () => {
    const server = createSyncServer<Note>({ log: createMemoryOpLog<Note>() })
    const p = createMemoryPersistence()
    await p.save('k', '{ not valid json')
    const engine = await createPersistentEngine<Note>({
      nodeId: 'a',
      transport: server,
      now: () => 1,
      persistence: p,
      key: 'k',
    })
    expect(engine.records()).toEqual([]) // no throw; clean start
    expect(engine.set('notes', 'x', { text: 'ok' }).id).toBe('a:1')
  })
})
