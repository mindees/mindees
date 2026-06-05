/**
 * Gesture recognizers — RN Gesture Handler / Flutter GestureDetector parity, built on the reactive
 * core. Each factory returns a {@link Recognizer}: a bag of pointer-event handlers to spread onto a
 * host element, plus REACTIVE state (signals) you read in a `style` accessor or feed to the
 * animation engine. The only platform-aware code is {@link normalizePointer}; everything else is
 * pure payload → signal, so it runs on web (Pointer Events), native (the command-backend payload),
 * and tests (synthetic events), and SSRs safely (no `document` access).
 *
 * Attach two recognizers to ONE element via {@link composeGestures} — the renderer binds a single
 * listener per event name, so spreading two `onPointerMove`s would drop one; compose merges them.
 *
 * @module
 */

import { batch, signal } from '../reactive'

/** A normalized pointer sample (platform differences absorbed by {@link normalizePointer}). */
export interface PointerSample {
  readonly pointerId: number
  readonly x: number
  readonly y: number
  /** Timestamp in ms. */
  readonly t: number
  readonly pointerType?: string
}

// --- injectable clock (deterministic longPress tests; mirrors the animation FrameSource pattern) ---
let nowMs = (): number => Date.now()
let scheduleTimer = (fn: () => void, ms: number): (() => void) => {
  const id = setTimeout(fn, ms)
  return () => clearTimeout(id)
}

/** @internal Test-only: inject a deterministic clock + timer. */
export function _setGestureClock(opts: {
  now?: () => number
  schedule?: (fn: () => void, ms: number) => () => void
}): void {
  if (opts.now) nowMs = opts.now
  if (opts.schedule) scheduleTimer = opts.schedule
}

/** Normalize a host pointer event to a {@link PointerSample}. Web `PointerEvent` or a native payload. */
export function normalizePointer(e: unknown): PointerSample {
  const ev = (e ?? {}) as Record<string, unknown>
  const web = 'clientX' in ev // distinguishes a DOM PointerEvent from a native JSON payload
  const num = (v: unknown, d = 0): number => (typeof v === 'number' && Number.isFinite(v) ? v : d)
  return {
    pointerId: num(ev.pointerId, 1),
    x: web ? num(ev.clientX) : num(ev.x),
    y: web ? num(ev.clientY) : num(ev.y),
    t: num(web ? ev.timeStamp : ev.timestamp, nowMs()),
    ...(typeof (web ? ev.pointerType : ev.type) === 'string'
      ? { pointerType: (web ? ev.pointerType : ev.type) as string }
      : {}),
  }
}

/** Handlers to spread onto a host element. */
export interface GestureHandlers {
  onPointerDown(e: unknown): void
  onPointerMove(e: unknown): void
  onPointerUp(e: unknown): void
  onPointerCancel(e: unknown): void
}

/** A recognizer: handlers to attach, reactive `state`, and a `reset()` for cleanup. */
export interface Recognizer<S = Record<string, () => number | boolean>> {
  readonly handlers: GestureHandlers
  readonly state: S
  /** Clear pointers, timers, and reset state to rest (call from `onCleanup`). */
  reset(): void
}

interface Tracked {
  startX: number
  startY: number
  startT: number
  x: number
  y: number
  lastX: number
  lastY: number
  lastT: number
  vx: number // EWMA velocity, px/ms
  vy: number
}

const VEL_ALPHA = 0.6
const dist = (ax: number, ay: number, bx: number, by: number): number =>
  Math.hypot(ax - bx, ay - by)

/** Update a tracked pointer + its EWMA velocity from a new sample. */
function track(p: Tracked, s: PointerSample): void {
  const dtMs = s.t - p.lastT
  if (dtMs > 0) {
    p.vx = VEL_ALPHA * ((s.x - p.lastX) / dtMs) + (1 - VEL_ALPHA) * p.vx
    p.vy = VEL_ALPHA * ((s.y - p.lastY) / dtMs) + (1 - VEL_ALPHA) * p.vy
  }
  p.lastX = s.x
  p.lastY = s.y
  p.lastT = s.t
  p.x = s.x
  p.y = s.y
}

