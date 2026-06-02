/**
 * History — the navigation capability the router is built on.
 *
 * {@link RouterHistory} is a tiny observable over a location. Two adapters ship:
 * {@link createMemoryHistory} (in-memory, the primary tested path — no DOM, so
 * the whole router is deterministically testable headless) and
 * {@link createBrowserHistory} (binds `window.history` + `popstate`).
 *
 * @module
 */

/** A parsed location: pathname plus the raw search and hash strings. */
export interface RouterLocation {
  /** Path portion, always starting with `/` (e.g. `/posts/42`). */
  readonly pathname: string
  /** Raw search string including the leading `?` (e.g. `?page=2`), or `''`. */
  readonly search: string
  /** Raw hash including the leading `#`, or `''`. */
  readonly hash: string
}

/** A listener notified on every location change. */
export type HistoryListener = (location: RouterLocation) => void

/** The navigation capability: read the location, navigate, and subscribe. */
export interface RouterHistory {
  /** The current location. */
  location(): RouterLocation
  /** Push a new entry (forward history is discarded). Notifies synchronously. */
  push(to: string): void
  /** Replace the current entry in place. Notifies synchronously. */
  replace(to: string): void
  /**
   * Move within the stack by a relative delta.
   *
   * Timing differs by adapter: {@link createMemoryHistory} updates and notifies
   * **synchronously**, whereas {@link createBrowserHistory} delegates to
   * `window.history` and the location change is observed **asynchronously** via
   * the `popstate` event — so reading `location()` immediately after `go()` may
   * still return the previous location in a browser.
   */
  go(delta: number): void
  /** Shorthand for `go(-1)`. See {@link RouterHistory.go} for timing caveats. */
  back(): void
  /** Shorthand for `go(1)`. See {@link RouterHistory.go} for timing caveats. */
  forward(): void
  /** Subscribe to location changes; returns an unsubscribe function. */
  subscribe(listener: HistoryListener): () => void
}

const ROOT: RouterLocation = { pathname: '/', search: '', hash: '' }

/** Parse an href string into a {@link RouterLocation} (no base required). */
export function parseHref(href: string): RouterLocation {
  let rest = href
  let hash = ''
  const hashIndex = rest.indexOf('#')
  if (hashIndex !== -1) {
    hash = rest.slice(hashIndex)
    rest = rest.slice(0, hashIndex)
  }
  let search = ''
  const queryIndex = rest.indexOf('?')
  if (queryIndex !== -1) {
    search = rest.slice(queryIndex)
    rest = rest.slice(0, queryIndex)
  }
  // Guarantee the documented invariant: pathname always starts with '/'.
  const pathname = rest.length === 0 ? '/' : rest.startsWith('/') ? rest : `/${rest}`
  return { pathname, search, hash }
}

/** Serialize a {@link RouterLocation} back into an href string. */
export function createHref(location: RouterLocation): string {
  return `${location.pathname}${location.search}${location.hash}`
}

/** Options for {@link createMemoryHistory}. */
export interface MemoryHistoryOptions {
  /** Initial entries (hrefs). Defaults to `['/']`. */
  initialEntries?: readonly string[]
  /** Initial index into `initialEntries`. Defaults to the last entry. */
  initialIndex?: number
}

/** Clamp `n` to the inclusive range `[min, max]`. */
function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n))
}

/**
 * Create an in-memory history. Deterministic and DOM-free — the primary tested
 * path and the right adapter for SSR, tests, and non-browser hosts.
 */
export function createMemoryHistory(options: MemoryHistoryOptions = {}): RouterHistory {
  const initial =
    options.initialEntries && options.initialEntries.length > 0 ? options.initialEntries : ['/']
  const entries: RouterLocation[] = initial.map(parseHref)
  let index = clamp(options.initialIndex ?? entries.length - 1, 0, entries.length - 1)
  const listeners = new Set<HistoryListener>()

  const current = (): RouterLocation => entries[index] ?? ROOT
  const notify = (): void => {
    const location = current()
    for (const listener of listeners) listener(location)
  }
  const go = (delta: number): void => {
    const next = clamp(index + delta, 0, entries.length - 1)
    if (next !== index) {
      index = next
      notify()
    }
  }

  return {
    location: current,
    push(to) {
      entries.splice(index + 1)
      entries.push(parseHref(to))
      index = entries.length - 1
      notify()
    },
    replace(to) {
      entries[index] = parseHref(to)
      notify()
    },
    go,
    back: () => go(-1),
    forward: () => go(1),
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}

/**
 * Create a history bound to the browser's `window.history`. `push`/`replace` use
 * the History API; `popstate` (back/forward) is observed and forwarded to
 * subscribers. The `popstate` listener is attached lazily while there is at
 * least one subscriber and removed when the last one unsubscribes.
 *
 * Requires a DOM (`window`). Use {@link createMemoryHistory} elsewhere.
 */
export function createBrowserHistory(): RouterHistory {
  const listeners = new Set<HistoryListener>()
  const current = (): RouterLocation => ({
    pathname: window.location.pathname,
    search: window.location.search,
    hash: window.location.hash,
  })
  const notify = (): void => {
    const location = current()
    for (const listener of listeners) listener(location)
  }
  const onPopState = (): void => notify()

  return {
    location: current,
    push(to) {
      window.history.pushState(null, '', to)
      notify()
    },
    replace(to) {
      window.history.replaceState(null, '', to)
      notify()
    },
    go: (delta) => window.history.go(delta),
    back: () => window.history.back(),
    forward: () => window.history.forward(),
    subscribe(listener) {
      if (listeners.size === 0) window.addEventListener('popstate', onPopState)
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
        if (listeners.size === 0) window.removeEventListener('popstate', onPopState)
      }
    },
  }
}
