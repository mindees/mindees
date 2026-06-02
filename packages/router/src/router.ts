/**
 * The Quantum router — signals-native routing state with typed, validated
 * navigation and re-render isolation.
 *
 * Router state (location, params, search, matched route) is modeled as the
 * fine-grained signal graph from `@mindees/core` (Phase 1 `signal`/`computed`,
 * Phase 2 selector isolation). Consumers read a slice via {@link Router.select}
 * and re-run **only** when that slice changes — no whole-tree re-render on
 * navigation, no global-vs-local hook trap (cf. Expo Router). See ADR-0003.
 *
 * @module
 */

import { type Component, computed, createRoot, type Memo, type Signal, signal } from '@mindees/core'
import { createHref, createMemoryHistory, type RouterHistory, type RouterLocation } from './history'
import {
  buildPath,
  compareSpecificity,
  type HasPathParams,
  matchPattern,
  type PathParams,
} from './pattern'
import { parseQuery, type QueryValue, safeValidateSearch, stringifyQuery } from './search'
import type { StandardSchemaV1 } from './standard-schema'

// ---------------------------------------------------------------------------
// Route table types
// ---------------------------------------------------------------------------

/** A route: a path pattern, an optional component, and an optional search schema. */
export interface RouteRecord {
  /** The path pattern (e.g. `/posts/:postId`, `/files/:rest*`). */
  path: string
  /** The component to render for this route (rendering is wired in Router II). */
  component?: Component
  /** A Standard Schema validating this route's search params. */
  searchSchema?: StandardSchemaV1
  /** Arbitrary route metadata. */
  meta?: Readonly<Record<string, unknown>>
}

/** The result of matching a location against the route table. */
export interface RouteMatch {
  /** The matched route record. */
  route: RouteRecord
  /** The matched pathname. */
  pathname: string
  /** Path params extracted from the pattern. */
  params: Record<string, string>
  /** Search params — validated output when a schema is present, else the raw parse. */
  search: Record<string, unknown>
  /** The raw parsed query, before schema validation. */
  searchRaw: Record<string, string | string[]>
  /** Search-validation issues, present only when validation failed. */
  issues?: ReadonlyArray<StandardSchemaV1.Issue>
}

/** The router's reactive state — a snapshot read through fine-grained signals. */
export interface RouterState {
  /** The current location. */
  location: RouterLocation
  /** The matched route, or `null` if nothing matched. */
  match: RouteMatch | null
  /** Convenience: the current pathname. */
  pathname: string
  /** Convenience: the current path params (`{}` when unmatched). */
  params: Record<string, string>
  /** Convenience: the current search params (`{}` when unmatched). */
  search: Record<string, unknown>
}

// ---------------------------------------------------------------------------
// Navigation types — typed targets
// ---------------------------------------------------------------------------

/** Options that apply to any navigation. */
export interface NavigateOptions {
  /** Replace the current history entry instead of pushing a new one. */
  replace?: boolean
}

/** The params/search/hash carried by a structured target, with params required iff the pattern has them. */
type NavExtras<P extends string> = {
  /** Search params to serialize into the query string. */
  search?: Record<string, QueryValue>
  /** A hash fragment (with or without a leading `#`). */
  hash?: string
} & (HasPathParams<P> extends true ? { params: PathParams<P> } : { params?: Record<string, never> })

/**
 * A fully-typed structured navigation target. `to` is a path pattern; `params`
 * is **required** when the pattern has dynamic segments and forbidden otherwise
 * — inferred from `to` with zero codegen.
 *
 * The param requirement is enforced when `to` is a **string literal**. If `to`
 * is a widened `string` (e.g. read from a variable typed `string`), its segments
 * can't be inferred, so `params` is not type-checked — a missing required param
 * then throws {@link RouterError} (`MISSING_PARAM`) at runtime.
 *
 * @example
 * router.navigate({ to: '/posts/:postId', params: { postId: '42' } })
 * router.navigate({ to: '/about' }) // no params allowed
 */
export type NavTarget<P extends string> = { to: P } & NavExtras<P>