function newTracked(s: PointerSample): Tracked {
  return {
    startX: s.x,
    startY: s.y,
    startT: s.t,
    x: s.x,
    y: s.y,
    lastX: s.x,
    lastY: s.y,
    lastT: s.t,
    vx: 0,
    vy: 0,
  }
}

// --- Pan (drag) -----------------------------------------------------------------------------------

/** A continuous pan/drag update (translations relative to gesture start; velocity in px/ms). */
export interface PanEvent {
  readonly translationX: number
  readonly translationY: number
  readonly velocityX: number
  readonly velocityY: number
  readonly x: number
  readonly y: number
}

export interface PanState {
  readonly active: () => boolean
  readonly translationX: () => number
  readonly translationY: () => number
  readonly velocityX: () => number
  readonly velocityY: () => number
  readonly x: () => number
  readonly y: () => number
}

/** Recognize a drag. Becomes active once the pointer moves past `minDistance` (slop). */
export function pan(config: {
  onBegin?: (e: PanEvent) => void
  onUpdate?: (e: PanEvent) => void
  onEnd?: (e: PanEvent & { completed: boolean }) => void
  minDistance?: number
  axis?: 'both' | 'x' | 'y'
}): Recognizer<PanState> {
  const minDistance = config.minDistance ?? 10
  const axis = config.axis ?? 'both'
  const pointers = new Map<number, Tracked>()
  let id: number | null = null // the claimed pointer
  let active = false
  const active$ = signal(false)
  const tx$ = signal(0)
  const ty$ = signal(0)
  const vx$ = signal(0)
  const vy$ = signal(0)
  const x$ = signal(0)
  const y$ = signal(0)

  const filt = (dx: number, dy: number): [number, number] =>
    axis === 'x' ? [dx, 0] : axis === 'y' ? [0, dy] : [dx, dy]

  const eventFor = (p: Tracked): PanEvent => {
    const [tx, ty] = filt(p.x - p.startX, p.y - p.startY)
    const [vx, vy] = filt(p.vx, p.vy)
    return { translationX: tx, translationY: ty, velocityX: vx, velocityY: vy, x: p.x, y: p.y }
  }
  const writeFrom = (p: Tracked): void => {
    const e = eventFor(p)
    tx$.set(e.translationX)
    ty$.set(e.translationY)
    vx$.set(e.velocityX)
    vy$.set(e.velocityY)
    x$.set(e.x)
    y$.set(e.y)
  }

  const reset = (): void => {
    pointers.clear()
    id = null
    active = false
    batch(() => {
      active$.set(false)
      tx$.set(0)
      ty$.set(0)
      vx$.set(0)
      vy$.set(0)
    })
  }

  return {
    state: {
      active: () => active$(),
      translationX: () => tx$(),
      translationY: () => ty$(),
      velocityX: () => vx$(),
      velocityY: () => vy$(),
      x: () => x$(),
      y: () => y$(),
    },
    reset,
    handlers: {
      onPointerDown(e): void {
        const s = normalizePointer(e)
        pointers.set(s.pointerId, newTracked(s))
        if (id === null) id = s.pointerId
      },
      onPointerMove(e): void {
        const s = normalizePointer(e)
        const p = pointers.get(s.pointerId)
        if (!p) return
        track(p, s)
        if (s.pointerId !== id) return
        // Slop on the AXIS-FILTERED delta: an `axis: 'y'` pan must not activate on horizontal travel.
        const [sx, sy] = filt(p.x - p.startX, p.y - p.startY)
        const slop = Math.hypot(sx, sy)
        batch(() => {
          if (!active && slop >= minDistance) {
            active = true
            active$.set(true)
            writeFrom(p)
            config.onBegin?.(eventFor(p))
          } else if (active) {
            writeFrom(p)
            config.onUpdate?.(eventFor(p))
          }
        })
      },
      onPointerUp(e): void {
        const s = normalizePointer(e)
        const p = pointers.get(s.pointerId)
        if (p) track(p, s)
        if (s.pointerId === id && active && p) {
          config.onEnd?.({ ...eventFor(p), completed: true })
        }
        pointers.delete(s.pointerId)
        if (s.pointerId === id) {
          id = pointers.keys().next().value ?? null
          active = false
          active$.set(false)
        }
      },
      onPointerCancel(e): void {
        const s = normalizePointer(e)
        const p = pointers.get(s.pointerId)
        if (s.pointerId === id && active && p) {
          config.onEnd?.({ ...eventFor(p), completed: false })
        }
        pointers.delete(s.pointerId)
        if (s.pointerId === id) {
          // Hand off to another still-down pointer (mirror onPointerUp) so it can re-claim the pan.
          id = pointers.keys().next().value ?? null
          active = false
          active$.set(false)
        }
      },
    },
  }
}

