import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import type { Hlc } from './hlc'
import { type LwwMap, lwwDelete, lwwGet, lwwHas, lwwKeys, lwwSet, mergeLwwMap } from './lww'

const hlc = (wallMs: number, counter: number, nodeId: string): Hlc => ({ wallMs, counter, nodeId })

describe('lww-map', () => {
  it('set/get/delete with last-write-wins by stamp', () => {
    let m: LwwMap<string> = {}
    m = lwwSet(m, 'name', 'A', hlc(1, 0, 'a'))
    expect(lwwGet(m, 'name')).toBe('A')
    m = lwwSet(m, 'name', 'B', hlc(2, 0, 'a')) // greater stamp wins
    expect(lwwGet(m, 'name')).toBe('B')
    m = lwwSet(m, 'name', 'STALE', hlc(1, 0, 'a')) // lower stamp must NOT regress
    expect(lwwGet(m, 'name')).toBe('B')
    m = lwwDelete(m, 'name', hlc(3, 0, 'a'))
    expect(lwwGet(m, 'name')).toBeUndefined()
    expect(lwwHas(m, 'name')).toBe(false)
  })

  it('merges different fields concurrently (per-field, not whole-record)', () => {
    // two replicas edit different fields of the same record offline
    let a: LwwMap<string> = lwwSet({}, 'title', 'Hello', hlc(1, 0, 'a'))
    const b: LwwMap<string> = lwwSet({}, 'body', 'World', hlc(1, 0, 'b'))
    a = lwwSet(a, 'body', 'World-from-a', hlc(2, 0, 'a')) // a also edits body later
    const merged = mergeLwwMap(a, b)
    expect(lwwGet(merged, 'title')).toBe('Hello') // a's title survives
    expect(lwwGet(merged, 'body')).toBe('World-from-a') // higher stamp wins for body
    expect(lwwKeys(merged).sort()).toEqual(['body', 'title'])
  })

  it('merge converges regardless of order (commutative)', () => {
    const a = lwwSet({}, 'x', '1', hlc(5, 0, 'a'))
    const b = lwwSet({}, 'x', '2', hlc(5, 0, 'b')) // same wall/counter, tie broken by nodeId
    expect(lwwGet(mergeLwwMap(a, b), 'x')).toBe(lwwGet(mergeLwwMap(b, a), 'x'))
  })

  it('breaks a SAME-STAMP, different-content tie commutatively (no divergence)', () => {
    const s = hlc(5, 0, 'a') // identical stamp on two different writes (reused nodeId / hostile peer)
    const setReg = lwwSet<string>({}, 'f', 'V', s)
    const delReg = lwwDelete<string>({}, 'f', s)
    // delete wins, regardless of merge order
    expect(lwwGet(mergeLwwMap(setReg, delReg), 'f')).toBe(lwwGet(mergeLwwMap(delReg, setReg), 'f'))
    expect(lwwHas(mergeLwwMap(setReg, delReg), 'f')).toBe(false)
    // two different values at the same stamp also converge
    const v1 = lwwSet<string>({}, 'f', 'V1', s)
    const v2 = lwwSet<string>({}, 'f', 'V2', s)
    expect(lwwGet(mergeLwwMap(v1, v2), 'f')).toBe(lwwGet(mergeLwwMap(v2, v1), 'f'))
  })
})

describe('lww-map — CvRDT laws', () => {
  // Deliberately TINY ranges so two different registers frequently share a stamp —
  // that collision is exactly the non-commutativity hazard, so the suite must hit it.
  const arbHlc = fc.record({
    wallMs: fc.integer({ min: 0, max: 2 }),
    counter: fc.integer({ min: 0, max: 1 }),
    nodeId: fc.constantFrom('a', 'b'),
  })
  const arbReg = fc.oneof(
    fc.record({
      stamp: arbHlc,
      op: fc.constant('set' as const),
      value: fc.integer({ min: 0, max: 2 }),
    }),
    fc.record({ stamp: arbHlc, op: fc.constant('del' as const) }),
  )
  const arbMap = fc.dictionary(fc.constantFrom('f1', 'f2', 'f3'), arbReg, {
    maxKeys: 3,
  }) as fc.Arbitrary<LwwMap<number>>

  const eq = (a: LwwMap<number>, b: LwwMap<number>): boolean => {
    const keys = new Set([...lwwKeys(a), ...lwwKeys(b)])
    for (const k of keys) if (lwwGet(a, k) !== lwwGet(b, k)) return false
    return true
  }

  it('is commutative, associative, and idempotent', () => {
    fc.assert(
      fc.property(arbMap, arbMap, arbMap, (a, b, c) => {
        expect(eq(mergeLwwMap(a, b), mergeLwwMap(b, a))).toBe(true)
        expect(eq(mergeLwwMap(mergeLwwMap(a, b), c), mergeLwwMap(a, mergeLwwMap(b, c)))).toBe(true)
        expect(eq(mergeLwwMap(a, a), a)).toBe(true)
      }),
      { numRuns: 300 },
    )
  })

  it('converges under any merge order', () => {
    fc.assert(
      fc.property(fc.array(arbMap, { minLength: 2, maxLength: 6 }), (maps) => {
        const left = maps.reduce((acc, m) => mergeLwwMap(acc, m))
        const right = [...maps].reverse().reduce((acc, m) => mergeLwwMap(acc, m))
        expect(eq(left, right)).toBe(true)
      }),
      { numRuns: 200 },
    )
  })
})
