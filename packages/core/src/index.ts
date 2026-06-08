import type { Maturity, PackageInfo } from './types'

/**
 * Animation engine: reactive animated values + timing/spring drivers + interpolate, driven by an
 * injected frame source (RN Animated/Reanimated + Flutter AnimationController parity).
 */
export {
  _activeAnimationCount,
  _resetAnimation,
  type AnimatedValue,
  type AnimationHandle,
  animate,
  cubicBezier,
  type Easing,
  easeInOutQuad,
  easeInQuad,
  easeOutCubic,
  easeOutQuad,
  type FrameSource,
  getFrameSource,
  interpolate,
  linear,
  manualFrameSource,
  rafFrameSource,
  setFrameSource,
  spring,
  timing,
} from './animation'
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
  isKeyedRegion,
  isPortal,
  KEYED_REGION,
  type KeyedRegion,
  type KeyedRegionOptions,
  keyedRegion,
  type MindeesElement,
  type MindeesNode,
  PORTAL,
  type PortalRegion,
  portal,
  renderComponent,
  type SelectorEquals,
} from './component'
export { NotImplementedError } from './errors'
/**
 * Gesture recognizers: tap/longPress/pan/pinch/swipe → reactive state that drives styles and the
 * animation engine (RN Gesture Handler / Flutter GestureDetector parity).
 */
export {
  _setGestureClock,
  composeGestures,
  type GestureHandlers,
  longPress,
  normalizePointer,
  type PanEvent,
  type PanState,
  type PinchEvent,
  type PinchState,
  type PointerSample,
  pan,
  panAnimated,
  pinch,
  type Recognizer,
  type SwipeDirection,
  type SwipeEvent,
  swipe,
  type TapState,
  tap,
} from './gesture'
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
  deferred,
  type EffectOptions,
  type EqualsFn,
  effect,
  getOwner,
  type Memo,
  memo,
  type Owner,
  on,
  onCleanup,
  runWithOwner,
  type Signal,
  type SignalOptions,
  setReactiveScheduler,
  signal,
  startTransition,
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
export const VERSION = '0.26.0'

/**
 * Current maturity of this package. See the repository `STATUS.md`.
 *
 * The reactivity layer (signals/computed/effect/batch), the component model with
 * selector-isolated context, the priority scheduler, and the thread-pool
 * abstraction (Web Worker + inline) are all implemented and tested. Native
 * multi-threading remains a research track (throws `NotImplementedError`).
 */
export const maturity: Maturity = 'experimental'

/**
 * Static identity + maturity metadata for this package. Frozen so the
 * self-reported identity tooling introspects cannot be mutated at runtime,
 * matching the `readonly` fields of {@link PackageInfo}.
 */
export const info: PackageInfo = Object.freeze({ name, version: VERSION, maturity })