// --- Tap ------------------------------------------------------------------------------------------

export interface TapState {
  readonly active: () => boolean
}

/** Recognize a tap: down + up within `maxDistance` and `maxDurationMs`, no extra pointer. */
export function tap(config: {
  onTap?: () => void
  maxDistance?: number
  maxDurationMs?: number
}): Recognizer<TapState> {
  const maxDistance = config.maxDistance ?? 10
  const maxDurationMs = config.maxDurationMs ?? 500
  let down: PointerSample | null = null
  let failed = false
  const active$ = signal(false)
  const reset = (): void => {
    down = null
    failed = false
    active$.set(false)
  }
  return {
    state: { active: () => active$() },
    reset,
    handlers: {
      onPointerDown(e): void {
        if (down !== null) {
          failed = true // a second pointer fails a tap
          return
        }
        down = normalizePointer(e)
        failed = false
        active$.set(true)
      },
      onPointerMove(e): void {
        if (!down || failed) return
        const s = normalizePointer(e)
        if (s.pointerId === down.pointerId && dist(s.x, s.y, down.x, down.y) > maxDistance) {
          failed = true
          active$.set(false)
        }
      },
      onPointerUp(e): void {
        const s = normalizePointer(e)
        if (down && !failed && s.pointerId === down.pointerId) {
          const within =
            dist(s.x, s.y, down.x, down.y) <= maxDistance && s.t - down.t <= maxDurationMs
          if (within) config.onTap?.()
        }
        if (!down || s.pointerId === down.pointerId) reset() // ignore a foreign pointer's cancel/up
      },
      onPointerCancel(e): void {
        const s = normalizePointer(e)
        if (!down || s.pointerId === down.pointerId) reset() // a foreign pointer must not kill our tap
      },
    },
  }
}

// --- Long press -----------------------------------------------------------------------------------

/** Recognize a long press: pointer held past `minDurationMs` without moving past `maxDistance`. */
export function longPress(config: {
  onBegin?: () => void
  onLongPress?: () => void
  onEnd?: () => void
  minDurationMs?: number
  maxDistance?: number
}): Recognizer<TapState> {
  const minDurationMs = config.minDurationMs ?? 500
  const maxDistance = config.maxDistance ?? 10
  let down: PointerSample | null = null
  let cancelTimer: (() => void) | null = null
  let fired = false
  const active$ = signal(false)
  const clear = (): void => {
    cancelTimer?.()
    cancelTimer = null
  }
  const reset = (): void => {
    clear()
    down = null
    fired = false
    active$.set(false)
  }
  /** End the press, firing onEnd iff the long-press had fired, then reset. */
  const finish = (): void => {
    if (fired) config.onEnd?.()
    reset()
  }
  return {
    state: { active: () => active$() },
    reset,
    handlers: {
      onPointerDown(e): void {
        if (down !== null) return
        down = normalizePointer(e)
        fired = false
        active$.set(true)
        config.onBegin?.()
        cancelTimer = scheduleTimer(() => {
          fired = true
          config.onLongPress?.()
        }, minDurationMs)
      },
      onPointerMove(e): void {
        if (!down) return
        const s = normalizePointer(e)
        if (s.pointerId === down.pointerId && dist(s.x, s.y, down.x, down.y) > maxDistance) {
          finish() // slop exceeded → end (onEnd iff it had fired), then fail
        }
      },
      onPointerUp(e): void {
        const s = normalizePointer(e)
        if (down && s.pointerId === down.pointerId) finish()
      },
      onPointerCancel(e): void {
        const s = normalizePointer(e)
        if (!down || s.pointerId === down.pointerId) finish()
      },
    },
  }
}

// --- Pinch (scale) --------------------------------------------------------------------------------

