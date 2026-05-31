import { describe, expect, it, vi } from 'vitest'
import { computed, effect, signal } from './reactive'

describe('glitch freedom', () => {
  it('recomputes a diamond consumer exactly once per change', () => {
    // a → b1, a → b2, (b1,b2) → c → effect
    const a = signal(1)
    const b1 = computed(() => a() + 1)
    const b2 = computed(() => a() * 10)
    const cFn = vi.fn(() => b1() + b2())
    const c = computed(cFn)

    const seen: number[] = []
    effect(() => seen.push(c()))

    expect(seen).toEqual([12]) // (1+1) + (1*10)
    expect(cFn).toHaveBeenCalledTimes(1)

    a.set(2)
    expect(seen).toEqual([12, 23]) // (2+1) + (2*10); never an intermediate like 21 or 13
    expect(cFn).toHaveBeenCalledTimes(2) // exactly one recompute, not two
  })

  it('never exposes an inconsistent intermediate state', () => {
    const a = signal(1)
    const doubled = computed(() => a() * 2)
    // invariant: observed value is always exactly 3 * a()
    const sumFn = vi.fn(() => a() + doubled())
    const sum = computed(sumFn)

    const observed: number[] = []
    effect(() => observed.push(sum()))

    for (let i = 2; i <= 5; i++) a.set(i)

    expect(observed).toEqual([3, 6, 9, 12, 15])
    // one run on creation + one per distinct change = 5 total
    expect(sumFn).toHaveBeenCalledTimes(5)
  })

  it('updates each intermediate node once across a wide diamond', () => {
    const a = signal(0)
    const branches = Array.from({ length: 5 }, (_, i) => computed(() => a() + i))
    const joinFn = vi.fn(() => branches.reduce((acc, b) => acc + b(), 0))
    const join = computed(joinFn)

    const seen: number[] = []
    effect(() => seen.push(join()))

    expect(seen).toEqual([0 + 1 + 2 + 3 + 4]) // 10
    a.set(10)
    expect(seen).toEqual([10, 10 * 5 + (0 + 1 + 2 + 3 + 4)]) // 50 + 10 = 60
    expect(joinFn).toHaveBeenCalledTimes(2)
  })
})
