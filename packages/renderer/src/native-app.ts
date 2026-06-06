/**
 * `createNativeApp` — the one-call entry point for a MindeesNative app on an embedded
 * native host. It hides the wiring an app author should never have to write: creating
 * the {@link createNativeCommandBackend}, rendering the root, flushing the command
 * batch to the host, and exposing the start/dispatch/frame contract the host calls.
 *
 * ```tsx
 * import { createNativeApp } from '@mindees/renderer'
 * import { App } from './App'
 *
 * createNativeApp(<App />)
 * ```
 *
 * That's the whole entry file. The native host (see `examples/native-hosts/`) injects a
 * `MindeesHost.emit(json)` global and calls `MindeesApp.start()` once, then
 * `MindeesApp.dispatchEvent(handlerId)` per native event — both of which this wires.
 *
 * On a host it also makes animations + concurrency **work by default**: it installs a
 * reactive {@link Scheduler} (so `startTransition`/`deferred`/normal-lane effects run) and a
 * vsync-driven {@link FrameSource} (so `timing`/`spring`/gesture animations advance). The host
 * drives frames by calling `MindeesApp.frameTick(nowMs)` each vsync, and the engine signals when
 * to start/stop that loop through a `MindeesHostFrame.setFrameLoopActive(boolean)` global — so the
 * vsync loop runs **only while something is animating** (battery-friendly), tied to the animation
 * engine's own arm/sleep. With no host (SSR / Node / tests) nothing is installed and animations
 * jump straight to their final value, exactly as before.
 *
 * @module
 */

import {
  createScheduler,
  type FrameSource,
  type MindeesNode,
  setFrameSource,
  setReactiveScheduler,
} from '@mindees/core'
import { createNativeCommandBackend } from './native-command-backend'
import type { NativeNodeId } from './native-protocol'
import { render } from './render'

// The reactive scheduler + animation frame source are PROCESS globals (one per runtime). This guard
// makes a second `createNativeApp` that would re-wire them fail loudly instead of silently stealing
// the first app's engines. Reset with `_resetNativeAppEngines()` between tests.
let enginesWired = false

/** @internal Test-only: reset the process-global engine-wiring guard. */
export function _resetNativeAppEngines(): void {
  enginesWired = false
}

/** The contract a native host drives: render once, dispatch events, and tick frames. */
export interface NativeApp {
  /** Mount the app and flush the initial command batch to the host. */
  start(): void
  /**
   * Invoke a registered handler (a native event fired), then flush the resulting batch.
   * `dispatchEvent(handlerId)` for notify-only events (press/click); `dispatchEvent(handlerId, value)`
   * for value-carrying events (text change) — JS wraps `value` as `{ target: { value } }` so handlers
   * read it via the standard event shape. The host passes the RAW string value (never the object);
   * an absent/null value (no second arg) leaves notify-only behavior unchanged.
   */
  dispatchEvent(handlerId: string, value?: string | null): boolean
  /**
   * Advance animations by one frame: forward the host's vsync timestamp (ms) to the animation
   * engine, then flush the resulting command batch. The host calls this each vsync while the frame
   * loop is active (see {@link CreateNativeAppOptions}). A no-op when no frame source is installed.
   */
  frameTick(nowMs: number): void
}

/** The JS→host battery signal: the engine asks the host to run / stop its vsync loop. */
interface HostFrameApi {
  setFrameLoopActive?: (active: boolean) => void
}

/** Options for {@link createNativeApp}. */
export interface CreateNativeAppOptions {
  /**
   * Id of the host's pre-existing root container. Defaults to `"host-root"` — the
   * convention the reference hosts register — so the common case needs no config.
   */
  readonly rootId?: NativeNodeId
  /**
   * How to deliver a command batch to the host. Defaults to `globalThis.MindeesHost.emit`
   * (what the embedded hosts inject). Override in tests or alternative transports.
   */
  readonly emit?: (json: string) => void
  /**
   * Expose the app on a global so the host can call `start()`/`dispatchEvent()`/`frameTick()`.
   * `true` (default) → `globalThis.MindeesApp`; a string → that global name; `false` →
   * don't expose (use the returned handle directly, e.g. in Node tests).
   */
  readonly expose?: boolean | string
  /**
   * Install the reactive scheduler that powers `startTransition`/`deferred`/normal-lane effects.
   * `createNativeApp` owns this scheduler so it can flush the command batch after each microtask
   * drain (otherwise deferred mutations would recompute but never reach the host). Pass `false` to
   * run the pure synchronous lane; to use a fully custom scheduler, pass `false` and call
   * `setReactiveScheduler` yourself (you then own flushing).
   */
  readonly scheduler?: false
  /**
   * Install the reactive scheduler + the vsync frame source. Default: `true` when the app is
   * exposed AND a host (`globalThis.MindeesHost`) is present — so SSR/Node/tests install nothing
   * and keep the synchronous jump-to-final behavior. Pass `true` to force-wire (e.g. tests driving
   * `frameTick` directly).
   */
  readonly wireEngines?: boolean
}

