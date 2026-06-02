/**
 * `@mindees/router` — **Quantum**, the typed router for MindeesNative.
 *
 * Router I ships the typed routing core: codegen-free typed path params
 * ({@link PathParams}), Standard-Schema validated search params, a signals-native
 * router with typed + relative navigation and selector-isolated state, and an
 * injectable history (memory + browser). See ADR-0003 and `STATUS.md` for the
 * Router II roadmap (renderer-bound `Link`/`Outlet`, file-based scanning,
 * loaders).
 *
 * @module
 */

import type { Maturity, PackageInfo } from '@mindees/core'
import { NotImplementedError, notImplemented } from '@mindees/core'

/** Errors. */
export { RouterError, type RouterErrorCode } from './errors'
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
  type CreateRouterOptions,
  createRouter,
  type NavigateOptions,
  type NavTarget,
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
export const VERSION = '0.0.0'

/**
 * Current maturity. The typed routing core (patterns/params, Standard-Schema
 * search validation, history, the signals-native router, selector-isolated
 * state, typed + relative navigation) is implemented and tested. Renderer-bound
 * components and file-based route scanning are Router II — see `STATUS.md`.
 */
export const maturity: Maturity = 'experimental'

/** Static identity + maturity metadata for this package. */
export const info: PackageInfo = { name, version: VERSION, maturity }

export type { Maturity, PackageInfo }
export { NotImplementedError, notImplemented }