/** The broad runtime shape `navigate` accepts (the typed surface is {@link NavTarget}). */
interface NavTargetInput {
  to: string
  params?: Record<string, string | number>
  search?: Record<string, QueryValue>
  hash?: string
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

/** Options for {@link createRouter}. */
export interface CreateRouterOptions {
  /** The route table. Order is irrelevant — routes are matched most-specific first. */
  routes: readonly RouteRecord[]
  /** The history adapter. Defaults to an in-memory history at `/`. */
  history?: RouterHistory
}

/** A live router instance. */
export interface Router {
  /** The full reactive state snapshot. */
  state(): RouterState
  /** The current location. */
  location(): RouterLocation
  /** The current match, or `null`. */
  match(): RouteMatch | null
  /** The current path params (`{}` when unmatched). */
  params(): Record<string, string>
  /** The current search params (`{}` when unmatched). */
  search(): Record<string, unknown>
  /**
   * Subscribe to a derived slice of router state with re-render isolation. The
   * returned accessor (a memo) only changes when `selector(state)` changes under
   * `equals` (default `Object.is`) — the same selector-isolation technique as
   * core's Phase 2 `createProvider` (a computed memo over an `equals:false`
   * source), applied to route state.
   */
  select<S>(selector: (state: RouterState) => S, equals?: (a: S, b: S) => boolean): () => S
  /** Navigate to a typed target or a (possibly relative) href string. */
  navigate<P extends string>(target: string | NavTarget<P>, options?: NavigateOptions): void
  /**
   * Replace the route table and re-match the current location **in place** — the
   * location is preserved (dynamic reconfiguration without state reset).
   */
  setRoutes(routes: readonly RouteRecord[]): void
  /** The active route table, sorted most-specific first. */
  routes(): readonly RouteRecord[]
  /** The underlying history adapter. */
  readonly history: RouterHistory
  /** Tear down the router's reactive scope and history subscription. */
  dispose(): void
}

const EMPTY_PARAMS: Record<string, string> = Object.freeze({})
const EMPTY_SEARCH: Record<string, unknown> = Object.freeze({})

/** Sort routes most-specific first (static > dynamic > catch-all). */
function sortRoutes(routes: readonly RouteRecord[]): RouteRecord[] {
  return [...routes].sort((a, b) => compareSpecificity(a.path, b.path))
}

/** Match a location against the (pre-sorted) route table. */
function matchLocation(
  routes: readonly RouteRecord[],
  location: RouterLocation,
): RouteMatch | null {
  for (const route of routes) {
    const params = matchPattern(route.path, location.pathname)
    if (params === null) continue

    const searchRaw = parseQuery(location.search)
    let search: Record<string, unknown> = searchRaw
    let issues: ReadonlyArray<StandardSchemaV1.Issue> | undefined

    if (route.searchSchema) {
      const result = safeValidateSearch(route.searchSchema, searchRaw)
      if (result.ok) {
        search = result.value as Record<string, unknown>
      } else {
        issues = result.issues
      }
    }

    const base: RouteMatch = { route, pathname: location.pathname, params, search, searchRaw }
    return issues ? { ...base, issues } : base
  }
  return null
}

/**
 * Resolve a (possibly relative) path against a base pathname. Absolute paths
 * (leading `/`) ignore the base; `.`/`..` segments are applied against it,
 * treating the base pathname as a directory.
 *
 * @example
 * resolvePath('/a/b', '/x')      // '/a/b'
 * resolvePath('edit', '/posts/1') // '/posts/1/edit'
 * resolvePath('../', '/posts/1')  // '/posts'
 */
export function resolvePath(to: string, from: string): string {
  const stack = to.startsWith('/') ? [] : from.split('/').filter((s) => s.length > 0)
  for (const seg of to.split('/')) {
    if (seg === '' || seg === '.') continue
    if (seg === '..') stack.pop()
    else stack.push(seg)
  }
  return `/${stack.join('/')}`
}

/** Resolve an href string (which may be relative and carry query/hash) against a location. */
function resolveHref(to: string, from: RouterLocation): string {
  const hasPath = to.length > 0 && to[0] !== '?' && to[0] !== '#'
  let rest = to
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
  const pathname = hasPath ? resolvePath(rest, from.pathname) : from.pathname
  // RFC 3986: a fragment-only reference (no path, no query) keeps the current
  // path AND query, replacing only the fragment — so a `#anchor` navigation must
  // not drop the active search params.
  const finalSearch = !hasPath && queryIndex === -1 ? from.search : search
  return `${pathname}${finalSearch}${hash}`
}

/** Build an href from a structured navigation target. */
function buildHref(target: NavTargetInput): string {
  const pathname = buildPath(target.to, target.params ?? {})
  const query = target.search ? stringifyQuery(target.search) : ''
  let hash = target.hash ?? ''
  if (hash.length > 0 && !hash.startsWith('#')) hash = `#${hash}`
  return `${pathname}${query ? `?${query}` : ''}${hash}`
}

/**
 * Create a router over a route table. State is reactive (signals); call
 * {@link Router.dispose} to tear it down.
 */
export function createRouter(options: CreateRouterOptions): Router {
  const history = options.history ?? createMemoryHistory()

  let routesSig!: Signal<readonly RouteRecord[]>
  let locationSig!: Signal<RouterLocation>
  let stateMemo!: Memo<RouterState>

  const dispose = createRoot((disposeRoot) => {
    routesSig = signal<readonly RouteRecord[]>(sortRoutes(options.routes), { equals: false })
    locationSig = signal<RouterLocation>(history.location(), { equals: false })
    const matchMemo = computed(() => matchLocation(routesSig(), locationSig()))
    stateMemo = computed<RouterState>(() => {
      const location = locationSig()
      const match = matchMemo()
      return {
        location,
        match,
        pathname: location.pathname,
        params: match ? match.params : EMPTY_PARAMS,
        search: match ? match.search : EMPTY_SEARCH,
      }
    })
    const unsubscribe = history.subscribe((loc) => locationSig.set(loc))
    return () => {
      unsubscribe()
      disposeRoot()
    }
  })

  const navigate = (target: string | NavTargetInput, options?: NavigateOptions): void => {
    const href = typeof target === 'string' ? resolveHref(target, locationSig()) : buildHref(target)
    if (options?.replace) history.replace(href)
    else history.push(href)
  }

  return {
    state: () => stateMemo(),
    location: () => locationSig(),
    match: () => stateMemo().match,
    params: () => stateMemo().params,
    search: () => stateMemo().search,
    select: <S>(selector: (state: RouterState) => S, equals: (a: S, b: S) => boolean = Object.is) =>
      computed(() => selector(stateMemo()), { equals }),
    navigate: navigate as Router['navigate'],
    setRoutes: (routes) => routesSig.set(sortRoutes(routes)),
    routes: () => routesSig(),
    history,
    dispose,
  }
}

export { createHref }
