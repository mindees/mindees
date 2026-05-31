import { describe, expect, it, vi } from 'vitest'
import { computed, effect, signal, untrack } from './reactive'

describe('untrack', () => {
  it('reads without creating a dependency', () => {
    const a = signal(1)
    const b = signal(2)
    const fn = vi.fn(() => a() + untrack(() => b()))
    effect(fn)
    expect(fn).toHaveBeenCalledTimes(1)

    b.set(20) // untracked → no re-run
    expect(fn).toHaveBeenCalledTimes(1)

    a.set(10) // tracked → re-run, and sees latest b
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('returns the callback value', () => {
    const a = signal(5)
    expect(untrack(() => a())).toBe(5)
  })

  it('works inside computed', () => {
    const a = signal(1)
    const b = signal(100)
    const c = computed(() => a() + untrack(() => b()))
    expect(c()).toBe(101)
    b.set(200) // untracked
    expect(c()).toBe(101) // unchanged (a didn't change)
    a.set(2)
    expect(c()).toBe(202) // recompute picks up latest b
  })
})
