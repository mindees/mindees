/**
 * Bridge a {@link pan} gesture to {@link AnimatedValue}s — the headline interaction: drag follows
 * the finger 1:1, and on release each axis springs to a target **seeded with the gesture's own
 * velocity** (so a flick keeps flowing). This explicit velocity handoff is required because
 * `AnimatedValue.set` doesn't populate the value's velocity cell.
 *
 * @module
 */

import { type AnimatedValue, spring } from '../animation'
import { untrack } from '../reactive'
import { type PanState, pan, type Recognizer } from './recognizers'

/** Drag `x`/`y` with a pan; on release, spring each axis to `release()`'s target (default: stay put), seeded with the gesture velocity. */
export function panAnimated(
  x: AnimatedValue,
  y: AnimatedValue,
  opts?: {
    /** Choose the per-axis settle target on release (e.g. snap-back to 0). Returns `void` to stay put. */
    readonly release?: (e: {
      x: number
      y: number
      velocityX: number
      velocityY: number
    }) => { x: number; y: number } | void
    readonly spring?: { stiffness?: number; damping?: number }
  },
): Recognizer<PanState> {
  let baseX = 0
  let baseY = 0
  return pan({
    onBegin: () => {
      baseX = untrack(x)
      baseY = untrack(y)
    },
    onUpdate: (e) => {
      x.set(baseX + e.translationX)
      y.set(baseY + e.translationY)
    },
    onEnd: (e) => {
      const target = opts?.release?.({
        x: untrack(x),
        y: untrack(y),
        velocityX: e.velocityX,
        velocityY: e.velocityY,
      })
      if (!target) return // stay where released
      const sp = opts?.spring ?? {}
      // px/ms → px/s for the spring integrator; seed each axis with the finger's velocity.
      spring(x, { to: target.x, velocity: e.velocityX * 1000, ...sp })
      spring(y, { to: target.y, velocity: e.velocityY * 1000, ...sp })
    },
  })
}
