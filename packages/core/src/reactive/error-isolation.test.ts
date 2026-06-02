import { describe, expect, it, vi } from 'vitest'
import { _observerCount, createRoot, effect, onCleanup, signal } from './reactive'

describe('reactive error isolation + recovery', () => {
  it('one throwing effect does not strand sibling effects in the same flush', () => {
    const n = signal(0)
    const aRuns: number[] = []
    const cRuns: number[] = []
    createRoot(() => {
      effect(() => {
        aRuns.push(n())
      })
      effect(() => {
        if (n() === 1) throw new Error('boom')
      })
      effect(() => {
        cRuns.push(n())
      })
    })
    expect(aRuns).toEqual([0])
    expect(cRuns).toEqual([0])

    // B throws on n===1, but A and C must still run for that value; the error surfaces.
    expect(() => n.set(1)).toThrow('boom')
    expect(aRuns).toEqual([0, 1])
    expect(cRuns).toEqual([0, 1]) // C was NOT stranded by B's throw

    // B no longer throws → everything keeps working (no permanent zombies).
    expect(() => n.set(2)).not.toThrow()
    expect(aRuns).toEqual([0, 1, 2])
    expect(cRuns).toEqual([0, 1, 2])
  })

  it('an effect whose body throws recovers on a later change', () => {
    const a = signal(0)
    const seen: number[] = []
    createRoot(() => {
      effect(() => {
        const v = a()
        if (v === 1) throw new Error('x')
        seen.push(v)
      })
    })
    expect(seen).toEqual([0])
    expect(() => a.set(1)).toThrow('x')
    expect(seen).toEqual([0]) // threw before push
    expect(() => a.set(2)).not.toThrow()
    expect(seen).toEqual([0, 2]) // recovered, not a zombie
  })

  it('a throwing onCleanup during a re-run does not brick the effect', () => {
    const a = signal(0)
    const seen: number[] = []
    createRoot(() => {
      effect(() => {
        seen.push(a())
        onCleanup(() => {
          if (a.peek() === 1) throw new Error('cleanup')
        })
      })
    })
    expect(seen).toEqual([0])
    // Re-run at a===1 runs the prior cleanup first, which throws.
    expect(() => a.set(1)).toThrow('cleanup')
    // a===2: prior cleanup no longer throws, effect re-runs normally.
    expect(() => a.set(2)).not.toThrow()
    expect(seen).toContain(2)
  })

  it('disposing a root unlinks ALL sibling effects even when one cleanup throws', () => {
    const s = signal(0)
    const c3 = vi.fn()
    const dispose = createRoot((dispose) => {
      effect(() => {
        s()
        onCleanup(() => {})
      })
      effect(() => {
        s()
        onCleanup(() => {
          throw new Error('boom')
        })
      })
      effect(() => {
        s()
        onCleanup(c3)
      })
      return dispose
    })
    expect(_observerCount(s)).toBe(3)
    expect(() => dispose()).toThrow('boom')
    expect(c3).toHaveBeenCalledTimes(1) // sibling after the thrower still cleaned up
    expect(_observerCount(s)).toBe(0) // every subscription unlinked — no leak
  })
})

describe('default equality is Object.is', () => {
  it('does not re-notify on set(NaN) after NaN', () => {
    const n = signal(Number.NaN)
    const runs = vi.fn()
    createRoot(() => {
      effect(() => {
        n()
        runs()
      })
    })
    expect(runs).toHaveBeenCalledTimes(1)
    n.set(Number.NaN) // Object.is(NaN, NaN) === true → no change
    expect(runs).toHaveBeenCalledTimes(1)
  })

  it('treats -0 and +0 as different (re-notifies)', () => {
    const z = signal(0)
    const runs = vi.fn()
    createRoot(() => {
      effect(() => {
        z()
        runs()
      })
    })
    expect(runs).toHaveBeenCalledTimes(1)
    z.set(-0) // Object.is(0, -0) === false → change
    expect(runs).toHaveBeenCalledTimes(2)
  })
})
