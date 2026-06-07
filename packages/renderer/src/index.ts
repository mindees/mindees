import type { Maturity, PackageInfo } from '@mindees/core'
import { NotImplementedError, notImplemented } from '@mindees/core'

/** Host-backend contract + capability detection. */
export {
  type HostBackend,
  isSerializable,
  type SerializableBackend,
} from './backend'
/** Helix Canvas strand — a 2D scene graph driven by the reconciler, painted to a 2D context (§6.2). */
export {
  type Canvas2DBackend,
  createCanvas2DBackend,
  type Scene2DContext,
  type SceneNode,
} from './canvas'
/** DOM (web) backend. */
export {
  createDomBackend,
  type DomDocument,
  type DomElement,
  type DomNode,
  type DomText,
  domTagFor,
} from './dom'
/** Keyed list reconciliation (the renderer side of core's KeyedRegion). */
export { bindKeyedChild } from './for'
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
/** One-call native app entry — wires the command backend + host contract. */
export {
  type CreateNativeAppOptions,
  createNativeApp,
  type NativeApp,
} from './native-app'
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
/** Portal reconciliation (the renderer side of core's PortalRegion). */
export { bindPortalChild } from './portal'
/** The fine-grained reactive reconciler. */
export { type Mounted, mountNode, render } from './render'
/** Server-side rendering + hydration (web). */
export { hydrate, renderToString } from './ssr'

/** The npm package name. */
export const name = '@mindees/renderer'

/** The package version. All `@mindees/*` packages share one locked version line. */
export const VERSION = '0.14.0'

/**
 * Current maturity. The Helix **web/DOM** renderer (reconciler, DOM backend,
 * headless backend, SSR + hydration) is implemented and tested. Native
 * (iOS/Android) and the GPU canvas are research tracks (throw
 * `NotImplementedError`). See the repository `STATUS.md`.
 */
export const maturity: Maturity = 'experimental'

/**
 * Static identity + maturity metadata for this package. Frozen so the
 * self-reported identity tooling introspects cannot be mutated at runtime,
 * matching the `readonly` fields of {@link PackageInfo}.
 */
export const info: PackageInfo = Object.freeze({ name, version: VERSION, maturity })

export type { Maturity, PackageInfo }
export { NotImplementedError, notImplemented }
