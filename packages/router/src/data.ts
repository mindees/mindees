/**
 * Loaders + data — a stale-while-revalidate (SWR) cache for route loaders.
 *
 * A route may declare a `loader`. The manager runs loaders for the matched
 * chain, caches results (keyed by route identity + params + `loaderDeps`),
 * serves stale data while revalidating, aborts superseded loads via
 * `AbortSignal`, and exposes results **reactively** so a component's data binding
 * updates when its load resolves — without re-mounting the component. See
 * ADR-0005.
 *
 * @module
 */

import type { RouterLocation } from './history'
import type { RouteMatch, RouteRecord } from './router'

/** Context passed to a route `loader`. */
export interface LoaderContext {
  /** The matched path params. */
  params: Record<string, string>
  /** The (validated) search params. */
  search: Record<string, unknown>
  /** The current location. */
  location: RouterLocation
  /** Aborted when this load is superseded (navigated away, or re-keyed). */
  signal: AbortSignal
}

/** A route data loader. May be sync or async. */
export type LoaderFn = (ctx: LoaderContext) => unknown | Promise<unknown>

/**
 * Declares which inputs key a route's loader cache (e.g. specific search params).
 * The returned value keys the SWR cache via `JSON.stringify`, so it must be
 * JSON-serializable (and ideally have stable property order). A non-serializable
 * value degrades to a params-only cache key rather than throwing.
 */
export type LoaderDepsFn = (args: { search: Record<string, unknown> }) => unknown

/** Loader lifecycle status. */
export type LoaderStatus = 'idle' | 'pending' | 'success' | 'error'

/** The reactive state of a route's loader. */
export interface LoaderData<T = unknown> {
  /** `idle` when the route has no loader or hasn't started. */
  status: LoaderStatus
  /** The loaded value (also present while `pending` if a stale value exists). */
  data?: T
  /** The error, when `status === 'error'`. */
  error?: unknown
}

const IDLE: LoaderData = Object.freeze({ status: 'idle' })

interface CacheEntry {
  status: LoaderStatus
  data?: unknown
  error?: unknown
  loadedAt: number
  controller?: AbortController
}

/** Options for {@link createLoaderManager}. */
export interface LoaderManagerOptions {
  /** The current location (for the loader context). */
  location: () => RouterLocation
  /** Called whenever cached data changes (bump the reactive data version). */
  onChange: () => void
  /** Subscribe the current reactive scope to data changes (read the version signal). */
  track: () => void
  /** Wall-clock now (injectable for tests). Defaults to `Date.now`. */
  now?: () => number
}

/** Manages route loaders + their SWR cache. */
export interface LoaderManager {
  /** Ensure loads for the matched chain and abort loads for routes no longer matched. */
  sync(matches: readonly RouteMatch[]): void
  /** Ensure loads for `matches` WITHOUT aborting others (used by `preload`). */
  preload(matches: readonly RouteMatch[]): void
  /** Reactively read a match's loader state. */
  read(match: RouteMatch): LoaderData
  /** Mark the given chain's entries stale and reload them. */
  invalidate(matches: readonly RouteMatch[]): void
  /** Abort all in-flight loads. */
  dispose(): void
}

