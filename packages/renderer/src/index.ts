import type { Maturity, PackageInfo } from '@mindees/core'
import { NotImplementedError, notImplemented } from '@mindees/core'

/** Host-backend contract + capability detection. */
export {
  type HostBackend,
  isSerializable,
  type SerializableBackend,
} from './backend'
/** DOM (web) backend. */
export {
  createDomBackend,
  type DomDocument,
  type DomElement,
  type DomNode,
  type DomText,
  domTagFor,
} from './dom'
/** Headless (in-memory) backend — the reference/test target. */
export {
  createHeadlessBackend,
  createHeadlessRoot,
  type HeadlessNode,
  isEventProp,
} from './headless'
/**
 * Native backends. `createNativeCommandBackend` is implemented (emits a native
 * command stream); `createNativeBackend`/`createCanvasBackend` are research
 * tracks that throw `NotImplementedError`.
 */
export {
  type CanvasBackend,
  createCanvasBackend,
  createNativeBackend,
  createNativeCommandBackend,
  type NativeBackend,
  type NativeCommandBackend,
  type NativeCommandBackendOptions,
  type NativeCommandNode,
} from './native'
/**
 * The strict reference native host — applies a command stream to a model tree and
 * validates it (the executable conformance contract real native hosts implement).
 */
export {
  createReferenceHost,
  NativeHostError,
  type ReferenceHost,
  type ReferenceHostNode,
} from './native-host'
/** The native command protocol: command types + serialization-safe helpers. */
export {
  type CreateNodeCommand,
  type CreateTextCommand,
  createNativeNodeIdFactory,
  type DisposeNodeCommand,
  type InsertChildCommand,
  isNativeCommand,
  isNativePropValue,
  type NativeCommand,
  type NativeNodeId,
  type NativePropValue,
  normalizeNativeProp,
  type RegisterEventCommand,
  type RemoveChildCommand,
  type RemovePropCommand,
  type SetPropCommand,
  type UnregisterEventCommand,
  type UpdateTextCommand,
} from './native-protocol'
/** The fine-grained reactive reconciler. */
export { type Mounted, render } from './render'
/** Server-side rendering + hydration (web). */
export { hydrate, renderToString } from './ssr'

/** The npm package name. */
export const name = '@mindees/renderer'

/** The package version. All `@mindees/*` packages share one locked version line. */
export const VERSION = '0.0.0'

/**
 * Current maturity. The Helix **web/DOM** renderer (reconciler, DOM backend,
 * headless backend, SSR + hydration) is implemented and tested. Native
 * (iOS/Android) and the GPU canvas are research tracks (throw
 * `NotImplementedError`). See the repository `STATUS.md`.
 */
export const maturity: Maturity = 'experimental'

/** Static identity + maturity metadata for this package. */
export const info: PackageInfo = { name, version: VERSION, maturity }

export type { Maturity, PackageInfo }
export { NotImplementedError, notImplemented }
