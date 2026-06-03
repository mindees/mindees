import { describe, expect, it } from 'vitest'
import {
  createMemoryHub,
  createMutationLog,
  createSyncEngine,
  type Op,
  type SyncEngine,
} from './sync'

interface Note {
  text: string
}

/** Snapshot an engine's live records as a sorted [id, text] list for comparison. */
function snapshot(engine: SyncEngine<Note>): Array<[string, string]> {
  return engine
    .records()
    .map(([id, v]) => [String(id), v.text] as [string, string])
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
}

describe('sync — mutation log', () => {
  it('applies ops with record-level LWW and is order-independent + idempotent', () => {
    const mk = (seq: number, wallMs: number, value: string): Op<Note> => ({
      id: `a:${seq}`,
      actor: 'a',
      seq,
      collection: 'notes',
      recordId: 'n1',
      hlc: { wallMs, counter: 0, nodeId: 'a' },
      kind: 'set',
      value: { text: value },
    })
    const older = mk(1, 1, 'old')
    const newer = mk(2, 2, 'new')

    const a = createMutationLog<Note>()
    a.apply(older)
    a.apply(newer)
    const b = createMutationLog<Note>()
    b.apply(newer)
    b.apply(older) // reverse order
    b.apply(newer) // duplicate
    expect(a.get('n1')?.text).toBe('new')
    expect(b.get('n1')?.text).toBe('new') // converges regardless of order/dup
  })
})

describe('sync — two peers converge through a hub', () => {
  it('reconciles concurrent offline edits, duplicate delivery, and out-of-order pulls', async () => {
    const hub = createMemoryHub<Note>()
    const a = createSyncEngine<Note>({ nodeId: 'a', transport: hub, now: () => 1000 })
    const b = createSyncEngine<Note>({ nodeId: 'b', transport: hub, now: () => 1000 })

    // both edit OFFLINE (no sync yet)
    a.set('notes', 'shared', { text: 'from-a' })
    b.set('notes', 'shared', { text: 'from-b' }) // concurrent conflict on the same record
    a.set('notes', 'only-a', { text: 'A' })
    b.set('notes', 'only-b', { text: 'B' })
    expect(a.pending()).toHaveLength(2)

    // out-of-order: b pulls before pushing; then everyone syncs (twice → duplicate delivery)
    await b.sync()
    await a.sync()
    await b.sync()
    await a.sync()
    await b.sync()

    expect(snapshot(a)).toEqual(snapshot(b)) // CONVERGED
    expect(a.pending()).toHaveLength(0)
    // the conflict resolved deterministically to one winner, and both non-conflicting records survive
    const ids = snapshot(a).map(([id]) => id)
    expect(ids).toEqual(['only-a', 'only-b', 'shared'])
    expect(a.get('shared')?.text).toBe(b.get('shared')?.text)
  })

  it('a delete on one peer propagates to the other', async () => {
    const hub = createMemoryHub<Note>()
    const a = createSyncEngine<Note>({ nodeId: 'a', transport: hub, now: () => 1000 })
    const b = createSyncEngine<Note>({ nodeId: 'b', transport: hub, now: () => 1000 })

    a.set('notes', 'x', { text: 'hello' })
    await a.sync()
    await b.sync()
    expect(b.get('x')?.text).toBe('hello')

    b.delete('notes', 'x')
    await b.sync()
    await a.sync()
    expect(a.get('x')).toBeUndefined() // delete won (later HLC) on both
    expect(snapshot(a)).toEqual(snapshot(b))
  })

  it('a later edit wins over an earlier one after sync (causality preserved)', async () => {
    const hub = createMemoryHub<Note>()
    const a = createSyncEngine<Note>({ nodeId: 'a', transport: hub, now: () => 1000 })
    const b = createSyncEngine<Note>({ nodeId: 'b', transport: hub, now: () => 1000 })

    a.set('notes', 'x', { text: 'first' })
    await a.sync()
    await b.sync() // b learns 'first' and advances its clock past a's edit
    b.set('notes', 'x', { text: 'second' }) // causally after → must win
    await b.sync()
    await a.sync()
    expect(a.get('x')?.text).toBe('second')
    expect(b.get('x')?.text).toBe('second')
  })

  it('is not re-entrant: overlapping sync() calls do not regress the cursor or double-apply', async () => {
    const hub = createMemoryHub<Note>()
    const a = createSyncEngine<Note>({ nodeId: 'a', transport: hub, now: () => 1000 })
    const b = createSyncEngine<Note>({ nodeId: 'b', transport: hub, now: () => 1000 })
    a.set('notes', 'x', { text: 'A' })
    await a.sync()
    b.set('notes', 'y', { text: 'B' })
    await b.sync()
    // fire two overlapping syncs on A concurrently
    await Promise.all([a.sync(), a.sync()])
    await a.sync() // settle
    expect(snapshot(a)).toEqual(snapshot(b))
    expect(a.get('y')?.text).toBe('B')
  })

  it('skips a hostile far-future op instead of poisoning the clock/state', async () => {
    const hub = createMemoryHub<Note>()
    // a hostile peer pushes an op whose HLC is wildly in the future
    await hub.push([
      {
        id: 'evil:1',
        actor: 'evil',
        seq: 1,
        collection: 'notes',
        recordId: 'x',
        hlc: { wallMs: 1e16, counter: 0, nodeId: 'evil' },
        kind: 'set',
        value: { text: 'pwned' },
      },
    ])
    const a = createSyncEngine<Note>({ nodeId: 'a', transport: hub, now: () => 1000 })
    await a.sync() // must not throw
    expect(a.get('x')).toBeUndefined() // the out-of-bounds op was skipped
    // the clock is still usable: a normal local edit + sync works
    a.set('notes', 'y', { text: 'ok' })
    await a.sync()
    expect(a.get('y')?.text).toBe('ok')
  })
})
