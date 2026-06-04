/**
 * `createNativeApp` — the one-call entry point for a MindeesNative app on an embedded
 * native host. It hides the wiring an app author should never have to write: creating
 * the {@link createNativeCommandBackend}, rendering the root, flushing the command
 * batch to the host, and exposing the start/dispatch contract the host calls.
 *
 * ```tsx
 * import { createNativeApp } from '@mindees/renderer'
 * import { App } from './App'
 *
 * createNativeApp(<App />)
 * ```
 *
 * That's the whole entry file. The native host (see `examples/native-hosts/`) injects
 * a `MindeesHost.emit(json)` global and calls `MindeesApp.start()` once, then
 * `MindeesApp.dispatchEvent(handlerId)` per native event — both of which this wires.
 *
 * @module
 */

import type { MindeesNode } from '@mindees/core'
import { createNativeCommandBackend } from './native-command-backend'
import type { NativeNodeId } from './native-protocol'
import { render } from './render'

/** The contract a native host drives: render once, then dispatch events by id. */
export interface NativeApp {
  /** Mount the app and flush the initial command batch to the host. */
  start(): void
  /** Invoke a registered handler (a native event fired), then flush the resulting batch. */
  dispatchEvent(handlerId: string, event?: unknown): boolean
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
   * Expose the app on a global so the host can call `start()`/`dispatchEvent()`.
   * `true` (default) → `globalThis.MindeesApp`; a string → that global name; `false` →
   * don't expose (use the returned handle directly, e.g. in Node tests).
   */
  readonly expose?: boolean | string
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

  const app: NativeApp = {
    start(): void {
      render(root, backend, backend.root)
      flush()
    },
    dispatchEvent(handlerId: string, event?: unknown): boolean {
      const handled = backend.dispatchEvent(handlerId, event)
      flush()
      return handled
    },
  }

  const expose = options.expose ?? true
  if (expose !== false) {
    const name = typeof expose === 'string' ? expose : 'MindeesApp'
    ;(globalThis as Record<string, unknown>)[name] = app
  }

  return app
}
