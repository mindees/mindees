import { describe, expect, it, vi } from 'vitest'
import { computed, effect, signal } from './reactive'

// Regression: a computed with a CUSTOM equals must not invoke the comparator
// against its uninitialized placeholder value on the first computation.
// (A comparator like `(a, b) => a.length === b.length` would throw on undefined.)
describe('computed with custom equals — first computation', () => {
  it('does not call equals against the initial placeholder (no throw)', () => {
    const src = signal([1, 2, 3])
    const arrayEquals = vi.fn(
      (a: number[], b: number[]) => a.length === b.length && a.every((v, i) => v === b[i]),
    )
    const items = computed(() => src(), { equals: arrayEquals })

    // First read computes; equals must NOT be called yet (no prior value).
    expect(() => items()).not.toThrow()
    expect(items()).toEqual([1, 2, 3])
    expect(arrayEquals).not.toHaveBeenCalled()

    // Second computation DOES compare (equal contents → no propagation).
    const runs = vi.fn()
    effect(() => {
      items()
      runs()
    })
    expect(runs).toHaveBeenCalledTimes(1)
    src.set([1, 2, 3]) // structurally equal
    expect(arrayEquals).toHaveBeenCalled()
    expect(runs).toHaveBeenCalledTimes(1) // isolated by custom equals

    src.set([9]) // different
    expect(runs).toHaveBeenCalledTimes(2)
  })

  it('first computation is treated as changed (observers run once)', () => {
    const src = signal(2)
    const parity = computed(() => src() % 2 === 0, { equals: (a, b) => a === b })
    const seen: boolean[] = []
    effect(() => seen.push(parity()))
    expect(seen).toEqual([true]) // initial computation propagated
  })
})
