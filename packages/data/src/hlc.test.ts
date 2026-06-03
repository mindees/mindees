import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { compareHlc, createClock, decodeHlc, encodeHlc, type Hlc } from './hlc'

describe('hlc — clock', () => {
  it('tick() is monotonic even when wall time does not advance', () => {
    const clock = createClock({ nodeId: 'a', now: () => 1000 }) // frozen wall clock
    const a = clock.tick()
    const b = clock.tick()
    const c = clock.tick()
    expect(a).toEqual({ wallMs: 1000, counter: 0, nodeId: 'a' })
    expect(b).toEqual({ wallMs: 1000, counter: 1, nodeId: 'a' })
    expect(c.counter).toBe(2)
    expect(compareHlc(a, b)).toBe(-1)
    expect(compareHlc(b, c)).toBe(-1)
  })

  it('tick() resets the counter when wall time advances', () => {
    let t = 1000
    const clock = createClock({ nodeId: 'a', now: () => t })
    clock.tick() // (1000, 0)
    clock.tick() // (1000, 1)
    t = 1001
    expect(clock.tick()).toEqual({ wallMs: 1001, counter: 0, nodeId: 'a' })
  })

  it('update(remote) returns a timestamp strictly greater than both local and remote', () => {
    const clock = createClock({ nodeId: 'a', now: () => 1000 })
    const local = clock.tick() // (1000,0,a)
    const remote: Hlc = { wallMs: 5000, counter: 9, nodeId: 'b' } // far ahead
    const merged = clock.update(remote)
    expect(merged.wallMs).toBe(5000)
    expect(merged.counter).toBe(10) // remote.counter + 1
    expect(compareHlc(local, merged)).toBe(-1)
    expect(compareHlc(remote, merged)).toBe(-1)
    // subsequent local tick stays ahead of the merged remote time
    expect(compareHlc(merged, clock.tick())).toBe(-1)
  })
})

describe('hlc — compare + encode', () => {
  it('compareHlc orders by (wallMs, counter, nodeId)', () => {
    expect(
      compareHlc({ wallMs: 1, counter: 0, nodeId: 'a' }, { wallMs: 2, counter: 0, nodeId: 'a' }),
    ).toBe(-1)
    expect(
      compareHlc({ wallMs: 2, counter: 0, nodeId: 'a' }, { wallMs: 2, counter: 1, nodeId: 'a' }),
    ).toBe(-1)
    expect(
      compareHlc({ wallMs: 2, counter: 1, nodeId: 'a' }, { wallMs: 2, counter: 1, nodeId: 'b' }),
    ).toBe(-1)
    expect(
      compareHlc({ wallMs: 2, counter: 1, nodeId: 'a' }, { wallMs: 2, counter: 1, nodeId: 'a' }),
    ).toBe(0)
  })

  it('encode/decode round-trips, incl. a nodeId containing a colon', () => {
    const h: Hlc = { wallMs: 1717372800000, counter: 42, nodeId: 'device:7' }
    expect(decodeHlc(encodeHlc(h))).toEqual(h)
  })

  it('encodeHlc throws (not silently mis-sorts) on an out-of-range field', () => {
    expect(() => encodeHlc({ wallMs: 0, counter: 1_000_000, nodeId: 'a' })).toThrow(RangeError)
    expect(() => encodeHlc({ wallMs: 10 ** 15, counter: 0, nodeId: 'a' })).toThrow(RangeError)
  })

  it('decodeHlc rejects malformed numeric fields', () => {
    expect(() => decodeHlc(':0:a')).toThrow(TypeError) // empty wall would Number('')===0 silently
    expect(() => decodeHlc('12:x:a')).toThrow(TypeError)
    expect(() => decodeHlc('nocolons')).toThrow(TypeError)
  })
})

