/**
 * Atlas motion — binds the design-token easing/duration to the core animation engine, so callers
 * animate with token NAMES (`motion.standard`, `duration.standard`) instead of raw cubic-béziers.
 * Core owns the math (`cubicBezier`/`timing`); this is the thin token shim (atlas → core only).
 *
 * @example
 * const x = animate(0)
 * animateTo(x, 100)                       // standard duration + easing
 * animateTo(x, 0, { easing: motion.accelerate, duration: duration.large })
 *
 * @module
 */

import {
  type AnimatedValue,
  type AnimationHandle,
  cubicBezier,
  type Easing,
  timing,
} from '@mindees/core'
import { duration, easing } from './tokens'

/** The token easing curves as ready-to-use core {@link Easing} functions (same control points). */
export const motion: Readonly<Record<keyof typeof easing, Easing>> = {
  standard: cubicBezier(easing.standard),
  decelerate: cubicBezier(easing.decelerate),
  accelerate: cubicBezier(easing.accelerate),
}

/** `timing` pre-bound to Atlas's standard duration + easing — the common app animation. */
export function animateTo(
  value: AnimatedValue,
  to: number,
  opts?: {
    readonly duration?: number
    readonly easing?: Easing
    readonly onComplete?: (finished: boolean) => void
  },
): AnimationHandle {
  return timing(value, {
    to,
    duration: opts?.duration ?? duration.standard,
    easing: opts?.easing ?? motion.standard,
    ...(opts?.onComplete ? { onComplete: opts.onComplete } : {}),
  })
}
