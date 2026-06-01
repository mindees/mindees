/**
 * `mindees dev` — the dev orchestrator.
 *
 * The orchestrator is the deterministic, tested core: it builds once, then
 * rebuilds whenever a {@link Watcher} reports a change, tracking rebuild count
 * and the last result. It is decoupled from any real file watcher or HTTP/HMR
 * transport (those are injected), so it can be unit-tested with a fake watcher.
 *
 * The live HTTP server + browser HMR socket is a thin developer-preview
 * transport layer (in `bin`); the rebuild-on-change behavior proven here is the
 * substance.
 *
 * @module
 */

import { type BuildOptions, type BuildResult, buildProject } from './build'
import type { FileSystem } from './fs'

/** A file watcher: registers a listener, returns an unsubscribe function. */
export interface Watcher {
  /** Subscribe to change events; the returned function stops watching. */
  onChange(listener: (changedPath: string) => void): () => void
}

/** A running dev session. */
export interface DevSession {
  /** Number of builds performed (1 initial + one per change). */
  readonly buildCount: number
  /** The most recent build result. */
  readonly lastResult: BuildResult
  /** Stop watching and end the session. */
  stop(): void
}

/** Options for {@link startDev}. */
export interface DevOptions extends BuildOptions {
  /** Called after every (re)build, e.g. to push HMR updates. */
  onRebuild?: (result: BuildResult, changedPath: string | null) => void
}

/**
 * Start a dev session: build once immediately, then rebuild on each watcher
 * change. Returns a {@link DevSession} exposing the build count + last result
 * and a `stop()` that unsubscribes.
 */
export function startDev(fs: FileSystem, watcher: Watcher, options: DevOptions = {}): DevSession {
  const { onRebuild, ...buildOptions } = options

  let buildCount = 0
  let lastResult: BuildResult

  const rebuild = (changedPath: string | null): void => {
    lastResult = buildProject(fs, buildOptions)
    buildCount++
    onRebuild?.(lastResult, changedPath)
  }

  rebuild(null) // initial build
  const unsubscribe = watcher.onChange((path) => rebuild(path))

  return {
    get buildCount() {
      return buildCount
    },
    get lastResult() {
      return lastResult
    },
    stop() {
      unsubscribe()
    },
  }
}
