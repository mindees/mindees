import { describe, expect, it, vi } from 'vitest'
import { computed, signal } from './reactive'

describe('computed', () => {
  it('derives a value from signals', () => {
    const n = signal(4)
    const doubled = computed(() => n() * 2)
    expect(doubled()).toBe(8)
  })

  it('is lazy: does not run until read', () => {
    const n = signal(1)
    const fn = vi.fn(() => n() * 2)
    computed(fn)
    expect(fn).not.toHaveBeenCalled()
  })

  it('caches: does not recompute when read with no dependency change', () => {
    const n = signal(1)
    const fn = vi.fn(() => n() * 2)
    const c = computed(fn)
    expect(c()).toBe(2)
    expect(c()).toBe(2)
    expect(c()).toBe(2)
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('recomputes after a dependency changes and is read again', () => {
    const n = signal(1)
    const fn = vi.fn(() => n() * 2)
    const c = computed(fn)
    expect(c()).toBe(2)
    n.set(5)
    expect(c()).toBe(10)
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('does not recompute on a dependency change until actually read (lazy pull)', () => {
    const n = signal(1)
    const fn = vi.fn(() => n() * 2)
    const c = computed(fn)
    c() // compute once
    n.set(2)
    n.set(3)
    n.set(4)
    expect(fn).toHaveBeenCalledTimes(1) // still not re-read
    expect(c()).toBe(8)
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('chains computeds', () => {
    const n = signal(1)
    const a = computed(() => n() + 1)
    const b = computed(() => a() * 10)
    expect(b()).toBe(20)
    n.set(2)
    expect(b()).toBe(30)
  })

  it('stops propagation when the recomputed value is equal', () => {
    const n = signal(2)
    const isEven = computed(() => n() % 2 === 0)
    const downstream = vi.fn(() => isEven())
    const label = computed(downstream)
    expect(label()).toBe(true)
    expect(downstream).toHaveBeenCalledTimes(1)
    n.set(4) // still even → isEven unchanged → downstream must not recompute
    expect(label()).toBe(true)
    expect(downstream).toHaveBeenCalledTimes(1)
    n.set(3) // now odd → changes → downstream recomputes
    expect(label()).toBe(false)
    expect(downstream).toHaveBeenCalledTimes(2)
  })
})
