import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  _activeAnimationCount,
  _resetAnimation,
  animate,
  manualFrameSource,
  setFrameSource,
} from '../animation'
import { panAnimated } from './animated'
import {
  _setGestureClock,
  composeGestures,
  longPress,
  normalizePointer,
  pan,
  pinch,
  type Recognizer,
  swipe,
  tap,
} from './recognizers'

/** A web-style PointerEvent payload. */
const ev = (pointerId: number, x: number, y: number, t: number) => ({
  pointerId,
  clientX: x,
  clientY: y,
  timeStamp: t,
})

let timers: Array<{ fn: () => void; ms: number }> = []
beforeEach(() => {
  timers = []
  _setGestureClock({
    schedule: (fn, ms) => {
      const entry = { fn, ms }
      timers.push(entry)
      return () => {
        timers = timers.filter((t) => t !== entry)
      }
    },
  })
})
const fireTimers = () => {
  const due = [...timers]
  timers = []
  for (const t of due) t.fn()
}

describe('normalizePointer', () => {
  it('reads web PointerEvent and native payload shapes', () => {
    expect(
      normalizePointer({ pointerId: 3, clientX: 10, clientY: 20, timeStamp: 5 }),
    ).toMatchObject({
      pointerId: 3,
      x: 10,
      y: 20,
      t: 5,
    })
    expect(normalizePointer({ pointerId: 7, x: 1, y: 2, timestamp: 9 })).toMatchObject({
      pointerId: 7,
      x: 1,
      y: 2,
      t: 9,
    })
  })
})

describe('tap', () => {
  it('fires on a quick in-place down→up', () => {
    const onTap = vi.fn()
    const g = tap({ onTap })
    g.handlers.onPointerDown(ev(1, 0, 0, 0))
    g.handlers.onPointerUp(ev(1, 2, 2, 100))
    expect(onTap).toHaveBeenCalledTimes(1)
  })
  it('does NOT fire when the pointer moves past the slop', () => {
    const onTap = vi.fn()
    const g = tap({ onTap })
    g.handlers.onPointerDown(ev(1, 0, 0, 0))
    g.handlers.onPointerMove(ev(1, 40, 0, 50))
    g.handlers.onPointerUp(ev(1, 40, 0, 100))
    expect(onTap).not.toHaveBeenCalled()
  })
})

describe('longPress', () => {
  it('fires after the timer with no slop; up after fire calls onEnd', () => {
    const onLongPress = vi.fn()
    const onEnd = vi.fn()
    const g = longPress({ onLongPress, onEnd })
    g.handlers.onPointerDown(ev(1, 0, 0, 0))
    expect(onLongPress).not.toHaveBeenCalled()
    fireTimers()
    expect(onLongPress).toHaveBeenCalledTimes(1)
    g.handlers.onPointerUp(ev(1, 1, 1, 600))
    expect(onEnd).toHaveBeenCalledTimes(1)
  })
  it('cancels when the pointer moves past the slop before firing', () => {
    const onLongPress = vi.fn()
    const g = longPress({ onLongPress })
    g.handlers.onPointerDown(ev(1, 0, 0, 0))
    g.handlers.onPointerMove(ev(1, 40, 0, 50)) // slop → clears the timer
    fireTimers()
    expect(onLongPress).not.toHaveBeenCalled()
  })
})

describe('pan', () => {
  it('activates past the slop and reports translation + velocity', () => {
    const onBegin = vi.fn()
    const onEnd = vi.fn()
    const g = pan({ onBegin, onEnd })
    g.handlers.onPointerDown(ev(1, 0, 0, 0))
    g.handlers.onPointerMove(ev(1, 5, 0, 16)) // under slop → not active
    expect(g.state.active()).toBe(false)
    g.handlers.onPointerMove(ev(1, 30, 0, 32)) // past slop
    expect(g.state.active()).toBe(true)
    expect(onBegin).toHaveBeenCalledTimes(1)
    expect(g.state.translationX()).toBe(30)
    g.handlers.onPointerMove(ev(1, 60, 0, 48))
    expect(g.state.translationX()).toBe(60)
    expect(g.state.velocityX()).toBeGreaterThan(0)
    g.handlers.onPointerUp(ev(1, 60, 0, 64))
    expect(onEnd).toHaveBeenCalledTimes(1)
    expect(g.state.active()).toBe(false)
  })
})

describe('pinch', () => {
  it('scales relative to the start distance between two pointers', () => {
    const onUpdate = vi.fn()
    const g = pinch({ onUpdate })
    g.handlers.onPointerDown(ev(1, 0, 0, 0))
    g.handlers.onPointerDown(ev(2, 100, 0, 0)) // start distance 100 → begin
    expect(g.state.active()).toBe(true)
    g.handlers.onPointerMove(ev(2, 200, 0, 16)) // distance 200 → scale 2
    expect(g.state.scale()).toBeCloseTo(2)
    expect(onUpdate).toHaveBeenCalled()
  })
})

