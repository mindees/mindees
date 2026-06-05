import { describe, expect, it, vi } from 'vitest'
import { createScheduler } from './scheduler'

/** A scheduler whose microtask we drive manually, for deterministic tests. */
function manualScheduler(onError?: (e: unknown) => void) {
  const microtasks: Array<() => void> = []
  const scheduler = createScheduler({
    // Only include onError when provided (exactOptionalPropertyTypes).
    ...(onError ? { onError } : {}),
    scheduleMicrotask: (cb) => {
      microtasks.push(cb)
    },
  })
  const drainMicrotasks = () => {
    while (microtasks.length > 0) {
      const cb = microtasks.shift()
      cb?.()
    }
  }
  return { scheduler, drainMicrotasks }
}

describe('scheduler', () => {
  it('runs a normal task on microtask flush', () => {
    const { scheduler, drainMicrotasks } = manualScheduler()
    const fn = vi.fn()
    scheduler.schedule(fn)
    expect(fn).not.toHaveBeenCalled() // not synchronous
    drainMicrotasks()
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('flushSync runs pending work immediately', () => {
    const { scheduler } = manualScheduler()
    const fn = vi.fn()
    scheduler.schedule(fn)
    scheduler.flushSync()
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('drains the sync lane before the normal lane', () => {
    const { scheduler } = manualScheduler()
    const order: string[] = []
    scheduler.schedule(() => order.push('normal-1'), { priority: 'normal' })
    scheduler.schedule(() => order.push('sync-1'), { priority: 'sync' })
    scheduler.schedule(() => order.push('normal-2'), { priority: 'normal' })
    scheduler.schedule(() => order.push('sync-2'), { priority: 'sync' })
    scheduler.flushSync()
    expect(order).toEqual(['sync-1', 'sync-2', 'normal-1', 'normal-2'])
  })

  it('coalesces multiple schedules into a single microtask flush', () => {
    const { scheduler, drainMicrotasks } = manualScheduler()
    const fn = vi.fn()
    scheduler.schedule(fn)
    scheduler.schedule(fn)
    scheduler.schedule(fn)
    drainMicrotasks()
    expect(fn).toHaveBeenCalledTimes(3) // all ran, in one flush
  })

  it('dedupes by key: latest callback wins, runs once', () => {
    const { scheduler } = manualScheduler()
    const a = vi.fn()
    const b = vi.fn()
    scheduler.schedule(a, { key: 'render' })
    scheduler.schedule(b, { key: 'render' }) // replaces a
    expect(scheduler.size).toBe(1)
    scheduler.flushSync()
    expect(a).not.toHaveBeenCalled()
    expect(b).toHaveBeenCalledTimes(1)
  })

  it('cancel() prevents a pending task from running', () => {
    const { scheduler } = manualScheduler()
    const fn = vi.fn()
    const handle = scheduler.schedule(fn)
    expect(handle.pending).toBe(true)
    handle.cancel()
    expect(handle.pending).toBe(false)
    scheduler.flushSync()
    expect(fn).not.toHaveBeenCalled()
  })

  it('cancel() is idempotent and frees the key', () => {
    const { scheduler } = manualScheduler()
    const handle = scheduler.schedule(vi.fn(), { key: 'k' })
    handle.cancel()
    handle.cancel() // no throw
    const fn = vi.fn()
    scheduler.schedule(fn, { key: 'k' }) // key is free again
    scheduler.flushSync()
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('isolates task errors via onError and keeps draining', () => {
    const onError = vi.fn()
    const { scheduler } = manualScheduler(onError)
    const after = vi.fn()
    scheduler.schedule(() => {
      throw new Error('boom')
    })
    scheduler.schedule(after)
    scheduler.flushSync()
    expect(onError).toHaveBeenCalledTimes(1)
    expect((onError.mock.calls[0]?.[0] as Error).message).toBe('boom')
    expect(after).toHaveBeenCalledTimes(1) // not stranded by the thrower
  })

  it('handles tasks that schedule more tasks within the same flush', () => {
    const { scheduler } = manualScheduler()
    const order: string[] = []
    scheduler.schedule(() => {
      order.push('a')
      scheduler.schedule(() => order.push('b'), { priority: 'sync' })
    })
    scheduler.flushSync()
    expect(order).toEqual(['a', 'b'])
  })

  it('size reflects pending (non-cancelled) tasks', () => {
    const { scheduler } = manualScheduler()
    expect(scheduler.size).toBe(0)
    scheduler.schedule(vi.fn())
    const h = scheduler.schedule(vi.fn())
    expect(scheduler.size).toBe(2)
    h.cancel()
    expect(scheduler.size).toBe(1)
  })

  it('is reentrancy-safe: flushSync during a flush is a no-op', () => {
    const { scheduler } = manualScheduler()
    const inner = vi.fn()
    scheduler.schedule(() => {
      scheduler.schedule(inner)
      scheduler.flushSync() // should not double-run or recurse badly
    })
    scheduler.flushSync()
    expect(inner).toHaveBeenCalledTimes(1)
  })

  it('a stale handle cancel() does not evict a newer same-key entry (dedup stays intact)', () => {
    const { scheduler } = manualScheduler()
    const a = vi.fn()
    const h1 = scheduler.schedule(a, { key: 'render' })
    scheduler.flushSync() // runs a; the 'render' key is freed
    expect(a).toHaveBeenCalledTimes(1)

    const b = vi.fn()
    scheduler.schedule(b, { key: 'render' }) // new live entry under the same key
    h1.cancel() // STALE handle for the old entry — must NOT evict b's mapping

    const c = vi.fn()
    scheduler.schedule(c, { key: 'render' }) // must DEDUP onto b (replace), not enqueue a 2nd
    expect(scheduler.size).toBe(1)
    scheduler.flushSync()
    expect(b).not.toHaveBeenCalled() // replaced by c
    expect(c).toHaveBeenCalledTimes(1) // exactly one task ran for the key
  })

  it('a throwing onError hook does not abort the flush or strand the queue', () => {
    const microtasks: Array<() => void> = []
    const scheduler = createScheduler({
      onError: () => {
        throw new Error('logger failed')
      },
      scheduleMicrotask: (cb) => {
        microtasks.push(cb)
      },
    })
    const after = vi.fn()
    scheduler.schedule(() => {
      throw new Error('boom') // triggers onError, which itself throws
    })
    scheduler.schedule(after)

    expect(() => scheduler.flushSync()).not.toThrow() // hook error must not escape
    expect(after).toHaveBeenCalledTimes(1) // task after the thrower is not stranded
    // the hook error is surfaced asynchronously rather than swallowed
    expect(microtasks.length).toBeGreaterThan(0)
    expect(() => {
      for (const cb of microtasks) cb()
    }).toThrow('logger failed')
  })
})

describe('flushSync — runaway loop guard', () => {
  it('aborts a task that perpetually re-schedules instead of hanging', () => {
    const errors: unknown[] = []
    const sched = createScheduler({ scheduleMicrotask: () => {}, onError: (e) => errors.push(e) })
    const loop = (): void => {
      sched.schedule(loop) // re-schedules itself forever
    }
    sched.schedule(loop)
    sched.flushSync() // must terminate (cap), not hang
    expect(errors).toHaveLength(1)
    expect(String(errors[0])).toMatch(/infinite scheduler loop/i)
    expect(sched.size).toBe(0) // both lanes cleared
  })
})
