import { describe, expect, it, vi } from 'vitest'
import { effect, onCleanup, signal } from './reactive'

describe('effect', () => {
  it('runs once immediately', () => {
    const fn = vi.fn()
    effect(fn)
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('re-runs when a dependency changes', () => {
    const n = signal(0)
    const seen: number[] = []
    effect(() => seen.push(n()))
    n.set(1)
    n.set(2)
    expect(seen).toEqual([0, 1, 2])
  })

  it('the disposer stops further runs', () => {
    const n = signal(0)
    const fn = vi.fn(() => n())
    const stop = effect(fn)
    n.set(1)
    expect(fn).toHaveBeenCalledTimes(2)
    stop()
    n.set(2)
    expect(fn).toHaveBeenCalledTimes(2) // no more runs
  })

  it('runs onCleanup before each re-run and on disposal', () => {
    const n = signal(0)
    const cleanup = vi.fn()
    const stop = effect(() => {
      n()
      onCleanup(cleanup)
    })
    expect(cleanup).toHaveBeenCalledTimes(0)
    n.set(1) // cleanup of previous run fires before re-run
    expect(cleanup).toHaveBeenCalledTimes(1)
    stop() // cleanup of the last run fires on disposal
    expect(cleanup).toHaveBeenCalledTimes(2)
  })

  it('treats a returned function as a cleanup', () => {
    const n = signal(0)
    const cleanup = vi.fn()
    const stop = effect(() => {
      n()
      return cleanup
    })
    n.set(1)
    expect(cleanup).toHaveBeenCalledTimes(1)
    stop()
    expect(cleanup).toHaveBeenCalledTimes(2)
  })

  it('tracks dependencies dynamically (conditional branches)', () => {
    const toggle = signal(true)
    const a = signal('a')
    const b = signal('b')
    const seen: string[] = []
    effect(() => seen.push(toggle() ? a() : b()))
    expect(seen).toEqual(['a'])

    b.set('b2') // not currently a dependency
    expect(seen).toEqual(['a'])

    toggle.set(false) // now depends on b, not a
    expect(seen).toEqual(['a', 'b2'])

    a.set('a2') // no longer a dependency
    expect(seen).toEqual(['a', 'b2'])

    b.set('b3')
    expect(seen).toEqual(['a', 'b2', 'b3'])
  })
})
