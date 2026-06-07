/**
 * The animation engine — RN `Animated`/Reanimated + Flutter `AnimationController` parity, built
 * entirely on the reactive core. An {@link AnimatedValue} **is a signal**, so reading it inside a
 * `style` accessor re-renders only that node (no renderer surface). One injected {@link FrameSource}
 * (mirroring `setReactiveScheduler`) drives a single loop that ticks every active driver inside one
 * `batch()` per frame — so a style reading several animated values recomputes once (glitch-free).
 *
 * With no frame source (SSR / headless / tests until one is wired) animations **jump to their final
 * value** synchronously: deterministic, never a hang, server output shows the end state.
 *
 * @module
 */

import { batch, getOwner, onCleanup, type Signal, signal, untrack } from '../reactive'
import { type Easing, linear } from './easing'

/** A frame source: subscribe with a per-frame `tick(nowMs)`, get back an unsubscribe. (`requestAnimationFrame` on web, vsync on native, a manual ticker in tests.) */
export type FrameSource = (tick: (nowMs: number) => void) => () => void

/** A running animation: stop it, or await natural completion. */
export interface AnimationHandle {
  /** Stop now (keeps the current value); `done` resolves `false`. Idempotent. */
  stop(): void
  /** Resolves `true` on natural completion, `false` if interrupted/stopped. Settles exactly once. */
  readonly done: Promise<boolean>
}

/** A reactive, animatable number. Call to read (tracks); `.set` jumps (untracked, stops any driver). */
export interface AnimatedValue {
  (): number
  /** Jump to `v` immediately, cancelling any running driver. */
  set(v: number): void
  /** The current per-frame velocity (units/sec) — seeds spring-interrupts-spring. */
  readonly velocity: () => number
  /** Stop any running driver, keeping the current value. */
  stop(): void
}

interface Driver {
  readonly av: AnimatedValue
  /** Target value, used to jump-to-final if the frame source detaches mid-flight. */
  readonly target: number
  /** Advance by this frame; return `true` while still running. */
  tick(nowMs: number, dt: number): boolean
  /** Resolve the handle + fire onComplete exactly once. */
  settle(finished: boolean): void
}

interface Internal {
  readonly signal: Signal<number>
  readonly vel: { v: number }
  driver: Driver | null
}

const MAX_DT = 0.064 // clamp huge gaps (backgrounded tab / GC / breakpoint) so springs can't explode
const SPRING_MAX_FRAMES = 600 // ~10s @60fps: a non-converging spring fails safely instead of forever
const DEFAULT_DURATION = 250 // matches Atlas tokens.duration.standard (kept literal to avoid an atlas dep)

const internals = new WeakMap<AnimatedValue, Internal>()
const active = new Set<Driver>()
let frameSource: FrameSource | null = null
let unsubscribe: (() => void) | null = null
let lastNow = -1 // -1 = uninitialized (a real frame can arrive at now=0)

/** Inject (or clear) the frame source that drives animations. `null` (default) → jump-to-final. */
export function setFrameSource(src: FrameSource | null): void {
  if (src === frameSource) return
  // Detach the current loop FIRST so any change — including a non-null→non-null swap — can never
  // leak the old subscription (which would keep driving) nor block resubscribing under the new one.
  if (unsubscribe) {
    unsubscribe()
    unsubscribe = null
  }
  frameSource = src
  if (src === null) {
    // Detaching entirely: flush every active driver to its final value so nothing is left frozen
    // (symmetric with the start-time SSR fallback).
    batch(() => {
      for (const d of [...active]) {
        writeValue(d.av, d.target)
        active.delete(d)
        const st = internals.get(d.av)
        if (st) st.driver = null
        d.settle(true)
      }
    })
  } else if (active.size > 0) {
    ensureLoop() // resubscribe in-flight animations under the new source
  }
}

/** The current frame source, or `null`. */
export function getFrameSource(): FrameSource | null {
  return frameSource
}

