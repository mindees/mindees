import { describe, expect, it, vi } from 'vitest'
import { _observerCount, computed, createRoot, effect, onCleanup, signal } from './reactive'

describe('disposal & ownership', () => {
  it('createRoot returns the callback result', () => {
    const out = createRoot(() => 7)
    expect(out).toBe(7)
  })

  it('disposing a root stops its effects', () => {
    const n = signal(0)
    const fn = vi.fn(() => n())
    const dispose = createRoot((dispose) => {
      effect(fn)
      return dispose
    })
    expect(fn).toHaveBeenCalledTimes(1)
    n.set(1)
    expect(fn).toHaveBeenCalledTimes(2)
    dispose()
    n.set(2)
    expect(fn).toHaveBeenCalledTimes(2) // no more runs after disposal
  })

  it('leaves no leaked observers after disposal', () => {
    const n = signal(0)
    expect(_observerCount(n)).toBe(0)

    const dispose = createRoot((dispose) => {
      effect(() => n())
      effect(() => n())
      computed(() => n())() // read so it subscribes
      return dispose
    })
    expect(_observerCount(n)).toBe(3)

    dispose()
    expect(_observerCount(n)).toBe(0) // every subscription removed — no leak
  })

  it('runs cleanups on disposal', () => {
    const cleanup = vi.fn()
    const dispose = createRoot((dispose) => {
      effect(() => {
        onCleanup(cleanup)
      })
      return dispose
    })
    expect(cleanup).toHaveBeenCalledTimes(0)
    dispose()
    expect(cleanup).toHaveBeenCalledTimes(1)
  })

  it('disposes nested owners (effects created inside effects)', () => {
    const outer = signal(0)
    const inner = signal(0)
    const innerRuns = vi.fn()

    const dispose = createRoot((dispose) => {
      effect(() => {
        outer()
        // a nested effect is owned by the outer effect and re-created each run
        effect(() => {
          inner()
          innerRuns()
        })
      })
      return dispose
    })

    expect(innerRuns).toHaveBeenCalledTimes(1)
    inner.set(1)
    expect(innerRuns).toHaveBeenCalledTimes(2)

    // re-running the outer effect disposes the previous inner effect and makes a new one
    outer.set(1)
    expect(innerRuns).toHaveBeenCalledTimes(3)
    expect(_observerCount(inner)).toBe(1) // exactly one live inner effect, not two

    dispose()
    inner.set(2)
    expect(innerRuns).toHaveBeenCalledTimes(3) // fully torn down
    expect(_observerCount(inner)).toBe(0)
  })
})