export interface PinchEvent {
  readonly scale: number
  readonly velocity: number
  readonly focalX: number
  readonly focalY: number
}
export interface PinchState {
  readonly active: () => boolean
  readonly scale: () => number
  readonly focalX: () => number
  readonly focalY: () => number
}

/** Recognize a two-finger pinch. `scale` is current distance / start distance between the pinned pair. */
export function pinch(config: {
  onBegin?: (e: PinchEvent) => void
  onUpdate?: (e: PinchEvent) => void
  onEnd?: (e: PinchEvent) => void
}): Recognizer<PinchState> {
  const pts = new Map<number, PointerSample>()
  let pair: [number, number] | null = null
  let startDist = 0
  let lastScale = 1
  let lastT = 0
  const active$ = signal(false)
  const scale$ = signal(1)
  const fx$ = signal(0)
  const fy$ = signal(0)

  const pairPts = (): [PointerSample, PointerSample] | null => {
    if (!pair) return null
    const a = pts.get(pair[0])
    const b = pts.get(pair[1])
    return a && b ? [a, b] : null
  }
  const eventNow = (a: PointerSample, b: PointerSample, t: number): PinchEvent => {
    const d = dist(a.x, a.y, b.x, b.y)
    const scale = startDist > 0 ? d / startDist : 1
    const dt = t - lastT
    const velocity = dt > 0 ? (scale - lastScale) / dt : 0
    lastScale = scale
    lastT = t
    return { scale, velocity, focalX: (a.x + b.x) / 2, focalY: (a.y + b.y) / 2 }
  }
  const reset = (): void => {
    pts.clear()
    pair = null
    startDist = 0
    lastScale = 1
    batch(() => {
      active$.set(false)
      scale$.set(1)
      fx$.set(0)
      fy$.set(0)
    })
  }
  const begin = (): void => {
    const pp = pairPts()
    if (!pp) return
    startDist = dist(pp[0].x, pp[0].y, pp[1].x, pp[1].y)
    lastScale = 1
    lastT = Math.max(pp[0].t, pp[1].t)
    const focalX = (pp[0].x + pp[1].x) / 2
    const focalY = (pp[0].y + pp[1].y) / 2
    batch(() => {
      active$.set(true)
      scale$.set(1)
      fx$.set(focalX) // seed focal so a style reading focalX/Y is correct from the first frame
      fy$.set(focalY)
    })
    config.onBegin?.({ scale: 1, velocity: 0, focalX, focalY })
  }
  /** A pointer left: if it was a pinned finger but ≥2 remain, re-pin survivors continuously; else end. */
  const onLift = (s: PointerSample): void => {
    pts.delete(s.pointerId)
    if (!active$() || !pair) return
    const wasPinned = s.pointerId === pair[0] || s.pointerId === pair[1]
    if (!wasPinned) return // a non-pinned finger lifted — pinch continues unaffected
    if (pts.size >= 2) {
      const ids = [...pts.keys()]
      pair = [ids[0] as number, ids[1] as number]
      const pp = pairPts()
      if (pp) {
        // Re-base so dist/startDist keeps equalling the CURRENT scale (no jump on the next move).
        const d = dist(pp[0].x, pp[0].y, pp[1].x, pp[1].y)
        startDist = d / Math.max(scale$(), 1e-4)
        lastScale = scale$()
      }
      return
    }
    config.onEnd?.({ scale: scale$(), velocity: 0, focalX: fx$(), focalY: fy$() })
    reset()
  }
  return {
    state: {
      active: () => active$(),
      scale: () => scale$(),
      focalX: () => fx$(),
      focalY: () => fy$(),
    },
    reset,
    handlers: {
      onPointerDown(e): void {
        const s = normalizePointer(e)
        pts.set(s.pointerId, s)
        if (!pair && pts.size >= 2) {
          const ids = [...pts.keys()]
          pair = [ids[0] as number, ids[1] as number]
          begin()
        }
      },
      onPointerMove(e): void {
        const s = normalizePointer(e)
        if (!pts.has(s.pointerId)) return
        pts.set(s.pointerId, s)
        const pp = pairPts()
        if (!active$() || !pp) return
        const ev = eventNow(pp[0], pp[1], s.t)
        batch(() => {
          scale$.set(ev.scale)
          fx$.set(ev.focalX)
          fy$.set(ev.focalY)
        })
        config.onUpdate?.(ev)
      },
      onPointerUp(e): void {
        onLift(normalizePointer(e))
      },
      onPointerCancel(e): void {
        onLift(normalizePointer(e))
      },
    },
  }
}

