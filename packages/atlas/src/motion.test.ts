import { animate, cubicBezier, manualFrameSource, setFrameSource } from '@mindees/core'
import { _resetAnimation } from '@mindees/core/testing'
import { afterEach, describe, expect, it } from 'vitest'
import { animateTo, motion } from './motion'
import { easing } from './tokens'

afterEach(() => _resetAnimation())

describe('atlas motion', () => {
  it('maps each easing token to the core cubicBezier of the SAME control points (single source of truth)', () => {
    for (const name of ['standard', 'decelerate', 'accelerate'] as const) {
      const fn = motion[name]
      const ref = cubicBezier(easing[name])
      expect(fn(0)).toBe(0)
      expect(fn(1)).toBe(1)
      expect(fn(0.42)).toBeCloseTo(ref(0.42), 6) // identical curve
    }
  })

  it('animateTo drives a value with the standard token defaults', () => {
    const m = manualFrameSource()
    setFrameSource(m.source)
    const x = animate(0)
    const h = animateTo(x, 100) // duration.standard = 250ms, motion.standard easing
    m.tick(0)
    m.tick(250)
    expect(x()).toBe(100)
    return expect(h.done).resolves.toBe(true)
  })
})
