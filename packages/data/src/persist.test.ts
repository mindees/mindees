import { describe, expect, it } from 'vitest'
import { createMemoryPersistence } from './persist'
import { createMemoryOpLog, createSyncServer } from './server'
import { createSyncEngine, type SyncSnapshot } from './sync'

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
})
