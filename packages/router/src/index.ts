/**
 * `@mindees/router` — **Quantum**, the typed router for MindeesNative.
 *
 * Router I (Phase 6): codegen-free typed path params ({@link PathParams}),
 * Standard-Schema validated search params, a signals-native router with typed +
 * relative navigation and selector-isolated state, and an injectable history
 * (memory + browser). See ADR-0003.
 *
 * Router II (Phase 7): render integration — {@link createRouterView} (nested,
 * fine-grained, layout-preserving) and typed {@link createLink} — plus SWR data
 * loaders (with `AbortSignal`, {@link Router.invalidate}/{@link Router.preload}),
 * navigation guards ({@link BeforeNavigate} cancel/redirect + idempotent
 * navigation), and web view transitions. See ADR-0004 and ADR-0005.
 *
 * Still a later phase (not exported): the global typed route registry and
 * file-based route scanning + bundler plugin. See `STATUS.md`.
 *
 * @module
 */

import type { Maturity, PackageInfo } from '@mindees/core'
import { NotImplementedError, notImplemented } from '@mindees/core'

/** Render integration: nested view + typed links (Router II). */
export {
  createLink,
  createRouterView,
  type LinkComponent,
  type LinkOptions,
  type LinkProps,
  type PrefetchMode,
  type RouterViewOptions,
} from './components'
/** Loaders + data (SWR). */
export type {
  LoaderContext,
  LoaderData,
  LoaderDepsFn,
  LoaderFn,
  LoaderStatus,
} from './data'
/** Errors. */
export { RouterError, type RouterErrorCode } from './errors'
/** File-based routing: a module map → a router (Expo-style conventions). */
export { createFileRouter, type RouteModule, routesFromModules } from './file-routes'
/** History capability. */
export {
  createBrowserHistory,
  createHref,
  createMemoryHistory,
  type HistoryListener,
  type MemoryHistoryOptions,
  parseHref,
  type RouterHistory,
  type RouterLocation,
} from './history'
/** Ergonomic hooks + a bound Link that resolve the active router. */
export { Link, useParams, usePathname, useRouter, useSearch } from './hooks'
/** Route patterns + codegen-free typed params. */
export {
  buildPath,
  compareSpecificity,
  type HasPathParams,
  matchPattern,
  type PathParams,
  parsePattern,
} from './pattern'
/** Router. */
export {
  type BeforeNavigate,
  type CreateRouterOptions,
  createRouter,
  type NavigateOptions,
  type NavTarget,
  type RouteComponentProps,
  type RouteMatch,
  type RouteRecord,
  type Router,
  type RouterState,
  resolvePath,
} from './router'
/** Search (query) params. */
export {
  parseQuery,
  type QueryValue,
  safeValidateSearch,
  stringifyQuery,
  type ValidationResult,
  validateSearch,
} from './search'
/** Standard Schema — the validator-agnostic interface (vendored, types only). */
export type { StandardSchemaV1 } from './standard-schema'

/** The npm package name. */
export const name = '@mindees/router'

/** The package version. All `@mindees/*` packages share one locked version line. */
export const VERSION = '0.35.0'

/**
 * Current maturity. Router I (typed params, Standard-Schema search, history, the
 * signals-native router, selector-isolated state, typed + relative navigation)
 * and Router II (nested rendering, typed links, SWR loaders, navigation guards,
 * view transitions) are implemented and tested. The global typed route registry
 * and file-based route scanning are a later phase — see `STATUS.md`.
 */
export const maturity: Maturity = 'experimental'

/** Static identity + maturity metadata for this package (frozen — matches every other `@mindees/*`). */
export const info: PackageInfo = Object.freeze({ name, version: VERSION, maturity })

export type { Maturity, PackageInfo }
export { NotImplementedError, notImplemented }
