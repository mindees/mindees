/**
 * Standard utility hooks — the batteries RN and Flutter make you reach for a library to get. Each is
 * a thin, allocation-light wrapper over the reactive core (signals + effect), so they're
 * renderer-agnostic (web + native), tracked where it matters, and untracked where a write shouldn't
 * self-subscribe. Device/UI hooks (useWindowDimensions, useColorScheme, …) live in `environment.ts`;
 * these are the stateful logic hooks.
 *
 * @module
 */

import { type Accessor, batch, effect, onCleanup, signal, untrack } from '@mindees/core'

/** A boolean toggle (RN/React: bring-your-own). */
export interface Toggle {
  /** Reactive current value. */
  readonly value: Accessor<boolean>
  /** Flip the value. */
  toggle(): void
  /** Set `true`. */
  on(): void
  /** Set `false`. */
  off(): void
  /** Set explicitly. */
  set(value: boolean): void
}

/** A reactive boolean with toggle/on/off helpers. */
export function useToggle(initial = false): Toggle {
  const s = signal(initial)
  return {
    value: () => s(),
    toggle: () => s.set(!untrack(s)),
    on: () => s.set(true),
    off: () => s.set(false),
    set: (value) => s.set(value),
  }
}

/** A bounded counter. */
export interface Counter {
  /** Reactive current count (always within `[min, max]`). */
  readonly count: Accessor<number>
  /** Increment by `by` (default `step`). */
  inc(by?: number): void
  /** Decrement by `by` (default `step`). */
  dec(by?: number): void
  /** Set explicitly (clamped). */
  set(value: number): void
  /** Reset to the initial value (clamped). */
  reset(): void
}

/** A reactive number with inc/dec/reset + optional min/max/step clamping. */
export function useCounter(
  initial = 0,
  options: { min?: number; max?: number; step?: number } = {},
): Counter {
  const step = options.step ?? 1
  const min = options.min ?? Number.NEGATIVE_INFINITY
  const max = options.max ?? Number.POSITIVE_INFINITY
  const clamp = (v: number): number => Math.min(max, Math.max(min, v))
  const s = signal(clamp(initial))
  return {
    count: () => s(),
    inc: (by = step) => s.set(clamp(untrack(s) + by)),
    dec: (by = step) => s.set(clamp(untrack(s) - by)),
    set: (value) => s.set(clamp(value)),
    reset: () => s.set(clamp(initial)),
  }
}

/** Track the PREVIOUS value of a reactive source (`undefined` until it changes once). */
export function usePrevious<T>(source: Accessor<T>): Accessor<T | undefined> {
  const prev = signal<T | undefined>(undefined)
  let last: T | undefined
  let first = true
  effect(() => {
    const next = source() // track the source
    untrack(() => {
      if (!first) prev.set(last)
      last = next
      first = false
    })
  })
  return () => prev()
}

/** A reducer over reactive state (React's `useReducer`, signal-backed). */
export function useReducer<S, A>(
  reducer: (state: S, action: A) => S,
  initial: S,
): [Accessor<S>, (action: A) => void] {
  const s = signal(initial)
  return [() => s(), (action) => s.set(reducer(untrack(s), action))]
}

/** The reactive state of an async resource. */
export interface AsyncState<T> {
  /** The latest resolved value, or `undefined`. */
  readonly data: Accessor<T | undefined>
  /** The latest rejection, or `undefined`. */
  readonly error: Accessor<unknown>
  /** Whether a run is in flight. */
  readonly loading: Accessor<boolean>
  /** (Re)run the fetcher; supersedes any in-flight run (last-write-wins). */
  run(): void
}

/**
 * Run an async fetcher into reactive `data`/`error`/`loading`. The newest `run()` wins — a stale
 * in-flight promise can never clobber a newer result — and a run in flight when the owner disposes
 * is ignored. Runs immediately unless `immediate: false`.
 */
export function useAsync<T>(
  fetcher: () => Promise<T>,
  options: { immediate?: boolean } = {},
): AsyncState<T> {
  const data = signal<T | undefined>(undefined)
  const error = signal<unknown>(undefined)
  const loading = signal(false)
  let token = 0
  const run = (): void => {
    const mine = ++token
    batch(() => {
      loading.set(true)
      error.set(undefined)
    })
    fetcher().then(
      (value) => {
        if (mine !== token) return // superseded / disposed
        batch(() => {
          data.set(value)
          loading.set(false)
        })
      },
      (err) => {
        if (mine !== token) return
        batch(() => {
          error.set(err)
          loading.set(false)
        })
      },
    )
  }
  onCleanup(() => {
    token++ // invalidate any in-flight run on dispose
  })
  if (options.immediate !== false) run()
  return { data: () => data(), error: () => error(), loading: () => loading(), run }
}
