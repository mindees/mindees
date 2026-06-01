/**
 * MindeesNative threading abstraction.
 *
 * Defines the **contract** for offloading CPU-bound work off the main thread, so
 * the rest of the framework can parallelize without binding to a specific
 * backend. Two backends are anticipated:
 *
 * - **Web Worker backend** (`createWorkerPool`) — works today on web; runs each
 *   job in a `Worker`.
 * - **Native multi-thread backend** — 🔬 research track. The interface is
 *   defined here so the architecture is real; a native Rust-backed scheduler
 *   will implement {@link ThreadPool} in a later phase. Until then,
 *   {@link createInlineThreadPool} provides a correct, synchronous fallback so
 *   callers are never blocked (Working-Code Doctrine: a real fallback, not a
 *   lying stub).
 *
 * @module
 */

import { NotImplementedError } from '../errors'

/**
 * A pool that runs a pure job function with a transferable argument and resolves
 * its result. Implementations may run jobs on worker threads, native threads, or
 * (as a fallback) inline on the calling thread.
 */
export interface ThreadPool {
  /**
   * Run `job(input)` and resolve its result.
   *
   * `job` must be a **pure, self-contained function** (it may be serialized and
   * re-created in another realm, so it cannot close over outer variables in
   * worker/native backends). `input` must be structured-cloneable.
   */
  run<In, Out>(job: (input: In) => Out, input: In): Promise<Out>
  /** Release all underlying resources (terminate workers, etc.). Idempotent. */
  dispose(): void
  /** Number of live workers/threads (0 for the inline fallback). */
  readonly size: number
}

/**
 * A synchronous, single-realm {@link ThreadPool}: runs each job inline on the
 * calling thread. This is the universal fallback — correct everywhere, with no
 * parallelism. Use it where workers aren't available (or in tests).
 */
export function createInlineThreadPool(): ThreadPool {
  let disposed = false
  return {
    run<In, Out>(job: (input: In) => Out, input: In): Promise<Out> {
      if (disposed) return Promise.reject(new Error('ThreadPool is disposed'))
      try {
        return Promise.resolve(job(input))
      } catch (error) {
        return Promise.reject(error as Error)
      }
    },
    dispose() {
      disposed = true
    },
    size: 0,
  }
}

/** Minimal structural subset of the DOM `Worker` we depend on. */
export interface WorkerLike {
  postMessage(message: unknown): void
  terminate(): void
  onmessage: ((event: { data: unknown }) => void) | null
  onerror: ((event: { message?: string }) => void) | null
}

/** Options for {@link createWorkerPool}. */
export interface WorkerPoolOptions {
  /** Number of workers to spawn. Defaults to 1. */
  size?: number
  /**
   * Factory that creates a worker which evaluates serialized jobs. Injectable so
   * the pool can be unit-tested without a real `Worker` and so the host app
   * controls how the worker module is bundled/loaded.
   */
  createWorker: () => WorkerLike
}

interface PendingJob {
  resolve: (value: unknown) => void
  reject: (error: unknown) => void
}

/**
 * A {@link ThreadPool} backed by Web Workers. Round-robins jobs across `size`
 * workers. The caller supplies `createWorker`; each worker is expected to accept
 * `{ id, source, input }` messages and reply with `{ id, ok, result }` or
 * `{ id, ok: false, error }` (see the reference worker protocol in this package).
 *
 * @remarks Web-only today. The native multi-threaded backend is a research
 * track — see the module docs.
 */
export function createWorkerPool(options: WorkerPoolOptions): ThreadPool {
  const count = Math.max(1, options.size ?? 1)
  const workers: WorkerLike[] = []
  const pending = new Map<number, PendingJob>()
  let nextId = 0
  let rr = 0
  let disposed = false

  for (let i = 0; i < count; i++) {
    const w = options.createWorker()
    w.onmessage = (event) => {
      const data = event.data as { id: number; ok: boolean; result?: unknown; error?: string }
      const job = pending.get(data.id)
      if (!job) return
      pending.delete(data.id)
      if (data.ok) job.resolve(data.result)
      else job.reject(new Error(data.error ?? 'worker job failed'))
    }
    w.onerror = (event) => {
      // A worker-level error fails the oldest in-flight job and is otherwise
      // surfaced; per-job correlation isn't possible for uncaught worker errors.
      const first = pending.entries().next().value
      if (first) {
        const [id, job] = first
        pending.delete(id)
        job.reject(new Error(event.message ?? 'worker error'))
      }
    }
    workers.push(w)
  }

  return {
    run<In, Out>(job: (input: In) => Out, input: In): Promise<Out> {
      if (disposed) return Promise.reject(new Error('ThreadPool is disposed'))
      const id = nextId++
      const worker = workers[rr % workers.length]
      rr++
      if (!worker) return Promise.reject(new Error('no worker available'))
      return new Promise<Out>((resolve, reject) => {
        pending.set(id, { resolve: resolve as (v: unknown) => void, reject })
        worker.postMessage({ id, source: job.toString(), input })
      })
    },
    dispose() {
      if (disposed) return
      disposed = true
      for (const w of workers) w.terminate()
      for (const [, job] of pending) job.reject(new Error('ThreadPool disposed'))
      pending.clear()
    },
    get size() {
      return disposed ? 0 : workers.length
    },
  }
}

/**
 * 🔬 **Research track.** Placeholder for the native (Rust-backed) multi-threaded
 * pool. Not implemented — throws {@link NotImplementedError}. Use
 * {@link createWorkerPool} (web) or {@link createInlineThreadPool} (fallback)
 * today. Tracked for a later phase.
 *
 * @experimental
 */
export function createNativeThreadPool(): ThreadPool {
  throw new NotImplementedError('Native multi-threaded ThreadPool', { rfc: 'RFC-0001' })
}
