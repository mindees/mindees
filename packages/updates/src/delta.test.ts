import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { utf8 } from './crypto'
import { applyDelta, diff } from './delta'
import { UpdateError } from './errors'

/** Round-trip: applying the delta to base must reconstruct target exactly. */
function roundTrip(base: Uint8Array, target: Uint8Array): Uint8Array {
  const delta = diff(base, target)
  const out = applyDelta(base, delta)
  expect([...out]).toEqual([...target])
  return delta
}

const bytes = (s: string) => utf8(s)
const rep = (s: string, n: number) => bytes(s.repeat(n))

/** Encode a non-negative integer as an unsigned LEB128 varint (mirrors delta.ts). */
function encodeVarint(value: number): number[] {
  const out: number[] = []
  let v = value
  while (v >= 0x80) {
    out.push((v % 0x80) | 0x80)
    v = Math.floor(v / 0x80)
  }
  out.push(v)
  return out
}

describe('delta — round-trip correctness (edge cases)', () => {
  it('handles empty base and empty target', () => {
    roundTrip(new Uint8Array(), new Uint8Array())
    roundTrip(new Uint8Array(), bytes('hello world'))
    roundTrip(bytes('hello world'), new Uint8Array())
  })

  it('handles identical base and target', () => {
    const b = rep('abcdefgh', 50) // 400 bytes, well above the 64-byte block
    roundTrip(b, b)
  })

  it('handles a tiny base/target (below the block size → whole-target insert)', () => {
    roundTrip(bytes('abc'), bytes('abcd'))
    roundTrip(bytes('x'), bytes('y'))
  })

  it('handles append, prepend, and a localized middle edit', () => {
    const base = rep('The quick brown fox. ', 40) // ~840 bytes
    roundTrip(base, new Uint8Array([...base, ...bytes('APPENDED')]))
    roundTrip(base, new Uint8Array([...bytes('PREPENDED'), ...base]))
    const mid = Math.floor(base.length / 2)
    roundTrip(
      base,
      new Uint8Array([...base.subarray(0, mid), ...bytes('EDIT'), ...base.subarray(mid)]),
    )
  })

  it('handles a total replacement (no common content)', () => {
    roundTrip(rep('aaaa', 100), rep('bbbb', 100))
  })

  it('handles a match spanning a block boundary and adjacent copies', () => {
    const base = rep('0123456789', 30) // 300 bytes
    // delete a 5-byte span from the middle → two copies around the gap
    const cut = 137
    roundTrip(base, new Uint8Array([...base.subarray(0, cut), ...base.subarray(cut + 5)]))
  })

  it('handles highly repetitive content (rolling-hash collisions confirmed by byte compare)', () => {
    const base = rep('A', 500)
    roundTrip(base, rep('A', 480)) // shorter
    roundTrip(base, new Uint8Array([...rep('A', 250), ...bytes('B'), ...rep('A', 250)]))
  })

  it('actually compresses a small edit to a large base', () => {
    const base = rep('mindees-native-bundle-', 5000) // ~110 KB
    const target = new Uint8Array([
      ...base.subarray(0, 1000),
      ...bytes('PATCH'),
      ...base.subarray(1000),
    ])
    const delta = roundTrip(base, target)
    // a 5-byte insertion must produce a delta far smaller than the full target
    expect(delta.length).toBeLessThan(target.length / 10)
  })
})

describe('delta — applyDelta rejects malformed/forged input (DELTA_INVALID)', () => {
  const base = rep('0123456789', 20)

  it('rejects an unsupported version byte', () => {
    expect(() => applyDelta(base, new Uint8Array([99, 0]))).toThrow(UpdateError)
  })

  it('rejects a truncated delta', () => {
    const delta = diff(base, new Uint8Array([...base, ...bytes('xyz')]))
    expect(() => applyDelta(base, delta.subarray(0, delta.length - 2))).toThrow(UpdateError)
  })

  it('rejects a COPY out of base bounds', () => {
    // version=1, targetLen=5, COPY(len=5) at zigzag offset 1000 ([208,15]) → off 1000 ≫ base.len 200
    expect(() => applyDelta(base, new Uint8Array([1, 5, 10, 208, 15]))).toThrow(UpdateError)
  })

  it('rejects a delta whose ops underfill the declared target length', () => {
    // version=1, targetLen=10, INSERT(len=5) of 5 bytes → only 5 of 10 filled
    const delta = new Uint8Array([1, 10, 11, 1, 2, 3, 4, 5])
    expect(() => applyDelta(base, delta)).toThrow(UpdateError)
  })

  it('rejects a target larger than maxBytes (decompression-bomb guard)', () => {
    const target = new Uint8Array([...base, ...bytes('more')])
    const delta = diff(base, target)
    expect(() => applyDelta(base, delta, { maxBytes: 1 })).toThrow(UpdateError)
  })

  it('surfaces an un-allocatable target length as DELTA_INVALID, not a raw RangeError', () => {
    // A forged targetLen that passes a deliberately-high maxBytes but cannot be allocated.
    const huge = 9e15 // < 2^53 (safe integer) but far beyond an allocatable typed array
    const bomb = new Uint8Array([1, ...encodeVarint(huge)])
    let err: unknown
    try {
      applyDelta(base, bomb, { maxBytes: Number.MAX_SAFE_INTEGER })
    } catch (e) {
      err = e
    }
    expect(err).toBeInstanceOf(UpdateError)
    expect((err as UpdateError).code).toBe('DELTA_INVALID')
  })

  it('rejects a varint that decodes outside the 53-bit safe-integer range', () => {
    // version=1, then an 8-byte varint (7×0xFF + 0x7F) ≈ 2^56 → not a safe integer
    const overflow = new Uint8Array([1, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0x7f])
    expect(() => applyDelta(base, overflow)).toThrow(UpdateError)
  })
})

describe('delta — property: applyDelta(base, diff(base, target)) === target', () => {
  it('holds for arbitrary byte pairs', () => {
    fc.assert(
      fc.property(fc.uint8Array({ maxLength: 600 }), fc.uint8Array({ maxLength: 600 }), (a, b) => {
        const out = applyDelta(a, diff(a, b))
        return out.length === b.length && out.every((v, i) => v === b[i])
      }),
      { numRuns: 300 },
    )
  })

  it('holds for structurally-mutated targets (the realistic bundle-edit case)', () => {
    fc.assert(
      fc.property(
        fc.uint8Array({ minLength: 80, maxLength: 800 }),
        fc.nat(),
        fc.nat(),
        fc.uint8Array({ maxLength: 60 }),
        (base, posSeed, lenSeed, insert) => {
          const pos = base.length === 0 ? 0 : posSeed % base.length
          const delLen = lenSeed % (base.length - pos + 1)
          const target = new Uint8Array([
            ...base.subarray(0, pos),
            ...insert,
            ...base.subarray(pos + delLen),
          ])
          const out = applyDelta(base, diff(base, target))
          return out.length === target.length && out.every((v, i) => v === target[i])
        },
      ),
      { numRuns: 300 },
    )
  })
})
