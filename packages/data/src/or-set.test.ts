import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { emptyOrSet, mergeOrSet, type OrSet, orAdd, orHas, orRemove, orValues } from './or-set'

describe('or-set', () => {
  it('add/remove/has with unique tags', () => {
    let s = emptyOrSet()
    s = orAdd(s, 'x', 't1')
    expect(orHas(s, 'x')).toBe(true)
    s = orRemove(s, 'x')
    expect(orHas(s, 'x')).toBe(false)
    s = orAdd(s, 'x', 't2') // re-add with a fresh tag works
    expect(orHas(s, 'x')).toBe(true)
    expect(orValues(s)).toEqual(['x'])
  })

  it('add wins over a concurrent remove (observed-remove semantics)', () => {
    // both replicas start with x@t1
    const base = orAdd(emptyOrSet(), 'x', 't1')
    const a = orRemove(base, 'x') // replica A removes the observed t1
    const b = orAdd(base, 'x', 't2') // replica B concurrently re-adds with a new tag
    const merged = mergeOrSet(a, b)
    expect(orHas(merged, 'x')).toBe(true) // t2 was never observed by A's remove → add wins
  })

  it('a remove only tombstones observed tags', () => {
    const base = orAdd(emptyOrSet(), 'x', 't1')
    const removeA = orRemove(base, 'x') // tombstones t1 only
    const withT2 = orAdd(base, 'x', 't2')
    expect(orHas(mergeOrSet(removeA, withT2), 'x')).toBe(true)
  })
})

describe('or-set — CvRDT laws', () => {
  const tag = fc.constantFrom('t1', 't2', 't3', 't4')
  const element = fc.constantFrom('x', 'y', 'z')
  const arbOps = fc.array(
    fc.oneof(
      fc.record({ kind: fc.constant('add' as const), element, tag }),
      fc.record({ kind: fc.constant('remove' as const), element }),
    ),
    { maxLength: 12 },
  )
  const build = (
    ops: ReadonlyArray<
      { kind: 'add'; element: string; tag: string } | { kind: 'remove'; element: string }
    >,
  ): OrSet => {
    let s = emptyOrSet()
    for (const op of ops)
      s = op.kind === 'add' ? orAdd(s, op.element, op.tag) : orRemove(s, op.element)
    return s
  }
  const eq = (a: OrSet, b: OrSet): boolean =>
    JSON.stringify(orValues(a)) === JSON.stringify(orValues(b))

  it('is commutative, associative, and idempotent', () => {
    fc.assert(
      fc.property(arbOps, arbOps, arbOps, (oa, ob, oc) => {
        const a = build(oa)
        const b = build(ob)
        const c = build(oc)
        expect(eq(mergeOrSet(a, b), mergeOrSet(b, a))).toBe(true)
        expect(eq(mergeOrSet(mergeOrSet(a, b), c), mergeOrSet(a, mergeOrSet(b, c)))).toBe(true)
        expect(eq(mergeOrSet(a, a), a)).toBe(true)
      }),
      { numRuns: 300 },
    )
  })

  it('converges under any merge order', () => {
    fc.assert(
      fc.property(fc.array(arbOps, { minLength: 2, maxLength: 5 }), (opSets) => {
        const replicas = opSets.map(build)
        const left = replicas.reduce(mergeOrSet)
        const right = [...replicas].reverse().reduce(mergeOrSet)
        expect(eq(left, right)).toBe(true)
      }),
      { numRuns: 200 },
    )
  })
})
