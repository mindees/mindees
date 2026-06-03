import { describe, expect, it } from 'vitest'
import { createMemoryOpLog, createSyncServer } from './server'
import { createSyncEngine, type Op, type SyncEngine } from './sync'

interface Note {
  text: string
}

const snap = (e: SyncEngine<Note>): Array<[string, string]> =>
  e
    .records()
    .map(([id, v]) => [String(id), v.text] as [string, string])
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))

describe('sync server — op log', () => {
  it('appends with id-dedup and serves ops since a cursor', async () => {
    const log = createMemoryOpLog<Note>()
    const op = (seq: number): Op<Note> => ({
      id: `a:${seq}`,
      actor: 'a',
      seq,
      collection: 'notes',
      recordId: `r${seq}`,
      hlc: { wallMs: seq, counter: 0, nodeId: 'a' },
      kind: 'set',
      value: { text: `v${seq}` },
    })
    await log.append([op(1), op(2)])
    await log.append([op(2), op(3)]) // op(2) is a duplicate → deduped
    const first = await log.since(null)
    expect(first.ops.map((o) => o.id)).toEqual(['a:1', 'a:2', 'a:3'])
    const next = await log.since(first.cursor)
    expect(next.ops).toEqual([]) // nothing new since the cursor
  })
})

describe('sync server — two engines converge through createSyncServer', () => {
  it('reconciles concurrent edits over the durable server', async () => {
    const server = createSyncServer<Note>({ log: createMemoryOpLog<Note>() })
    const a = createSyncEngine<Note>({ nodeId: 'a', transport: server, now: () => 1000 })
    const b = createSyncEngine<Note>({ nodeId: 'b', transport: server, now: () => 1000 })

    a.set('notes', 'shared', { text: 'from-a' })
    b.set('notes', 'shared', { text: 'from-b' })
    a.set('notes', 'a-only', { text: 'A' })
    b.set('notes', 'b-only', { text: 'B' })

    await a.sync()
    await b.sync()
    await a.sync()

    expect(snap(a)).toEqual(snap(b))
    expect(snap(a).map(([id]) => id)).toEqual(['a-only', 'b-only', 'shared'])
  })
})
