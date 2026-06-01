import type { Maturity, PackageInfo } from './types'

/**
 * Component model: a renderer-agnostic element tree plus selector-based,
 * re-render-isolated context. (Phase 2)
 */
export {
  type Component,
  type Context,
  type ContextProvider,
  createContext,
  createElement,
  createProvider,
  ELEMENT_TYPE,
  type ElementType,
  Fragment,
  hasOwner,
  isElement,
  type MindeesElement,
  type MindeesNode,
  renderComponent,
  type SelectorEquals,
} from './component'
export { NotImplementedError } from './errors'
export { notImplemented } from './not-implemented'
/**
 * Fine-grained reactivity: signals, computed values, effects, batching, and
 * disposal scopes. This is the reactive core of MindeesNative.
 */
export {
  type Accessor,
  batch,
  type ComputedOptions,
  computed,
  createRoot,
  type EqualsFn,
  effect,
  getOwner,
  type Memo,
  memo,
  type Owner,
  onCleanup,
  runWithOwner,
  type Signal,
  type SignalOptions,
  signal,
  untrack,
} from './reactive'
/**
 * Priority scheduler: two-lane (sync/normal), microtask-batched, with
 * cancellable and dedupable tasks. (Phase 2)
 */
export {
  createScheduler,
  type Priority,
  type ScheduledTask,
  type ScheduleOptions,
  Scheduler,
  type SchedulerOptions,
  type Task,
} from './scheduler'
/**
 * Threading abstraction: a {@link ThreadPool} contract with a working Web Worker
 * backend and an inline fallback. Native multi-threading is a research track. (Phase 2)
 */
export {
  createInlineThreadPool,
  createNativeThreadPool,
  createWorkerPool,
  type ThreadPool,
  type WorkerLike,
  type WorkerPoolOptions,
} from './threading'
export type { Maturity, PackageInfo } from './types'

/** The npm package name. */
export const name = '@mindees/core'

/** The package version. All `@mindees/*` packages share one locked version line. */
export const VERSION = '0.0.0'

/**
 * Current maturity of this package. See the repository `STATUS.md`.
 *
 * The reactivity layer (signals/computed/effect) is implemented and tested;
 * the component model and scheduler arrive in Phase 2.
 */
export const maturity: Maturity = 'experimental'

/** Static identity + maturity metadata for this package. */
export const info: PackageInfo = { name, version: VERSION, maturity }
