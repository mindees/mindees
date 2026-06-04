/**
 * MindeesNative scheduler — a small, deterministic priority scheduler.
 *
 * Two lanes:
 * - **`sync`** — high-priority work (interaction handlers, first frame). Drained
 *   synchronously at the next flush point and always before the normal lane.
 * - **`normal`** — default work, drained on a microtask so multiple schedules in
 *   the same tick coalesce into one flush.
 *
 * Tasks are **cancellable** (via the returned handle) and **dedupable** (two
 * tasks scheduled with the same `key` collapse to one — the latest callback
 * wins, preserving the earlier queue position). The scheduler never throws from
 * a task into the caller: task errors are collected and reported via an optional
 * `onError` hook, so one bad task can't stop the rest of the flush.
 *
 * @module
 */

/** Scheduling lanes, highest priority first. */
export type Priority = 'sync' | 'normal'

/** A unit of scheduled work. */
export type Task = () => void

/** Options for {@link Scheduler.schedule}. */
export interface ScheduleOptions {
  /** Lane to run in. Defaults to `'normal'`. */
  priority?: Priority
  /**
   * Dedup key. Scheduling again with the same key replaces the pending task's
   * callback (latest wins) instead of enqueuing a second one.
   */
  key?: string
}

/** A handle to a scheduled task. */
export interface ScheduledTask {
  /** Remove the task if it hasn't run yet. Idempotent. */
  cancel(): void
  /** Whether the task is still pending (not yet run or cancelled). */
  readonly pending: boolean
}

interface Entry {
  key: string | null
  fn: Task | null // null once cancelled
}

/** Options for {@link Scheduler}. */
export interface SchedulerOptions {
  /**
   * Called with any error thrown by a task. If omitted, errors are rethrown
   * asynchronously (so they surface to the host without aborting the flush).
   */
  onError?: (error: unknown) => void
  /**
   * Schedules a microtask. Injectable for testing; defaults to `queueMicrotask`.
   */
  scheduleMicrotask?: (cb: () => void) => void
}

const defaultScheduleMicrotask: (cb: () => void) => void =
  typeof queueMicrotask === 'function'
    ? queueMicrotask
    : (cb) => {
        void Promise.resolve().then(cb)
      }

/**
 * A deterministic two-lane priority scheduler. Create one with {@link createScheduler}.
 */
export class Scheduler {
  private readonly sync: Entry[] = []
  private readonly normal: Entry[] = []
  private readonly keyed = new Map<string, Entry>()
  private microtaskQueued = false
  private flushing = false
  private readonly onError: ((error: unknown) => void) | undefined
  private readonly scheduleMicrotask: (cb: () => void) => void

  constructor(options?: SchedulerOptions) {
    this.onError = options?.onError
    this.scheduleMicrotask = options?.scheduleMicrotask ?? defaultScheduleMicrotask
  }

  /** Schedule `task`. Returns a handle to cancel it or check its status. */
  schedule(task: Task, options?: ScheduleOptions): ScheduledTask {
    const priority = options?.priority ?? 'normal'
    const key = options?.key ?? null

    if (key !== null) {
      const existing = this.keyed.get(key)
      if (existing && existing.fn !== null) {
        // Dedup: replace the callback, keep the existing queue position.
        existing.fn = task
        return this.makeHandle(existing)
      }
    }

    const entry: Entry = { key, fn: task }
    if (key !== null) this.keyed.set(key, entry)
    ;(priority === 'sync' ? this.sync : this.normal).push(entry)
    this.requestFlush()
    return this.makeHandle(entry)
  }

  /** Run all pending tasks right now (sync lane first), draining both lanes. */
  flushSync(): void {
    if (this.flushing) return
    this.flushing = true
    try {
      // Drain in priority order. Re-check each loop so tasks scheduled by tasks
      // (e.g. a sync task that queues normal work) are handled in this flush.
      while (this.sync.length > 0 || this.normal.length > 0) {
        const entry = this.sync.length > 0 ? this.sync.shift() : this.normal.shift()
        if (!entry) continue
        this.clearKey(entry)
        const fn = entry.fn
        entry.fn = null
        if (fn) this.run(fn)
      }
    } finally {
      this.flushing = false
      this.microtaskQueued = false
    }
  }

  /** Number of pending tasks across both lanes (cancelled tasks excluded). */
  get size(): number {
    let n = 0
    for (const e of this.sync) if (e.fn !== null) n++
    for (const e of this.normal) if (e.fn !== null) n++
    return n
  }

  private requestFlush(): void {
    if (this.microtaskQueued || this.flushing) return
    this.microtaskQueued = true
    this.scheduleMicrotask(() => {
      this.microtaskQueued = false
      this.flushSync()
    })
  }

  private run(fn: Task): void {
    try {
      fn()
    } catch (error) {
      if (this.onError) {
        try {
          this.onError(error)
        } catch (hookError) {
          // A throwing onError hook must not abort the flush or strand the tasks
          // queued after it; surface it asynchronously like an unhandled task error.
          this.scheduleMicrotask(() => {
            throw hookError
          })
        }
      } else {
        // Surface without aborting the flush.
        this.scheduleMicrotask(() => {
          throw error
        })
      }
    }
  }

  /**
   * Remove an entry's dedup-key mapping, but only if the map still points at THIS
   * entry. Keys are reused over time (a 'render' key is scheduled, runs, then
   * scheduled again), so a stale handle or an already-dequeued entry must never
   * evict a newer live entry's mapping — doing so would break dedup and let two
   * same-key tasks both run.
   */
  private clearKey(entry: Entry): void {
    if (entry.key !== null && this.keyed.get(entry.key) === entry) {
      this.keyed.delete(entry.key)
    }
  }

  private makeHandle(entry: Entry): ScheduledTask {
    return {
      cancel: () => {
        entry.fn = null
        this.clearKey(entry)
      },
      get pending() {
        return entry.fn !== null
      },
    }
  }
}

/** Create a new {@link Scheduler}. */
export function createScheduler(options?: SchedulerOptions): Scheduler {
  return new Scheduler(options)
}
