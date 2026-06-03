import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import {
  type VersionVector,
  vvDominates,
  vvEquals,
  vvGet,
  vvMerge,
  vvObserve,
} from './version-vector'

describe('version-vector', () => {
  it('get/observe', () => {
    let vv: VersionVector = {}
    expect(vvGet(vv, 'a')).toBe(0)
    vv = vvObserve(vv, 'a', 5)
    expect(vvGet(vv, 'a')).toBe(5)
    vv = vvObserve(vv, 'a', 3) // lower → no change
    expect(vvGet(vv, 'a')).toBe(5)
    vv = vvObserve(vv, 'a', 7)
    expect(vvGet(vv, 'a')).toBe(7)
  })

  it('merge takes the per-replica maximum', () => {
    expect(vvMerge({ a: 3, b: 1 }, { a: 1, b: 4, c: 2 })).toEqual({ a: 3, b: 4, c: 2 })
  })

  it('dominates + equals', () => {
    expect(vvDominates({ a: 3, b: 2 }, { a: 3, b: 1 })).toBe(true)
    expect(vvDominates({ a: 3 }, { a: 3, b: 1 })).toBe(false)
    expect(vvEquals({ a: 1, b: 0 }, { a: 1 })).toBe(true) // zero entries don't matter
    expect(vvEquals({ a: 1 }, { a: 2 })).toBe(false)
  })

  it('handles a __proto__ nodeId safely (no data loss, no pollution)', () => {
    // Arrives as an own data key from untrusted JSON, not an object literal.
    const a: VersionVector = JSON.parse('{"__proto__": 3, "x": 1}')
    const b: VersionVector = JSON.parse('{"__proto__": 5}')
    expect(vvGet(a, '__proto__')).toBe(3)
    const merged = vvMerge(a, b)
    expect(vvGet(merged, '__proto__')).toBe(5) // not silently dropped
    expect(vvGet(merged, 'x')).toBe(1)
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
  })

  it('does not mutate inputs', () => {
    const a = { a: 1 }
    const b = { b: 2 }
    vvMerge(a, b)
    vvObserve(a, 'a', 9)
    expect(a).toEqual({ a: 1 })
    expect(b).toEqual({ b: 2 })
  })

  describe('properties', () => {
    const arbVv = fc.dictionary(
      fc.string({ minLength: 1, maxLength: 4 }),
      fc.integer({ min: 0, max: 1000 }),
      { maxKeys: 6 },
    )

    it('merge is commutative, associative, idempotent, and dominates both inputs', () => {
      fc.assert(
        fc.property(arbVv, arbVv, arbVv, (a, b, c) => {
          expect(vvEquals(vvMerge(a, b), vvMerge(b, a))).toBe(true) // commutative
          expect(vvEquals(vvMerge(vvMerge(a, b), c), vvMerge(a, vvMerge(b, c)))).toBe(true) // associative
          expect(vvEquals(vvMerge(a, a), a)).toBe(true) // idempotent
          const m = vvMerge(a, b)
          expect(vvDominates(m, a)).toBe(true)
          expect(vvDominates(m, b)).toBe(true)
        }),
        { numRuns: 200 },
      )
    })
  })
})
