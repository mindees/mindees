import type { Maturity, PackageInfo } from './types'

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
