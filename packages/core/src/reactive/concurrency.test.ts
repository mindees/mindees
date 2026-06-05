import { afterEach, describe, expect, it, vi } from 'vitest'
import { createScheduler } from '../scheduler'
import { effect, setReactiveScheduler, signal } from './index'

// A scheduler whose normal lane never auto-drains (no-op microtask), so tests drain via flushSync().
const manualScheduler = (onError?: (e: unknown) => void) =>
  createScheduler(
    onError ? { scheduleMicrotask: () => {}, onError } : { scheduleMicrotask: () => {} },
  )

describe('effect priority + scheduler wiring', () => {
  afterEach(() => setReactiveScheduler(null)) // never leak the scheduler into other tests

  it("'normal' priority with NO scheduler flushes synchronously (safe fallback)", () => {
    const s = signal(0)
    const seen: number[] = []
    effect(() => seen.push(s()), { priority: 'normal' })
    expect(seen).toEqual([0]) // first run is synchronous
    s.set(1)
    expect(seen).toEqual([0, 1]) // re-ran synchronously — no scheduler to defer to
  })

  it('a plain (sync) effect stays synchronous EVEN with a scheduler injected (the core contract)', () => {
    setReactiveScheduler(manualScheduler())
    const s = signal(0)
    const seen: number[] = []
    effect(() => seen.push(s())) // default = sync
    s.set(1)
    expect(seen).toEqual([0, 1]) // synchronous, not deferred — the 926-test default is untouched
  })

  it("'normal' effect defers through an injected scheduler and runs the latest value after drain", () => {
    const sched = manualScheduler()
    setReactiveScheduler(sched)
    const s = signal(0)
    const seen: number[] = []
    effect(() => seen.push(s()), { priority: 'normal' })
    expect(seen).toEqual([0]) // first run always synchronous (deps + initial paint)
    s.set(1)
    expect(seen).toEqual([0]) // deferred — not run yet
    sched.flushSync()
    expect(seen).toEqual([0, 1])
  })

  it('coalesces rapid writes into ONE deferred run with the final value (supersession)', () => {
    const sched = manualScheduler()
    setReactiveScheduler(sched)
    const s = signal(0)
    const seen: number[] = []
    effect(() => seen.push(s()), { priority: 'normal' })
    s.set(1)
    s.set(2)
    s.set(3)
    expect(seen).toEqual([0])
    sched.flushSync()
    expect(seen).toEqual([0, 3]) // one run, latest value (scheduler key dedup)
  })

  it('preserves glitch-freedom for a deferred diamond join', () => {
    const sched = manualScheduler()
    setReactiveScheduler(sched)
    const a = signal(1)
    const seen: number[] = []
    // join = a + a (a trivial diamond); a deferred effect must observe a single consistent value.
    effect(() => seen.push(a() + a()), { priority: 'normal' })
    expect(seen).toEqual([2])
    a.set(5)
    sched.flushSync()
    expect(seen).toEqual([2, 10]) // 10, never an intermediate like 6; one run
  })

  it('cancels a pending deferred flush on disposal (never runs against a dead graph)', () => {
    const sched = manualScheduler()
    setReactiveScheduler(sched)
    const s = signal(0)
    const seen: number[] = []
    const stop = effect(() => seen.push(s()), { priority: 'normal' })
    s.set(1) // schedules a deferred run
    stop() // dispose before the drain
    sched.flushSync()
    expect(seen).toEqual([0]) // the scheduled run was cancelled
  })

  it('routes a throwing deferred effect to scheduler.onError, not the write call site', () => {
    const onError = vi.fn()
    const sched = manualScheduler(onError)
    setReactiveScheduler(sched)
    const s = signal(0)
    effect(
      () => {
        if (s() === 1) throw new Error('boom')
      },
      { priority: 'normal' },
    )
    expect(() => s.set(1)).not.toThrow() // deferred — the write site never sees the throw
    sched.flushSync()
    expect(onError).toHaveBeenCalledTimes(1)
  })
})

describe('deferred effects are independent (no shared-key cross-cancel)', () => {
  afterEach(() => setReactiveScheduler(null))
  it('two distinct normal effects both run after a drain', () => {
    const sched = manualScheduler()
    setReactiveScheduler(sched)
    const s = signal(0)
    const a: number[] = []
    const b: number[] = []
    effect(() => a.push(s()), { priority: 'normal' })
    effect(() => b.push(s()), { priority: 'normal' })
    s.set(1)
    sched.flushSync()
    expect(a).toEqual([0, 1])
    expect(b).toEqual([0, 1]) // BOTH ran — unique per-node keys, no cross-cancel
  })
})
