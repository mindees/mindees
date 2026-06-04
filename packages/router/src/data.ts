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
  // Per-route SWR cache. The outer WeakMap lets a route's entries be reclaimed
  // when its RouteRecord is dropped; the inner Map is bounded (see setEntry) so a
  // high-cardinality dynamic route (e.g. `/posts/:id` visited thousands of times)
  // can't grow it without limit. `let` so dispose() can drop it wholesale.
  let cache = new WeakMap<RouteRecord, Map<string, CacheEntry>>()
  const inFlight = new Map<string, AbortController>()
  const ids = new WeakMap<RouteRecord, number>()
  let nextId = 0
  let disposed = false

  // Max distinct (params, loaderDeps) entries retained per route before the oldest
  // non-pending entries are evicted (LRU by last write). Bounds memory growth.
  const MAX_ENTRIES_PER_ROUTE = 64

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
    // Re-insert so Map iteration order is least-recently-written first.
    m.delete(key)
    m.set(key, entry)
    // Bound the cache: evict the oldest entries that aren't currently loading.
    if (m.size > MAX_ENTRIES_PER_ROUTE) {
      for (const [k, e] of m) {
        if (m.size <= MAX_ENTRIES_PER_ROUTE) break
        if (e.status !== 'pending') m.delete(k)
      }
    }
  }

  const ensure = (match: RouteMatch): void => {
    if (disposed) return
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

    // Settle the load. Even an aborted load (e.g. a preload superseded by a
    // navigation) still warms the cache for the route's next visit — but only if
    // our pending entry hasn't already been replaced by a newer load, and we
    // notify observers only when we weren't aborted. This also guarantees an
    // aborted preload never leaves a permanently `pending` cache entry.
    const settle = (settled: CacheEntry): void => {
      if (inFlight.get(gkey) === controller) inFlight.delete(gkey)
      if (getEntry(route, key) !== pendingEntry) return // a newer load superseded us
      setEntry(route, key, settled)
      if (!controller.signal.aborted) options.onChange()
    }

    Promise.resolve()
      .then(() => loader(ctx))
      .then(
        (data) => settle({ status: 'success', data, loadedAt: now() }),
        (error: unknown) => {
          const errored: CacheEntry = { status: 'error', error, loadedAt: now() }
          if (existing?.data !== undefined) errored.data = existing.data
          settle(errored)
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
        const key = innerKey(m.route, m)
        const entry = getEntry(m.route, key)
        if (entry) entry.loadedAt = 0 // force stale
        // If a load is already in flight for this key, abort it so the sync below
        // starts a FRESH load — otherwise ensure() bails on the in-flight guard
        // and the pre-invalidate (possibly stale) result is served, with the
        // staleness mark silently overwritten when it resolves.
        const gkey = `${idOf(m.route)}:${key}`
        const controller = inFlight.get(gkey)
        if (controller) {
          controller.abort()
          inFlight.delete(gkey)
        }
      }
      this.sync(matches)
    },
    dispose() {
      disposed = true
      for (const controller of inFlight.values()) controller.abort()
      inFlight.clear()
      // Drop all cached loader data so a disposed (but still-referenced) manager
      // doesn't retain payloads; a fresh WeakMap lets the inner Maps be GC'd.
      cache = new WeakMap()
    },
  }
}