function writeValue(av: AnimatedValue, v: number): void {
  untrack(() => internals.get(av)?.signal.set(v))
}

function maybeSleep(): void {
  if (active.size === 0 && unsubscribe) {
    unsubscribe()
    unsubscribe = null
  }
}

function ensureLoop(): void {
  if (unsubscribe === null && frameSource !== null) {
    lastNow = -1
    unsubscribe = frameSource(onFrame)
  }
}

function onFrame(now: number): void {
  if (lastNow < 0) lastNow = now // first frame establishes the baseline (dt = 0, no jump)
  // Clamp to [0, MAX_DT]: never integrate backward on a non-monotonic timestamp, never explode on a
  // huge gap (backgrounded tab / GC / breakpoint).
  const dt = Math.min(Math.max(0, (now - lastNow) / 1000), MAX_DT)
  // One batch per frame: every driver's write coalesces into a single flush, so a style reading
  // multiple animated values recomputes exactly once (glitch-free).
  batch(() => {
    for (const d of [...active]) {
      // A sibling's onComplete this frame may have stopped this driver — don't tick a removed one
      // (would violate stop()'s "keeps current value" contract with an extra write).
      if (!active.has(d)) continue
      let running: boolean
      try {
        running = d.tick(now, dt)
      } catch {
        running = false // isolate a throwing driver (mirrors flushEffects' error isolation)
      }
      if (!running) {
        active.delete(d)
        const st = internals.get(d.av)
        if (st) st.driver = null
        // Isolate a throwing onComplete: settle() invokes the user's onComplete, and this runs on the
        // SHARED frame loop — one bad callback must not propagate out and leave the rAF chain un-rearmed
        // (which would freeze EVERY animation in the app).
        try {
          d.settle(true)
        } catch {
          // swallow: a faulty completion callback can't be allowed to kill the loop
        }
      }
    }
  })
  lastNow = now
  maybeSleep()
}

/** Create an {@link AnimatedValue} (a reactive number you can drive with {@link timing}/{@link spring}). */
export function animate(initial: number): AnimatedValue {
  const s = signal(initial)
  const state: Internal = { signal: s, vel: { v: 0 }, driver: null }
  const av: AnimatedValue = Object.assign(() => s(), {
    set(v: number): void {
      stopDriver(av) // a manual jump cancels any running animation (RN setValue semantics)
      untrack(() => s.set(v))
    },
    velocity: () => state.vel.v,
    stop(): void {
      stopDriver(av)
    },
  })
  internals.set(av, state)
  return av
}

function stopDriver(av: AnimatedValue): void {
  const st = internals.get(av)
  if (st?.driver) {
    const d = st.driver
    active.delete(d)
    st.driver = null
    d.settle(false)
    maybeSleep()
  }
}

/** Options shared by drivers. */
interface DriverOptions {
  readonly to: number
  readonly onComplete?: (finished: boolean) => void
}

/**
 * Begin a driver on `av`: settle any prior driver (last-write-wins), capture the current value as
 * the start, and either jump-to-final (no frame source) or join the loop. Returns the handle.
 */
function start(
  av: AnimatedValue,
  opts: DriverOptions,
  build: (from: number, settle: (finished: boolean) => void) => Driver['tick'],
): AnimationHandle {
  const st = internals.get(av)
  if (!st) throw new TypeError('animation driver: value was not created with animate()')
  stopDriver(av) // last-write-wins: at most one driver per value

  let settled = false
  let resolveDone!: (finished: boolean) => void
  const done = new Promise<boolean>((r) => {
    resolveDone = r
  })
  const settle = (finished: boolean): void => {
    if (settled) return
    settled = true
    resolveDone(finished)
    opts.onComplete?.(finished)
  }

  const from = untrack(av) // start from the CURRENT rendered value (continuous retarget)

  // No frame source → jump to the final value synchronously (SSR / headless / not-yet-wired).
  if (frameSource === null) {
    writeValue(av, opts.to)
    settle(true)
    return { stop: () => settle(false), done }
  }

  const tick = build(from, settle)
  const driver: Driver = { av, target: opts.to, tick, settle }
  st.driver = driver
  active.add(driver)

  // Auto-stop when the owner that started the animation is disposed (unmount), so the loop never
  // writes a dead signal and never leaks a frame subscription.
  if (getOwner() !== null) {
    onCleanup(() => {
      if (st.driver === driver) stopDriver(av)
    })
  }

  ensureLoop()
  return {
    stop: () => stopDriver(av),
    done,
  }
}

