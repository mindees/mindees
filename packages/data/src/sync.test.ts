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

  it('two replicas with >24h legitimate clock skew still converge (no data loss)', async () => {
    const hub = createMemoryHub<Note>()
    const TA = 1_000_000_000_000
    const TB = TA + 25 * 60 * 60 * 1000 // B's device clock is ~25h ahead (> default 24h drift)
    const a = createSyncEngine<Note>({ nodeId: 'a', transport: hub, now: () => TA })
    const b = createSyncEngine<Note>({ nodeId: 'b', transport: hub, now: () => TB })
    b.set('notes', 'x', { text: 'from-b' }) // op stamped ~TB, >24h ahead of A
    await b.sync()
    await a.sync() // A must APPLY b's op (clamp its clock, keep the data) — not drop it
    expect(a.get('x')?.text).toBe('from-b') // pre-fix: undefined forever (op dropped)
    await a.sync()
    await b.sync()
    expect(snapshot(a)).toEqual(snapshot(b)) // converged
  })

  it('clamps a far-future (but encodable) op so the local clock is not poisoned', async () => {
    const hub = createMemoryHub<Note>()
    const now = 1_000_000_000_000
    const farFuture = now + 365 * 24 * 60 * 60 * 1000 // +1 year: beyond drift, still encodable
    await hub.push([
      {
        id: 'evil:1',
        actor: 'evil',
        seq: 1,
        collection: 'notes',
        recordId: 'x',
        hlc: { wallMs: farFuture, counter: 0, nodeId: 'evil' },
        kind: 'set',
        value: { text: 'far' },
      },
    ])
    const a = createSyncEngine<Note>({ nodeId: 'a', transport: hub, now: () => now })
    await a.sync()
    expect(a.get('x')?.text).toBe('far') // applied (convergence), unlike the 1e16 structural case
    const op = a.set('notes', 'y', { text: 'ok' })
    expect(op.hlc.wallMs).toBeLessThan(farFuture) // our clock was clamped, not dragged to +1yr
  })
})

interface User {
  name?: string
  age?: number
}

describe('sync — per-field LWW', () => {
  const hlc = (wallMs: number, nodeId = 'a') => ({ wallMs, counter: 0, nodeId })

  it('preserves concurrent edits to DIFFERENT fields of the same record', async () => {
    const hub = createMemoryHub<User>()
    const a = createSyncEngine<User>({ nodeId: 'a', transport: hub, now: () => 1000 })
    const b = createSyncEngine<User>({ nodeId: 'b', transport: hub, now: () => 1000 })
    a.set('users', 'u1', { name: 'init', age: 0 })
    await a.sync()
    await b.sync() // both share the seed record

    // OFFLINE, concurrent edits to DIFFERENT fields.
    a.set('users', 'u1', { name: 'Ada' })
    b.set('users', 'u1', { age: 36 })
    await a.sync()
    await b.sync()
    await a.sync()

    // Both edits survive on BOTH replicas — the whole-record-clobber bug is fixed.
    expect(a.get('u1')).toEqual({ name: 'Ada', age: 36 })
    expect(b.get('u1')).toEqual({ name: 'Ada', age: 36 })
  })

  it('set MERGES fields rather than replacing the record', () => {
    const a = createSyncEngine<User>({
      nodeId: 'a',
      transport: createMemoryHub<User>(),
      now: () => 1,
    })
    a.set('users', 'u1', { name: 'Ada' })
    a.set('users', 'u1', { age: 36 }) // omitting `name` must NOT drop it
    expect(a.get('u1')).toEqual({ name: 'Ada', age: 36 })
  })

  it('resurrects only the fields written after a whole-record delete', () => {
    const log = createMutationLog<User>()
    const op = (seq: number, w: number, body: Partial<Op<User>>): Op<User> =>
      ({
        id: `a:${seq}`,
        actor: 'a',
        seq,
        collection: 'u',
        recordId: 'u1',
        hlc: hlc(w),
        ...body,
      }) as Op<User>
    log.apply(op(1, 1, { kind: 'set', value: { name: 'Ada', age: 1 } }))
    log.apply(op(2, 2, { kind: 'del' }))
    expect(log.get('u1')).toBeUndefined() // deleted
    log.apply(op(3, 3, { kind: 'set', value: { name: 'Bob' } })) // newer than the tomb
    expect(log.get('u1')).toEqual({ name: 'Bob' }) // name resurrects; age (pre-delete) stays shadowed
  })

  it('migrates a legacy whole-record register dump on restore', () => {
    const legacy = [['u1', { stamp: hlc(5), op: 'set', value: { name: 'Ada', age: 9 } }]]
    const log = createMutationLog<User>(legacy as never)
    expect(log.get('u1')).toEqual({ name: 'Ada', age: 9 })
    // …and per-field merges apply on top of the migrated state.
    log.apply({
      id: 'b:1',
      actor: 'b',
      seq: 1,
      collection: 'u',
      recordId: 'u1',
      hlc: hlc(6, 'b'),
      kind: 'set',
      value: { age: 10 },
    })
    expect(log.get('u1')).toEqual({ name: 'Ada', age: 10 })
  })

  it('overlapping sync() calls each push their ops (no silent coalesce no-op)', async () => {
    const hub = createMemoryHub<User>()
    const a = createSyncEngine<User>({ nodeId: 'a', transport: hub, now: () => 1 })
    const b = createSyncEngine<User>({ nodeId: 'b', transport: hub, now: () => 1 })
    a.set('users', 'u1', { name: 'A' })
    const p1 = a.sync() // run 1 (in flight)
    a.set('users', 'u2', { name: 'B' })
    const p2 = a.sync() // run 2 while run 1 is in flight — must still push u2
    await Promise.all([p1, p2])
    await b.sync()
    expect(b.get('u1')).toEqual({ name: 'A' })
    expect(b.get('u2')).toEqual({ name: 'B' }) // pre-fix: dropped by the early-return coalesce
  })
})