// --- Swipe ----------------------------------------------------------------------------------------

export type SwipeDirection = 'left' | 'right' | 'up' | 'down'
export interface SwipeEvent {
  readonly direction: SwipeDirection
  readonly velocityX: number
  readonly velocityY: number
  readonly x: number
  readonly y: number
}

/** Recognize a fast flick on pointer-up (velocity ≥ `minVelocity` px/ms over `minDistance`). */
export function swipe(config: {
  onSwipe?: (e: SwipeEvent) => void
  direction?: 'any' | SwipeDirection
  minVelocity?: number
  minDistance?: number
}): Recognizer<TapState> {
  const want = config.direction ?? 'any'
  const minVelocity = config.minVelocity ?? 0.3
  const minDistance = config.minDistance ?? 30
  const pointers = new Map<number, Tracked>()
  const active$ = signal(false)
  const reset = (): void => {
    pointers.clear()
    active$.set(false)
  }
  const dominant = (p: Tracked): SwipeDirection => {
    const dx = p.x - p.startX
    const dy = p.y - p.startY
    if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? 'right' : 'left'
    return dy >= 0 ? 'down' : 'up'
  }
  return {
    state: { active: () => active$() },
    reset,
    handlers: {
      onPointerDown(e): void {
        const s = normalizePointer(e)
        pointers.set(s.pointerId, newTracked(s))
        active$.set(true)
      },
      onPointerMove(e): void {
        const s = normalizePointer(e)
        const p = pointers.get(s.pointerId)
        if (p) track(p, s)
      },
      onPointerUp(e): void {
        const s = normalizePointer(e)
        const p = pointers.get(s.pointerId)
        if (p) {
          track(p, s)
          const speed = Math.hypot(p.vx, p.vy)
          const moved = dist(p.x, p.y, p.startX, p.startY)
          const dir = dominant(p)
          if (speed >= minVelocity && moved >= minDistance && (want === 'any' || want === dir)) {
            config.onSwipe?.({ direction: dir, velocityX: p.vx, velocityY: p.vy, x: p.x, y: p.y })
          }
        }
        pointers.delete(s.pointerId) // per-pointer: another finger can still produce its own swipe
        if (pointers.size === 0) active$.set(false)
      },
      onPointerCancel(e): void {
        const s = normalizePointer(e)
        pointers.delete(s.pointerId)
        if (pointers.size === 0) active$.set(false)
      },
    },
  }
}

// --- Composition ----------------------------------------------------------------------------------

/**
 * Merge several recognizers into ONE so they can attach to a single element — required because the
 * renderer binds a single listener per event name (spreading two `onPointerMove`s would drop one).
 * `simultaneous` (the default): every recognizer sees every event independently (e.g. pan + pinch
 * together). Per-recognizer slop already disambiguates tap-vs-pan; an explicit exclusive arena is a
 * follow-up.
 */
export function composeGestures(recognizers: readonly Recognizer<never>[]): Recognizer<never> {
  const fan =
    (key: keyof GestureHandlers) =>
    (e: unknown): void => {
      let firstError: unknown
      batch(() => {
        // Isolate each recognizer: one throwing must not skip the rest (e.g. leaving a sibling's
        // long-press timer armed). Collect the first error and rethrow after all have run.
        for (const r of recognizers) {
          try {
            r.handlers[key](e)
          } catch (err) {
            if (firstError === undefined) firstError = err
          }
        }
      })
      if (firstError !== undefined) throw firstError
    }
  return {
    state: {} as never,
    reset: () => {
      for (const r of recognizers) r.reset()
    },
    handlers: {
      onPointerDown: fan('onPointerDown'),
      onPointerMove: fan('onPointerMove'),
      onPointerUp: fan('onPointerUp'),
      onPointerCancel: fan('onPointerCancel'),
    },
  }
}
