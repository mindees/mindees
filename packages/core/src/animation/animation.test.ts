import { afterEach, describe, expect, it, vi } from 'vitest'
import { createRoot, effect, signal } from '../reactive'
import {
  _activeAnimationCount,
  _resetAnimation,
  animate,
  interpolate,
  linear,
  manualFrameSource,
  setFrameSource,
  spring,
  timing,
} from './index'

afterEach(() => _resetAnimation())

describe('animate + frame loop', () => {
  it('reading an animated value re-runs an effect when a driver writes it', () => {
    const m = manualFrameSource()
    setFrameSource(m.source)
    const av = animate(0)
    const seen: number[] = []
    createRoot(() => effect(() => seen.push(av())))
    expect(seen).toEqual([0])
    timing(av, { to: 100, duration: 100, easing: linear })
    m.tick(0)
    m.tick(50)
    expect(av()).toBeCloseTo(50)
    expect(seen).toContain(50)
  })

  it('timing interpolates deterministically and snaps to the target exactly', async () => {
    const m = manualFrameSource()
    setFrameSource(m.source)
    const av = animate(0)
    const h = timing(av, { to: 100, duration: 100, easing: linear })
    m.tick(0)
    m.tick(50)
    expect(av()).toBeCloseTo(50)
    m.tick(100)
    expect(av()).toBe(100)
    await expect(h.done).resolves.toBe(true)
    expect(_activeAnimationCount()).toBe(0)
  })

  it('jumps to the final value synchronously when no frame source is set (SSR/headless)', async () => {
    const av = animate(0) // no setFrameSource → frameSource is null
    const h = timing(av, { to: 42, duration: 100 })
    expect(av()).toBe(42)
    expect(_activeAnimationCount()).toBe(0)
    await expect(h.done).resolves.toBe(true)
  })

  it('ticks all animations in ONE batch per frame (glitch-free)', () => {
    const m = manualFrameSource()
    setFrameSource(m.source)
    const x = animate(0)
    const o = animate(0)
    let runs = 0
    createRoot(() =>
      effect(() => {
        x()
        o()
        runs++
      }),
    )
    expect(runs).toBe(1)
    timing(x, { to: 100, duration: 100, easing: linear })
    timing(o, { to: 1, duration: 100, easing: linear })
    m.tick(0) // elapsed 0 → no writes
    m.tick(50) // both write in one batch → effect runs ONCE
    expect(runs).toBe(2)
  })

  it('stop() mid-flight keeps the current value; done resolves false', async () => {
    const m = manualFrameSource()
    setFrameSource(m.source)
    const av = animate(0)
    const h = timing(av, { to: 100, duration: 100, easing: linear })
    m.tick(0)
    m.tick(50)
    h.stop()
    expect(av()).toBeCloseTo(50) // NOT snapped to 100
    expect(_activeAnimationCount()).toBe(0)
    await expect(h.done).resolves.toBe(false)
  })

  it('retargeting starts from the current value; the prior animation resolves false', async () => {
    const m = manualFrameSource()
    setFrameSource(m.source)
    const av = animate(0)
    const h1 = timing(av, { to: 100, duration: 100, easing: linear })
    m.tick(0)
    m.tick(50) // av ~50
    const h2 = timing(av, { to: 0, duration: 100, easing: linear })
    await expect(h1.done).resolves.toBe(false)
    m.tick(100) // h2 first tick (start)
    m.tick(200) // elapsed 100 → done
    expect(av()).toBe(0)
    await expect(h2.done).resolves.toBe(true)
  })

  it('spring converges to the target and terminates', async () => {
    const m = manualFrameSource()
    setFrameSource(m.source)
    const av = animate(0)
    const h = spring(av, { to: 1 })
    for (let t = 0; t <= 10000 && _activeAnimationCount() > 0; t += 16) m.tick(t)
    expect(av()).toBe(1)
    expect(_activeAnimationCount()).toBe(0)
    await expect(h.done).resolves.toBe(true)
  })

  it('spring stays finite under a huge frame gap (dt clamped, no explosion)', () => {
    const m = manualFrameSource()
    setFrameSource(m.source)
    const av = animate(0)
    spring(av, { to: 1 })
    m.tick(0)
    m.tick(5000) // 5s gap
    expect(Number.isFinite(av())).toBe(true)
    expect(Math.abs(av())).toBeLessThan(100)
  })

  it('auto-stops on owner disposal (no leaked loop)', () => {
    const m = manualFrameSource()
    setFrameSource(m.source)
    const av = animate(0)
    const dispose = createRoot((d) => {
      timing(av, { to: 100, duration: 1000, easing: linear })
      return d
    })
    expect(_activeAnimationCount()).toBe(1)
    dispose()
    expect(_activeAnimationCount()).toBe(0)
  })

  it('fires done + onComplete exactly once, even with a late stop()', async () => {
    const m = manualFrameSource()
    setFrameSource(m.source)
    const av = animate(0)
    const onComplete = vi.fn()
    const h = timing(av, { to: 1, duration: 50, easing: linear, onComplete })
    m.tick(0)
    m.tick(50)
    await expect(h.done).resolves.toBe(true)
    h.stop() // late stop after natural completion
    expect(onComplete).toHaveBeenCalledTimes(1)
  })
})

describe('interpolate', () => {
  it('maps piecewise-linearly with clamp (default) and extend', () => {
    const v = signal(0)
    const out = interpolate(() => v(), [0, 100], [0, 1])
    expect(out()).toBe(0)
    v.set(50)
    expect(out()).toBe(0.5)
    v.set(150)
    expect(out()).toBe(1) // clamped
    const ext = interpolate(() => v(), [0, 100], [0, 1], { extrapolate: 'extend' })
    expect(ext()).toBeCloseTo(1.5)
  })

  it('selects the right segment and guards inputs', () => {
    const v = signal(150)
    const out = interpolate(() => v(), [0, 100, 200], [0, 10, 0])
    expect(out()).toBe(5) // midpoint of the second segment (10 → 0)
    expect(() => interpolate(() => 0, [0], [0])).toThrow(RangeError)
    expect(() => interpolate(() => 0, [0, 1], [0])).toThrow(RangeError)
  })
})