function defaultEmit(json: string): void {
  const host = (globalThis as { MindeesHost?: { emit?: (json: string) => void } }).MindeesHost
  if (!host || typeof host.emit !== 'function') {
    throw new Error(
      'createNativeApp: no `emit` was provided and globalThis.MindeesHost.emit is unavailable',
    )
  }
  host.emit(json)
}

function hostIsPresent(): boolean {
  const host = (globalThis as { MindeesHost?: { emit?: unknown } }).MindeesHost
  return typeof host?.emit === 'function'
}

/**
 * Wire a root node to a native command host. Returns the {@link NativeApp} handle and
 * (unless `expose: false`) publishes it as `globalThis.MindeesApp` for the host to call.
 */
export function createNativeApp(
  root: MindeesNode,
  options: CreateNativeAppOptions = {},
): NativeApp {
  const backend = createNativeCommandBackend({ rootId: options.rootId ?? 'host-root' })
  const emit = options.emit ?? defaultEmit

  const flush = (): void => {
    const batch = backend.flushCommands()
    if (batch.length > 0) emit(JSON.stringify(batch))
  }

  const expose = options.expose ?? true
  const wireEngines = options.wireEngines ?? (expose !== false && hostIsPresent())

  // The engine's onFrame, captured when the animation loop subscribes; `frameTick` drives it.
  let storedTick: ((nowMs: number) => void) | null = null

  if (wireEngines) {
    if (enginesWired) {
      // The reactive scheduler + frame source are process globals; a second wiring would silently
      // steal the first app's engines. Fail loudly instead. (One app per runtime; tests reset via
      // _resetNativeAppEngines.)
      throw new Error(
        'createNativeApp: the reactive engines are already wired by another app instance. Create one ' +
          'app per runtime, or pass `wireEngines: false` (and wire the scheduler/frame source yourself).',
      )
    }
    enginesWired = true

    // A microtask-drained scheduler. After each drained task we run ONE coalesced trailing flush so
    // deferred/startTransition/normal-lane tree mutations (which land on a microtask, outside the
    // frameTick + dispatchEvent windows) still reach the host — one frame late, never dropped. We
    // OWN this scheduler so the trailing flush is always wired (a custom scheduler couldn't be).
    if (options.scheduler !== false) {
      let flushQueued = false
      const trailingFlush = (): void => {
        if (flushQueued) return
        flushQueued = true
        queueMicrotask(() => {
          flushQueued = false
          flush()
        })
      }
      setReactiveScheduler(
        createScheduler({
          scheduleMicrotask: (cb) =>
            queueMicrotask(() => {
              cb()
              trailingFlush()
            }),
          onError: (error) => {
            // Surface a scheduled-task error instead of swallowing it (uncaught → host log).
            queueMicrotask(() => {
              throw error
            })
          },
        }),
      )
    }

    // The vsync frame source: capture the engine's tick + signal the host to run/stop its loop. The
    // subscribe (START) fires the instant the first animation driver arms the loop; the unsubscribe
    // (STOP) fires the instant the last driver settles — so the host's vsync loop runs ONLY while
    // something animates (the battery win), with no separate heuristic to keep in sync.
    //
    // CRITICAL: only install the source when a host can actually DRIVE it (MindeesHostFrame present,
    // i.e. there's a `frameTick` caller + a `setFrameLoopActive` listener). Arming a loop that
    // nothing ticks would FREEZE animations at their start value — strictly worse than jumping to
    // the final value. With no driver, leave the source null → animations jump-to-final (safe).
    const hostFrame = (globalThis as { MindeesHostFrame?: HostFrameApi }).MindeesHostFrame
    if (hostFrame) {
      const frameSource: FrameSource = (tick) => {
        storedTick = tick
        try {
          hostFrame.setFrameLoopActive?.(true)
        } catch {
          // a throwing host signal must not break arming the loop
        }
        return () => {
          storedTick = null
          try {
            hostFrame.setFrameLoopActive?.(false)
          } catch {
            // ditto: always stop the loop even if the host signal throws
          }
        }
      }
      setFrameSource(frameSource)
    }
  }

  const app: NativeApp = {
    start(): void {
      render(root, backend, backend.root)
      flush()
    },
    dispatchEvent(handlerId: string, value?: string | null): boolean {
      // No value (press/click) → undefined event (unchanged). A string (incl. "" — a cleared field)
      // → { target: { value } } so eventValue() reads the typed text. `== null` treats both undefined
      // and a host-passed null as "no value" while still delivering an empty-string clear.
      const event = value === undefined || value === null ? undefined : { target: { value } }
      const handled = backend.dispatchEvent(handlerId, event)
      flush()
      return handled
    },
    frameTick(nowMs: number): void {
      if (storedTick) storedTick(nowMs)
      flush()
    },
  }

  if (expose !== false) {
    const name = typeof expose === 'string' ? expose : 'MindeesApp'
    ;(globalThis as Record<string, unknown>)[name] = app
  }

  return app
}