describe('hlc — untrusted-input hardening', () => {
  it('rolls a counter overflow into wall time (stays monotonic + encodable)', () => {
    const clock = createClock({ nodeId: 'a', now: () => 1000 }) // frozen clock
    let last = clock.tick()
    let maxCounter = last.counter
    for (let i = 0; i < 1_000_005; i++) {
      const next = clock.tick()
      if (compareHlc(last, next) !== -1) throw new Error(`not monotonic at ${i}`)
      if (next.counter > maxCounter) maxCounter = next.counter
      last = next
    }
    expect(maxCounter).toBeLessThanOrEqual(999_999) // counter never exceeds the encodable width
    expect(last.wallMs).toBeGreaterThan(1000) // overflow borrowed from wall time
    expect(() => encodeHlc(last)).not.toThrow()
  })

  it('update() rejects a far-future or malformed remote (cannot poison the clock)', () => {
    const clock = createClock({ nodeId: 'a', now: () => 1_000_000, maxClockDriftMs: 60_000 })
    expect(() => clock.update({ wallMs: 1e16, counter: 0, nodeId: 'evil' })).toThrow(TypeError)
    expect(() => clock.update({ wallMs: 1.5, counter: 0, nodeId: 'b' })).toThrow(TypeError)
    expect(() => clock.update({ wallMs: 1000, counter: -1, nodeId: 'b' })).toThrow(TypeError)
    // a remote within drift is accepted and the clock stays usable
    expect(() => clock.update({ wallMs: 1_030_000, counter: 0, nodeId: 'b' })).not.toThrow()
    expect(() => encodeHlc(clock.tick())).not.toThrow()
  })
})

describe('hlc — properties', () => {
  const arbHlc = fc.record({
    wallMs: fc.integer({ min: 0, max: 9_999_999_999_999 }),
    counter: fc.integer({ min: 0, max: 999_999 }),
    nodeId: fc.string({ minLength: 1, maxLength: 8 }).filter((s) => !s.includes(':')),
  })

  it('a local sequence of tick/update is strictly increasing', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.oneof(
            fc.constant<{ kind: 'tick' }>({ kind: 'tick' }),
            arbHlc.map((remote) => ({ kind: 'update' as const, remote })),
          ),
          { minLength: 1, maxLength: 50 },
        ),
        fc.array(fc.integer({ min: 0, max: 10_000 }), { minLength: 50, maxLength: 50 }),
        (ops, times) => {
          let i = 0
          // Infinity drift here isolates the monotonicity law from the drift guard
          // (the drift rejection is covered by its own unit test).
          const clock = createClock({
            nodeId: 'me',
            now: () => times[i % times.length] as number,
            maxClockDriftMs: Number.POSITIVE_INFINITY,
          })
          let prev: Hlc | null = null
          for (const op of ops) {
            i++
            const ts = op.kind === 'tick' ? clock.tick() : clock.update(op.remote)
            if (prev) expect(compareHlc(prev, ts)).toBe(-1)
            if (op.kind === 'update') expect(compareHlc(op.remote, ts)).toBe(-1)
            prev = ts
          }
        },
      ),
      { numRuns: 200 },
    )
  })

  it('compareHlc is a total order and encodeHlc sort matches it', () => {
    fc.assert(
      fc.property(fc.array(arbHlc, { minLength: 2, maxLength: 40 }), (hlcs) => {
        for (const a of hlcs) expect(compareHlc(a, a)).toBe(0) // reflexive-equal
        for (const a of hlcs)
          for (const b of hlcs)
            expect(compareHlc(a, b)).toBe((-compareHlc(b, a) || 0) as -1 | 0 | 1) // antisymmetric
        const byCompare = [...hlcs].sort(compareHlc)
        const byEncode = [...hlcs].sort((a, b) =>
          encodeHlc(a) < encodeHlc(b) ? -1 : encodeHlc(a) > encodeHlc(b) ? 1 : 0,
        )
        expect(byEncode.map(encodeHlc)).toEqual(byCompare.map(encodeHlc))
      }),
      { numRuns: 200 },
    )
  })
})
