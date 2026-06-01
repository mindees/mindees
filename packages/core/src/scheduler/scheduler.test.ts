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
})
