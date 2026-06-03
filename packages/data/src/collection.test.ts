import { effect } from '@mindees/core'
import { describe, expect, it, vi } from 'vitest'
import { createCollection } from './collection'
import { DataError } from './errors'

interface Todo {
  id: string
  text: string
  done: boolean
}

const todo = (id: string, text = id, done = false): Todo => ({ id, text, done })

describe('collection — CRUD', () => {
  it('inserts, reads, updates, and deletes records', () => {
    const c = createCollection<Todo>()
    c.insert(todo('a', 'A'))
    expect(c.get('a')).toEqual(todo('a', 'A'))
    expect(c.has('a')).toBe(true)
    expect(c.size()).toBe(1)

    c.update('a', { done: true })
    expect(c.get('a')?.done).toBe(true)
    expect(c.get('a')?.text).toBe('A') // patch is shallow-merged

    c.update('a', (prev) => ({ ...prev, text: 'A2' }))
    expect(c.get('a')?.text).toBe('A2')

    expect(c.delete('a')).toBe(true)
    expect(c.delete('a')).toBe(false)
    expect(c.get('a')).toBeUndefined()
    expect(c.size()).toBe(0)
  })

  it('seeds from initial records and exposes all/where/snapshot', () => {
    const c = createCollection<Todo>({ initial: [todo('a'), todo('b'), todo('c')] })
    expect(c.size()).toBe(3)
    expect(
      c
        .all()
        .map((t) => t.id)
        .sort(),
    ).toEqual(['a', 'b', 'c'])
    c.update('b', { done: true })
    expect(c.where((t) => t.done).map((t) => t.id)).toEqual(['b'])
    expect(c.snapshot()).toHaveLength(3)
  })

  it('upsert inserts or replaces', () => {
    const c = createCollection<Todo>()
    c.upsert(todo('a', 'first'))
    c.upsert(todo('a', 'second'))
    expect(c.get('a')?.text).toBe('second')
    expect(c.size()).toBe(1)
  })

  it('enforces the error contract', () => {
    const c = createCollection<Todo>()
    c.insert(todo('a'))
    expect(() => c.insert(todo('a'))).toThrow(DataError) // DUPLICATE_ID
    expect(() => c.update('missing', { done: true })).toThrow(DataError) // RECORD_NOT_FOUND
    expect(() => c.update('a', (p) => ({ ...p, id: 'b' }))).toThrow(DataError) // ID_IMMUTABLE
    expect(() => createCollection<Todo>({ initial: [todo('x'), todo('x')] })).toThrow(DataError)
  })

  it('clear removes everything', () => {
    const c = createCollection<Todo>({ initial: [todo('a'), todo('b')] })
    c.clear()
    expect(c.size()).toBe(0)
    expect(c.all()).toEqual([])
  })
})

describe('collection — fine-grained reactivity', () => {
  it('get(id) re-runs only when THAT record changes', () => {
    const c = createCollection<Todo>({ initial: [todo('a'), todo('b')] })
    const aRuns = vi.fn()
    const bRuns = vi.fn()
    const da = effect(() => {
      c.get('a')
      aRuns()
    })
    const db = effect(() => {
      c.get('b')
      bRuns()
    })
    expect(aRuns).toHaveBeenCalledTimes(1)
    expect(bRuns).toHaveBeenCalledTimes(1)

    c.update('a', { done: true })
    expect(aRuns).toHaveBeenCalledTimes(2) // a re-ran
    expect(bRuns).toHaveBeenCalledTimes(1) // b did NOT
    da()
    db()
  })

  it('all()/where() re-run on any mutation', () => {
    const c = createCollection<Todo>()
    const runs = vi.fn()
    const dispose = effect(() => {
      c.all()
      runs()
    })
    expect(runs).toHaveBeenCalledTimes(1)
    c.insert(todo('a'))
    expect(runs).toHaveBeenCalledTimes(2)
    c.update('a', { done: true })
    expect(runs).toHaveBeenCalledTimes(3)
    dispose()
  })

  it('tx coalesces many mutations into ONE notification', () => {
    const c = createCollection<Todo>()
    const runs = vi.fn()
    const dispose = effect(() => {
      c.all()
      runs()
    })
    runs.mockClear()
    c.tx(() => {
      c.insert(todo('a'))
      c.insert(todo('b'))
      c.insert(todo('c'))
    })
    expect(runs).toHaveBeenCalledTimes(1)
    expect(c.size()).toBe(3)
    dispose()
  })

  it('a deleted-then-reinserted record stays correctly reactive (no stale signal)', () => {
    const c = createCollection<Todo>({ initial: [todo('a', 'A')] })
    const seen: Array<string | undefined> = []
    const dispose = effect(() => {
      seen.push(c.get('a')?.text)
    })
    c.delete('a')
    c.insert(todo('a', 'A2'))
    expect(seen).toEqual(['A', undefined, 'A2'])
    dispose()
  })
})

