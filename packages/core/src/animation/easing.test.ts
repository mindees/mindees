import { describe, expect, it } from 'vitest'
import { cubicBezier, easeInOutQuad, easeOutCubic, linear } from './easing'

describe('easing', () => {
  it('named curves hit the endpoints', () => {
    for (const e of [linear, easeInOutQuad, easeOutCubic]) {
      expect(e(0)).toBeCloseTo(0)
      expect(e(1)).toBeCloseTo(1)
    }
  })

  it('cubicBezier parses an Atlas-style token (spaces tolerated) and is monotonic on [0,1]', () => {
    const e = cubicBezier('cubic-bezier(0.2, 0, 0, 1)') // tokens.easing.standard
    expect(e(0)).toBe(0)
    expect(e(1)).toBe(1)
    expect(e(0.5)).toBeGreaterThan(0)
    expect(e(0.5)).toBeLessThan(1)
    expect(e(0.75)).toBeGreaterThan(e(0.25)) // monotonic
  })

  it('falls back to linear on a malformed string and never returns NaN', () => {
    expect(cubicBezier('nonsense')(0.5)).toBe(0.5)
    expect(cubicBezier('cubic-bezier(1,2)')(0.5)).toBe(0.5) // wrong arity
    expect(Number.isNaN(cubicBezier('cubic-bezier(0.4,0,0.2,1)')(0.42))).toBe(false)
  })
})
