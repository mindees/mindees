/**
 * Easing curves for the animation system. A few named curves plus a {@link cubicBezier} factory
 * that parses a CSS `cubic-bezier(x1,y1,x2,y2)` string — so Atlas's `easing` tokens (which are such
 * strings) map straight onto the animation engine without a circular dependency.
 *
 * @module
 */

/** An easing function: maps normalized time `t` in `[0,1]` to an eased progress (usually `[0,1]`). */
export type Easing = (t: number) => number

export const linear: Easing = (t) => t
export const easeInQuad: Easing = (t) => t * t
export const easeOutQuad: Easing = (t) => t * (2 - t)
export const easeInOutQuad: Easing = (t) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t)
export const easeOutCubic: Easing = (t) => 1 - (1 - t) ** 3

/** Evaluate a 1-D cubic Bézier (control points `0, a, b, 1`) at parameter `t`. */
function bezier(t: number, a: number, b: number): number {
  const c = 3 * a
  const bb = 3 * (b - a) - c
  const aa = 1 - c - bb
  return ((aa * t + bb) * t + c) * t
}

/** Derivative of {@link bezier} w.r.t. `t` (for Newton-Raphson). */
function bezierSlope(t: number, a: number, b: number): number {
  const c = 3 * a
  const bb = 3 * (b - a) - c
  const aa = 1 - c - bb
  return (3 * aa * t + 2 * bb) * t + c
}

/**
 * Build an {@link Easing} from a CSS `cubic-bezier(x1, y1, x2, y2)` string (spaces tolerated, as in
 * Atlas's tokens). Solves `x(t) = input` via Newton-Raphson with a bisection fallback, then returns
 * `y(t)`. A malformed string falls back to {@link linear} — it never returns `NaN` (a `NaN` written
 * into a signal would be permanent under `Object.is` and freeze every binding).
 */
export function cubicBezier(css: string): Easing {
  const match = /cubic-bezier\(([^)]+)\)/.exec(css)
  if (!match?.[1]) return linear
  const parts = match[1].split(',').map((s) => Number.parseFloat(s.trim()))
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return linear
  const [x1, y1, x2, y2] = parts as [number, number, number, number]

  const solveT = (x: number): number => {
    let t = x
    for (let i = 0; i < 8; i++) {
      const xt = bezier(t, x1, x2) - x
      if (Math.abs(xt) < 1e-6) return t
      const slope = bezierSlope(t, x1, x2)
      if (Math.abs(slope) < 1e-6) break
      t -= xt / slope
    }
    // Bisection fallback (always converges on the monotonic [0,1] domain).
    let lo = 0
    let hi = 1
    let mid = x
    for (let i = 0; i < 30; i++) {
      mid = (lo + hi) / 2
      const xt = bezier(mid, x1, x2)
      if (Math.abs(xt - x) < 1e-6) break
      if (xt < x) lo = mid
      else hi = mid
    }
    return mid
  }

  return (t) => {
    if (t <= 0) return 0
    if (t >= 1) return 1
    return bezier(solveT(t), y1, y2)
  }
}
