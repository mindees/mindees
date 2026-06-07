import { describe, expect, it } from 'vitest'
import { counterDec, counterInc, counterValue, emptyCounter, mergeCounter } from './counter'

describe('PN-Counter', () => {
  it('increments and decrements', () => {
    let c = emptyCounter()
    expect(counterValue(c)).toBe(0)
    c = counterInc(c, 'a', 5)
    c = counterDec(c, 'a', 2)
    expect(counterValue(c)).toBe(3)
  })

  it('ignores non-positive amounts (no-op)', () => {
    const c = emptyCounter()
    expect(counterValue(counterInc(c, 'a', 0))).toBe(0)
    expect(counterValue(counterInc(c, 'a', -3))).toBe(0)
    expect(counterValue(counterDec(c, 'a', -3))).toBe(0)
  })

  it('merges concurrent replica edits without losing updates', () => {
    // Two replicas each increment from the same empty counter (concurrent, no coordination).
    const a = counterInc(counterInc(emptyCounter(), 'a'), 'a') // a: +2
    const b = counterInc(emptyCounter(), 'b', 5) // b: +5
    expect(counterValue(mergeCounter(a, b))).toBe(7) // both contributions survive
  })

  it('merge is commutative, associative, and idempotent (replicas converge)', () => {
    const a = counterDec(counterInc(emptyCounter(), 'a', 10), 'a', 1) // 9
    const b = counterInc(emptyCounter(), 'b', 4) // 4
    const c = counterDec(emptyCounter(), 'c', 2) // -2
    const ab = mergeCounter(a, b)
    const v = counterValue(mergeCounter(ab, c))
    expect(v).toBe(11) // 9 + 4 - 2
    // commutative + associative: any merge order yields the same value
    expect(counterValue(mergeCounter(c, mergeCounter(b, a)))).toBe(v)
    // idempotent: merging a state with itself (or a subset) changes nothing
    expect(counterValue(mergeCounter(ab, a))).toBe(counterValue(ab))
    expect(mergeCounter(ab, ab)).toEqual(ab)
  })

  it('a later state from the same replica supersedes an earlier one on merge (per-replica max)', () => {
    const early = counterInc(emptyCounter(), 'a', 3)
    const late = counterInc(early, 'a', 4) // a total = 7
    // Merging early into late must not double-count or regress.
    expect(counterValue(mergeCounter(late, early))).toBe(7)
  })
})