describe('swipe', () => {
  it('fires on a fast flick in the dominant direction', () => {
    const onSwipe = vi.fn()
    const g = swipe({ onSwipe })
    g.handlers.onPointerDown(ev(1, 0, 0, 0))
    g.handlers.onPointerMove(ev(1, 50, 0, 16))
    g.handlers.onPointerMove(ev(1, 120, 0, 32)) // fast rightward
    g.handlers.onPointerUp(ev(1, 140, 0, 40))
    expect(onSwipe).toHaveBeenCalledTimes(1)
    expect(onSwipe.mock.calls[0]?.[0].direction).toBe('right')
  })

  it('reports direction consistent with the release velocity on a reversing flick', () => {
    const onSwipe = vi.fn()
    const g = swipe({ onSwipe })
    g.handlers.onPointerDown(ev(1, 0, 0, 0))
    g.handlers.onPointerMove(ev(1, 200, 0, 300)) // drift far right → net displacement is rightward
    g.handlers.onPointerMove(ev(1, 190, 0, 308)) // then flick back LEFT, fast
    g.handlers.onPointerMove(ev(1, 150, 0, 316))
    g.handlers.onPointerMove(ev(1, 110, 0, 324))
    g.handlers.onPointerMove(ev(1, 70, 0, 332))
    g.handlers.onPointerUp(ev(1, 60, 0, 340))
    expect(onSwipe).toHaveBeenCalledTimes(1)
    const e = onSwipe.mock.calls[0]?.[0]
    expect(e.velocityX).toBeLessThan(0) // flung left at release
    expect(e.direction).toBe('left') // agrees with velocity (net displacement was right → was 'right' before)
  })
})

describe('composeGestures', () => {
  it('a drag fires pan (not tap); a quick tap fires tap (not pan)', () => {
    const onTap = vi.fn()
    const onPanBegin = vi.fn()
    const make = (): Recognizer<never> =>
      composeGestures([
        tap({ onTap }) as unknown as Recognizer<never>,
        pan({ onBegin: onPanBegin }) as unknown as Recognizer<never>,
      ])

    const drag = make()
    drag.handlers.onPointerDown(ev(1, 0, 0, 0))
    drag.handlers.onPointerMove(ev(1, 50, 0, 16))
    drag.handlers.onPointerUp(ev(1, 50, 0, 32))
    expect(onPanBegin).toHaveBeenCalledTimes(1)
    expect(onTap).not.toHaveBeenCalled()

    const quick = make()
    quick.handlers.onPointerDown(ev(1, 0, 0, 0))
    quick.handlers.onPointerUp(ev(1, 1, 1, 50))
    expect(onTap).toHaveBeenCalledTimes(1)
  })
})

describe('panAnimated', () => {
  afterEach(() => _resetAnimation())
  it('drags an AnimatedValue and springs to the release target with the gesture velocity', () => {
    const m = manualFrameSource()
    setFrameSource(m.source)
    const x = animate(0)
    const y = animate(0)
    const g = panAnimated(x, y, { release: () => ({ x: 0, y: 0 }) }) // snap back to origin
    g.handlers.onPointerDown(ev(1, 0, 0, 0))
    g.handlers.onPointerMove(ev(1, 30, 0, 16)) // begin (past slop)
    g.handlers.onPointerMove(ev(1, 80, 0, 32))
    expect(x()).toBe(80) // follows the finger
    g.handlers.onPointerUp(ev(1, 80, 0, 48)) // release → spring to 0
    expect(_activeAnimationCount()).toBeGreaterThan(0)
    for (let t = 0; t <= 4000 && _activeAnimationCount() > 0; t += 16) m.tick(t)
    expect(x()).toBe(0) // settled back to origin
  })
})

describe('gesture hardening (adversarial findings)', () => {
  it('longPress fires onEnd when it had fired and then the pointer moves past slop', () => {
    const onEnd = vi.fn()
    const g = longPress({ onEnd })
    g.handlers.onPointerDown(ev(1, 0, 0, 0))
    fireTimers() // long-press fires
    g.handlers.onPointerMove(ev(1, 40, 0, 50)) // slop after fire → must end
    expect(onEnd).toHaveBeenCalledTimes(1)
  })

  it('an axis:"y" pan does NOT activate on purely horizontal movement', () => {
    const g = pan({ axis: 'y' })
    g.handlers.onPointerDown(ev(1, 0, 0, 0))
    g.handlers.onPointerMove(ev(1, 80, 0, 16)) // big horizontal, zero vertical
    expect(g.state.active()).toBe(false)
    g.handlers.onPointerMove(ev(1, 80, 40, 32)) // now vertical past slop
    expect(g.state.active()).toBe(true)
  })

  it('pinch survives a pinned finger lifting while a third remains (re-pairs, stays active)', () => {
    const g = pinch({})
    g.handlers.onPointerDown(ev(1, 0, 0, 0))
    g.handlers.onPointerDown(ev(2, 100, 0, 0)) // pair [1,2], active
    g.handlers.onPointerDown(ev(3, 50, 50, 0)) // third finger tracked
    expect(g.state.active()).toBe(true)
    g.handlers.onPointerUp(ev(1, 0, 0, 16)) // a PINNED finger lifts; 2 remain → re-pair
    expect(g.state.active()).toBe(true) // gesture did not die
  })

  it('pan hands off to a remaining pointer when the active one is cancelled', () => {
    const g = pan({})
    g.handlers.onPointerDown(ev(1, 0, 0, 0))
    g.handlers.onPointerDown(ev(2, 200, 200, 0))
    g.handlers.onPointerMove(ev(1, 40, 0, 16)) // pointer 1 active
    expect(g.state.active()).toBe(true)
    g.handlers.onPointerCancel(ev(1, 40, 0, 32)) // cancel the active one
    // pointer 2 can now claim by moving past slop
    g.handlers.onPointerMove(ev(2, 260, 200, 48))
    expect(g.state.active()).toBe(true)
  })

  it('resets translation/velocity/position state on release (no stuck offset)', () => {
    const g = pan({})
    g.handlers.onPointerDown(ev(1, 0, 0, 0))
    g.handlers.onPointerMove(ev(1, 50, 30, 16))
    expect(g.state.translationX()).toBe(50) // mid-drag
    g.handlers.onPointerUp(ev(1, 50, 30, 32))
    expect(g.state.translationX()).toBe(0) // snapped to rest on the final up
    expect(g.state.translationY()).toBe(0)
    expect(g.state.x()).toBe(0)
    expect(g.state.active()).toBe(false)
  })
})