/** Animate `av` to `to` over `duration` ms with `easing` (RN `Animated.timing`). */
export function timing(
  av: AnimatedValue,
  opts: {
    readonly to: number
    readonly duration?: number
    readonly easing?: Easing
    readonly delay?: number
    readonly onComplete?: (finished: boolean) => void
  },
): AnimationHandle {
  // Sanitize: `??` only catches null/undefined, so a NaN/Infinity duration would write NaN forever
  // (permanent under Object.is) — fall back to the default for any non-finite duration.
  const duration = Number.isFinite(opts.duration) ? (opts.duration as number) : DEFAULT_DURATION
  const easing = opts.easing ?? linear
  const delay = Number.isFinite(opts.delay) ? (opts.delay as number) : 0
  return start(av, opts, (from, _settle) => {
    let startTime = -1 // -1 = uninitialized (a real frame can arrive at now=0)
    let prev = from
    const settleAt = (): boolean => {
      internals.get(av)!.vel.v = 0 // at rest: velocity is 0 (so a following spring doesn't inherit phantom momentum)
      writeValue(av, opts.to)
      return false
    }
    return (now, dt) => {
      if (startTime < 0) startTime = now
      const elapsed = now - startTime - delay
      if (elapsed < 0) return true // still in the delay window
      const t = duration <= 0 ? 1 : Math.min(elapsed / duration, 1)
      const next = from + (opts.to - from) * easing(t)
      if (!Number.isFinite(next)) return settleAt() // defensive: never write NaN/Infinity
      if (dt > 0) internals.get(av)!.vel.v = (next - prev) / dt
      prev = next
      if (t >= 1) return settleAt()
      writeValue(av, next)
      return true
    }
  })
}

/** Animate `av` to `to` with spring physics (RN/Reanimated `withSpring`, Flutter `SpringSimulation`). */
export function spring(
  av: AnimatedValue,
  opts: {
    readonly to: number
    readonly stiffness?: number
    readonly damping?: number
    readonly mass?: number
    readonly velocity?: number
    readonly restDelta?: number
    readonly restVelocity?: number
    readonly onComplete?: (finished: boolean) => void
  },
): AnimationHandle {
  const stiffness = Math.max(0, opts.stiffness ?? 170)
  const damping = Math.max(0, opts.damping ?? 26)
  const mass = Math.max(1e-4, opts.mass ?? 1)
  const restDelta = opts.restDelta ?? 0.01
  const restVelocity = opts.restVelocity ?? 0.01
  const omega = Math.sqrt(stiffness / mass) // natural frequency, for substep stability
  return start(av, opts, (from) => {
    let x = from
    let v = opts.velocity ?? internals.get(av)!.vel.v
    let frames = 0
    return (_now, dt) => {
      frames++
      // Semi-implicit (symplectic) Euler is only conditionally stable (omega·dt < ~2). Stiffness is
      // user-controlled, so SUBSTEP the frame's dt to keep each step well inside the stable region —
      // a stiff spring stays finite instead of diverging to Infinity/NaN.
      const steps = Math.max(1, Math.ceil((dt * omega) / 1.5))
      const sub = dt / steps
      for (let i = 0; i < steps; i++) {
        const a = (-stiffness * (x - opts.to) - damping * v) / mass
        v += a * sub
        x += v * sub
      }
      if (!Number.isFinite(x)) {
        // Defensive: never write NaN/Infinity (permanent under Object.is) — snap to the target.
        internals.get(av)!.vel.v = 0
        writeValue(av, opts.to)
        return false
      }
      internals.get(av)!.vel.v = v
      if (
        (Math.abs(x - opts.to) < restDelta && Math.abs(v) < restVelocity) ||
        frames > SPRING_MAX_FRAMES
      ) {
        internals.get(av)!.vel.v = 0
        writeValue(av, opts.to)
        return false
      }
      writeValue(av, x)
      return true
    }
  })
}

