import { describe, expect, it, vi } from 'vitest'
import { computed, effect, signal } from './reactive'

describe('signal', () => {
  it('reads and writes a value', () => {
    const count = signal(1)
    expect(count()).toBe(1)
    expect(count.set(2)).toBe(2)
    expect(count()).toBe(2)
  })

  it('update() derives the next value from the previous', () => {
    const count = signal(10)
    expect(count.update((n) => n + 5)).toBe(15)
    expect(count()).toBe(15)
  })

  it('peek() reads without tracking', () => {
    const count = signal(0)
    const runs = vi.fn()
    effect(() => {
      runs()
      count.peek() // peek must NOT subscribe
    })
    expect(runs).toHaveBeenCalledTimes(1)
    count.set(1)
    expect(runs).toHaveBeenCalledTimes(1) // not re-run
  })

  it('does not notify when the value is unchanged (default ===)', () => {
    const count = signal(1)
    const runs = vi.fn()
    effect(() => {
      count()
      runs()
    })
    expect(runs).toHaveBeenCalledTimes(1)
    count.set(1) // same value
    expect(runs).toHaveBeenCalledTimes(1)
  })

  it('equals: false always notifies', () => {
    const s = signal(1, { equals: false })
    const runs = vi.fn()
    effect(() => {
      s()
      runs()
    })
    expect(runs).toHaveBeenCalledTimes(1)
    s.set(1) // same value, but equals:false → still notifies
    expect(runs).toHaveBeenCalledTimes(2)
  })

  it('supports a custom equality comparator', () => {
    const point = signal({ x: 0 }, { equals: (a, b) => a.x === b.x })
    const seen = vi.fn()
    effect(() => {
      seen(point().x)
    })
    expect(seen).toHaveBeenCalledTimes(1)
    point.set({ x: 0 }) // equal by comparator → no notify
    expect(seen).toHaveBeenCalledTimes(1)
    point.set({ x: 1 }) // different → notify
    expect(seen).toHaveBeenCalledTimes(2)
  })

  it('feeds computed values', () => {
    const a = signal(2)
    const b = signal(3)
    const sum = computed(() => a() + b())
    expect(sum()).toBe(5)
    a.set(10)
    expect(sum()).toBe(13)
  })
})