describe('collection — optimistic changes', () => {
  it('rollback restores the prior state across insert/update/delete', () => {
    const c = createCollection<Todo>({ initial: [todo('a', 'A'), todo('keep')] })
    const change = c.optimistic(() => {
      c.update('a', { text: 'optimistic' })
      c.insert(todo('new'))
      c.delete('keep')
    })
    expect(c.get('a')?.text).toBe('optimistic')
    expect(c.has('new')).toBe(true)
    expect(c.has('keep')).toBe(false)

    change.rollback()
    expect(c.get('a')?.text).toBe('A')
    expect(c.has('new')).toBe(false)
    expect(c.has('keep')).toBe(true)
  })

  it('commit keeps the change; a later rollback is a no-op', () => {
    const c = createCollection<Todo>({ initial: [todo('a', 'A')] })
    const change = c.optimistic(() => c.update('a', { text: 'B' }))
    change.commit()
    expect(c.get('a')?.text).toBe('B')
    change.rollback()
    expect(c.get('a')?.text).toBe('B')
  })

  it('rolls back a clear()', () => {
    const c = createCollection<Todo>({ initial: [todo('a'), todo('b')] })
    const change = c.optimistic(() => c.clear())
    expect(c.size()).toBe(0)
    change.rollback()
    expect(c.size()).toBe(2)
  })

  it('rolls back repeated edits of the same record to the original', () => {
    const c = createCollection<Todo>({ initial: [todo('a', 'A')] })
    const change = c.optimistic(() => {
      c.update('a', { text: 'B' })
      c.update('a', { text: 'C' })
      c.delete('a')
    })
    expect(c.has('a')).toBe(false)
    change.rollback()
    expect(c.get('a')).toEqual(todo('a', 'A'))
  })

  it('is atomic: a throw inside the block rolls back partial mutations and rethrows', () => {
    const c = createCollection<Todo>({ initial: [todo('a', 'A')] })
    expect(() =>
      c.optimistic(() => {
        c.update('a', { text: 'changed' })
        c.insert(todo('b'))
        throw new Error('boom')
      }),
    ).toThrow('boom')
    // partial mutations undone
    expect(c.get('a')?.text).toBe('A')
    expect(c.has('b')).toBe(false)
  })

  it('is not reentrant (OPTIMISTIC_NESTED)', () => {
    const c = createCollection<Todo>()
    expect(() =>
      c.optimistic(() => {
        c.optimistic(() => c.insert(todo('x')))
      }),
    ).toThrow(DataError)
  })
})

describe('collection — review hardening (10A)', () => {
  it('update rejects a foreign id in the object-patch form too', () => {
    const c = createCollection<Todo>({ initial: [todo('a')] })
    // A patch carrying a foreign id (Partial<T> permits `id`) must be rejected, not silently dropped.
    expect(() => c.update('a', { id: 'b', text: 'x' })).toThrow(DataError) // ID_IMMUTABLE
  })

  it('a read of an absent id stays reactive when the id is later inserted (no per-record leak)', () => {
    const c = createCollection<Todo>()
    const seen: Array<string | undefined> = []
    const dispose = effect(() => {
      seen.push(c.get('ghost')?.text)
    })
    expect(seen).toEqual([undefined])
    c.insert(todo('ghost', 'now-here'))
    expect(seen).toEqual([undefined, 'now-here'])
    dispose()
  })
})
