/**
 * Standard utility hooks — the batteries RN and Flutter make you reach for a library to get. Each is
 * a thin, allocation-light wrapper over the reactive core (signals + effect), so they're
 * renderer-agnostic (web + native), tracked where it matters, and untracked where a write shouldn't
 * self-subscribe. Device/UI hooks (useWindowDimensions, useColorScheme, …) live in `environment.ts`;
 * these are the stateful logic hooks.
 *
 * @module
 */

import {
  type Accessor,
  batch,
  effect,
  onCleanup,
  type Signal,
  signal,
  untrack,
} from '@mindees/core'

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

/** The minimal key/value store {@link usePersistentSignal} reads/writes (a Web Storage subset). */
export interface SignalStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

/** Options for {@link usePersistentSignal}. */
export interface PersistentSignalOptions<T> {
  /** Where to persist. Defaults to `localStorage` on web; degrades to in-memory elsewhere (no-op). */
  readonly storage?: SignalStorage
  /** Serialize before saving (default `JSON.stringify`). */
  readonly serialize?: (value: T) => string
  /** Parse on restore (default `JSON.parse`). */
  readonly deserialize?: (raw: string) => T
}

/** Web `localStorage` if available, else a no-op store (SSR/native without an injected storage). */
function defaultStorage(): SignalStorage {
  const ls = (globalThis as { localStorage?: SignalStorage }).localStorage
  if (ls && typeof ls.getItem === 'function' && typeof ls.setItem === 'function') return ls
  return { getItem: () => null, setItem: () => {} }
}

/**
 * A signal that restores its initial value from a key/value store and auto-saves on every change —
 * persist theme/prefs/UI state with one call. On web it uses `localStorage` by default; inject a
 * `storage` (e.g. a Continuum-backed one) for native. A corrupt/unparseable stored value falls back
 * to `initial`; storage errors (quota/SSR) are swallowed so the signal always works.
 */
export function usePersistentSignal<T>(
  key: string,
  initial: T,
  options: PersistentSignalOptions<T> = {},
): Signal<T> {
  const storage = options.storage ?? defaultStorage()
  const serialize = options.serialize ?? JSON.stringify
  const deserialize = options.deserialize ?? (JSON.parse as (raw: string) => T)

  let start = initial
  let raw: string | null = null
  try {
    raw = storage.getItem(key)
  } catch {
    raw = null
  }
  if (raw !== null) {
    try {
      start = deserialize(raw)
    } catch {
      start = initial // corrupt payload → fall back
    }
  }

  const s = signal(start)
  effect(() => {
    const value = s()
    try {
      storage.setItem(key, serialize(value))
    } catch {
      // quota exceeded / no storage → ignore; the in-memory signal still works
    }
  })
  return s
}

/**
 * A debounced view of `source`: it follows `source` but only after the source has stopped changing
 * for `ms` (e.g. a search box that queries after typing settles). Rapid changes coalesce to the last.
 */
export function useDebounce<T>(source: Accessor<T>, ms: number): Accessor<T> {
  const out = signal(untrack(source))
  effect(() => {
    const value = source() // track
    if (typeof setTimeout !== 'function') {
      untrack(() => out.set(value)) // SSR/no-timer: pass through synchronously
      return
    }
    const id = setTimeout(() => out.set(value), ms)
    onCleanup(() => clearTimeout(id))
  })
  return () => out()
}

/** Run `callback` every `ms` while the owner is alive; pass `null` to pause. Cleared on dispose. */
export function useInterval(callback: () => void, ms: number | null): void {
  effect(() => {
    if (ms === null || typeof setInterval !== 'function') return
    const id = setInterval(() => callback(), ms)
    onCleanup(() => clearInterval(id))
  })
}

/** Run `callback` once after `ms`; pass `null` to cancel. Cleared on dispose before it fires. */
export function useTimeout(callback: () => void, ms: number | null): void {
  effect(() => {
    if (ms === null || typeof setTimeout !== 'function') return
    const id = setTimeout(() => callback(), ms)
    onCleanup(() => clearTimeout(id))
  })
}