/** Create a loader manager. */
export function createLoaderManager(options: LoaderManagerOptions): LoaderManager {
  const now = options.now ?? Date.now
  const cache = new WeakMap<RouteRecord, Map<string, CacheEntry>>()
  const inFlight = new Map<string, AbortController>()
  const ids = new WeakMap<RouteRecord, number>()
  let nextId = 0

  const idOf = (route: RouteRecord): number => {
    let id = ids.get(route)
    if (id === undefined) {
      id = nextId++
      ids.set(route, id)
    }
    return id
  }

  const innerKey = (route: RouteRecord, match: RouteMatch): string => {
    try {
      const deps = route.loaderDeps ? route.loaderDeps({ search: match.search }) : null
      return JSON.stringify({ p: match.params, d: deps })
    } catch {
      // A throwing or non-serializable loaderDeps (BigInt/circular): degrade to a
      // params-only key rather than throwing out of navigation. `params` is
      // always a Record<string, string>, so this is total. (loaderDeps should be
      // pure and JSON-serializable — see LoaderDepsFn.) innerKey is also called
      // from currentGlobalKeys/read/invalidate, so it must never throw.
      return `${JSON.stringify({ p: match.params })}::unserializable-deps`
    }
  }

  const getEntry = (route: RouteRecord, key: string): CacheEntry | undefined =>
    cache.get(route)?.get(key)

  const setEntry = (route: RouteRecord, key: string, entry: CacheEntry): void => {
    let m = cache.get(route)
    if (!m) {
      m = new Map()
      cache.set(route, m)
    }
    m.set(key, entry)
  }

  const ensure = (match: RouteMatch): void => {
    const route = match.route
    const loader = route.loader
    if (!loader) return

    const key = innerKey(route, match)
    const gkey = `${idOf(route)}:${key}`
    const existing = getEntry(route, key)
    const staleTime = route.staleTime ?? 0

    if (existing?.status === 'success' && now() - existing.loadedAt < staleTime) return
    if (inFlight.has(gkey)) return // a load for this exact key is already running

    const controller = new AbortController()
    inFlight.set(gkey, controller)
    // Keep any prior data visible while revalidating (stale-while-revalidate).
    const pendingEntry: CacheEntry = {
      status: 'pending',
      loadedAt: existing?.loadedAt ?? 0,
      controller,
    }
    if (existing?.data !== undefined) pendingEntry.data = existing.data
    setEntry(route, key, pendingEntry)
    options.onChange()

    const ctx: LoaderContext = {
      params: match.params,
      search: match.search,
      location: options.location(),
      signal: controller.signal,
    }

    Promise.resolve()
      .then(() => loader(ctx))
      .then(
        (data) => {
          if (controller.signal.aborted) return
          inFlight.delete(gkey)
          setEntry(route, key, { status: 'success', data, loadedAt: now() })
          options.onChange()
        },
        (error: unknown) => {
          if (controller.signal.aborted) return
          inFlight.delete(gkey)
          const errored: CacheEntry = { status: 'error', error, loadedAt: now() }
          if (existing?.data !== undefined) errored.data = existing.data
          setEntry(route, key, errored)
          options.onChange()
        },
      )
  }

  const currentGlobalKeys = (matches: readonly RouteMatch[]): Set<string> => {
    const keys = new Set<string>()
    for (const m of matches) {
      if (m.route.loader) keys.add(`${idOf(m.route)}:${innerKey(m.route, m)}`)
    }
    return keys
  }

  // Run ensure() for one match, isolating failures so a single route can never
  // abort the whole pass (and so nothing escapes navigation).
  const ensureSafe = (match: RouteMatch): void => {
    try {
      ensure(match)
    } catch {
      // A route's key/loader-start failure must not break sibling/child loads.
    }
  }

  return {
    sync(matches) {
      for (const m of matches) ensureSafe(m)
      // Abort in-flight loads for routes no longer in the matched chain.
      const keep = currentGlobalKeys(matches)
      for (const [gkey, controller] of inFlight) {
        if (!keep.has(gkey)) {
          controller.abort()
          inFlight.delete(gkey)
        }
      }
    },
    preload(matches) {
      for (const m of matches) ensureSafe(m)
    },
    read(match) {
      options.track()
      const route = match.route
      if (!route.loader) return IDLE
      const entry = getEntry(route, innerKey(route, match))
      if (!entry) return IDLE
      const out: LoaderData = { status: entry.status }
      if (entry.data !== undefined) out.data = entry.data
      if (entry.error !== undefined) out.error = entry.error
      return out
    },
    invalidate(matches) {
      for (const m of matches) {
        if (!m.route.loader) continue
        const entry = getEntry(m.route, innerKey(m.route, m))
        if (entry) entry.loadedAt = 0 // force stale
      }
      this.sync(matches)
    },
    dispose() {
      for (const controller of inFlight.values()) controller.abort()
      inFlight.clear()
    },
  }
}
