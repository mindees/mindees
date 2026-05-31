import { describe, expect, it, vi } from 'vitest'
import { batch, effect, signal } from './reactive'

describe('batch', () => {
  it('coalesces multiple writes into a single effect run', () => {
    const a = signal(1)
    const b = signal(2)
    const fn = vi.fn(() => a() + b())
    effect(fn)
    expect(fn).toHaveBeenCalledTimes(1)

    batch(() => {
      a.set(10)
      b.set(20)
    })
    expect(fn).toHaveBeenCalledTimes(2) // one run for the whole batch
  })

  it('exposes the latest written value synchronously inside the batch', () => {
    const a = signal(1)
    let insideValue = 0
    batch(() => {
      a.set(5)
      insideValue = a() // reads must see the new value immediately
    })
    expect(insideValue).toBe(5)
  })

  it('returns the callback result', () => {
    const out = batch(() => 42)
    expect(out).toBe(42)
  })

  it('supports nested batches (flush only at the outermost)', () => {
    const a = signal(0)
    const fn = vi.fn(() => a())
    effect(fn)
    expect(fn).toHaveBeenCalledTimes(1)

    batch(() => {
      a.set(1)
      batch(() => {
        a.set(2)
      })
      a.set(3)
    })
    expect(fn).toHaveBeenCalledTimes(2)
    expect(a()).toBe(3)
  })
})