/**
 * Map an accessor through a piecewise-linear range (RN `Animated.interpolate`). Returns a plain
 * accessor, so it tracks `value` and re-reads inside the consuming style each frame — glitch-free
 * for free. `inputRange` must be monotonically increasing and match `outputRange` length (≥2).
 */
export function interpolate(
  value: () => number,
  inputRange: readonly number[],
  outputRange: readonly number[],
  opts?: { readonly extrapolate?: 'clamp' | 'extend' },
): () => number {
  if (inputRange.length !== outputRange.length || inputRange.length < 2) {
    throw new RangeError('interpolate: inputRange and outputRange must be the same length (>= 2)')
  }
  const extrapolate = opts?.extrapolate ?? 'clamp'
  const n = inputRange.length
  return () => {
    const x = value()
    if (Number.isNaN(x)) return outputRange[0] as number // a NaN source maps to the first output, not the last
    const lerp = (i: number): number => {
      const x0 = inputRange[i] as number
      const x1 = inputRange[i + 1] as number
      const y0 = outputRange[i] as number
      const y1 = outputRange[i + 1] as number
      if (x1 === x0) return y0 // zero-width segment → avoid divide-by-zero
      return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0)
    }
    if (x <= (inputRange[0] as number)) {
      return extrapolate === 'extend' ? lerp(0) : (outputRange[0] as number)
    }
    if (x >= (inputRange[n - 1] as number)) {
      return extrapolate === 'extend' ? lerp(n - 2) : (outputRange[n - 1] as number)
    }
    for (let i = 0; i < n - 1; i++) {
      if (x >= (inputRange[i] as number) && x <= (inputRange[i + 1] as number)) return lerp(i)
    }
    return outputRange[n - 1] as number // unreachable for monotonic input
  }
}

/** A `requestAnimationFrame`-backed {@link FrameSource} for the web (the host wires this at startup). */
export function rafFrameSource(): FrameSource {
  return (tick) => {
    const raf = (globalThis as { requestAnimationFrame?: (cb: (t: number) => void) => number })
      .requestAnimationFrame
    const caf = (globalThis as { cancelAnimationFrame?: (id: number) => void }).cancelAnimationFrame
    if (!raf) return () => {} // no rAF (non-browser) → caller already degrades to jump-to-final
    let id = raf(function loop(t: number) {
      // Always re-arm the chain, even if `tick` throws — a single bad frame must never permanently
      // freeze the shared loop. (onFrame already isolates driver ticks + completion callbacks; this is
      // belt-and-suspenders for any other thrown error.)
      try {
        tick(t)
      } finally {
        id = raf(loop)
      }
    })
    return () => caf?.(id)
  }
}

/** A manually-driven {@link FrameSource} for deterministic tests: call `tick(nowMs)` to advance. */
export function manualFrameSource(): { source: FrameSource; tick: (nowMs: number) => void } {
  let cb: ((nowMs: number) => void) | null = null
  return {
    source: (t) => {
      cb = t
      return () => {
        cb = null
      }
    },
    tick: (nowMs) => cb?.(nowMs),
  }
}

/** @internal Test-only: number of running animations. */
export function _activeAnimationCount(): number {
  return active.size
}

/** @internal Test-only: reset all engine state between tests. */
export function _resetAnimation(): void {
  if (unsubscribe) unsubscribe()
  unsubscribe = null
  active.clear()
  frameSource = null
  lastNow = -1
}
