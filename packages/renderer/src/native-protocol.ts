/**
 * The **native command protocol** — a small, strongly-typed, *serializable*
 * description of how to build and mutate a native view tree.
 *
 * The Helix reconciler ({@link import('./render').render}) drives a
 * {@link import('./backend').HostBackend}; the
 * {@link import('./native-command-backend').NativeCommandBackend} implements that
 * contract by emitting a stream of {@link NativeCommand}s instead of touching the
 * DOM. A native host (UIKit on iOS, Android View on Android, or another future
 * surface) consumes the stream and materializes real views.
 *
 * The protocol is deliberately platform-neutral and JSON-serializable: it carries
 * **no functions**. Event handlers are represented as stable handler-id
 * *registrations* ({@link RegisterEventCommand}); the host invokes a handler by
 * id (see {@link import('./native-command-backend').NativeCommandBackend.dispatchEvent}),
 * so a closure never has to cross a serialization boundary.
 *
 * This is the Phase 8A foundation for native rendering. It is **not** itself an
 * iOS/Android renderer — it is the wire format a real host backend will speak.
 *
 * @module
 */

/** Identifier for a native node. Stable for the node's lifetime. */
export type NativeNodeId = string | number

/**
 * A value that may be sent as a native prop. Strictly serializable: primitives,
 * `null`, and (recursively) arrays/plain-objects of the same. Notably **not**
 * functions, `undefined`, symbols, bigints, or non-finite numbers — those cannot
 * cross the protocol boundary safely. Event handlers are modeled separately
 * (see {@link RegisterEventCommand}).
 */
export type NativePropValue =
  | string
  | number
  | boolean
  | null
  | readonly NativePropValue[]
  | { readonly [key: string]: NativePropValue }

/** Create an element node with a tag (e.g. `"view"`, `"text"`, `"button"`). */
export interface CreateNodeCommand {
  readonly type: 'createNode'
  readonly id: NativeNodeId
  readonly tag: string
}

/** Create a text node holding `text`. */
export interface CreateTextCommand {
  readonly type: 'createText'
  readonly id: NativeNodeId
  readonly text: string
}

/** Set (or replace) a serializable prop on a node. */
export interface SetPropCommand {
  readonly type: 'setProp'
  readonly id: NativeNodeId
  readonly name: string
  readonly value: NativePropValue
}

/** Remove a previously-set prop from a node. */
export interface RemovePropCommand {
  readonly type: 'removeProp'
  readonly id: NativeNodeId
  readonly name: string
}

/** Insert `childId` into `parentId` at `index` (0-based, among current children). */
export interface InsertChildCommand {
  readonly type: 'insertChild'
  readonly parentId: NativeNodeId
  readonly childId: NativeNodeId
  readonly index: number
}

/** Detach `childId` from `parentId` (does not free the node — see {@link DisposeNodeCommand}). */
export interface RemoveChildCommand {
  readonly type: 'removeChild'
  readonly parentId: NativeNodeId
  readonly childId: NativeNodeId
}

/** Update a text node's content. */
export interface UpdateTextCommand {
  readonly type: 'updateText'
  readonly id: NativeNodeId
  readonly text: string
}

/**
 * Free a node's host resources. When a subtree is removed, exactly one
 * {@link RemoveChildCommand} detaches the subtree's **root**, then a `disposeNode`
 * is emitted for the root **and every descendant** (deepest-first). Interior nodes
 * are not individually detached — they are freed in the same batch as their parent
 * — so a host should treat `disposeNode` as "free this node (and remove it from any
 * parent it still holds)". No surviving node ever references a freed one.
 */
export interface DisposeNodeCommand {
  readonly type: 'disposeNode'
  readonly id: NativeNodeId
}

/**
 * Register an event handler on a node under a stable `handlerId`. The host should
 * call back into the runtime (`dispatchEvent(handlerId, event)`) when the native
 * event fires. The handler function itself never crosses the protocol.
 */
export interface RegisterEventCommand {
  readonly type: 'registerEvent'
  readonly id: NativeNodeId
  /** Normalized event name, e.g. `"press"` for an `onPress` prop. */
  readonly eventName: string
  /** Stable id the host echoes back to invoke the handler. */
  readonly handlerId: string
}

/** Remove a previously-registered event handler. */
export interface UnregisterEventCommand {
  readonly type: 'unregisterEvent'
  readonly id: NativeNodeId
  readonly eventName: string
  readonly handlerId: string
}

/** A single instruction in the native command stream. */
export type NativeCommand =
  | CreateNodeCommand
  | CreateTextCommand
  | SetPropCommand
  | RemovePropCommand
  | InsertChildCommand
  | RemoveChildCommand
  | UpdateTextCommand
  | DisposeNodeCommand
  | RegisterEventCommand
  | UnregisterEventCommand

const COMMAND_TYPES = new Set<NativeCommand['type']>([
  'createNode',
  'createText',
  'setProp',
  'removeProp',
  'insertChild',
  'removeChild',
  'updateText',
  'disposeNode',
  'registerEvent',
  'unregisterEvent',
])

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isPlainObject(value: object): boolean {
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

function isId(value: unknown): value is NativeNodeId {
  // Reject NaN/Infinity: they don't round-trip through JSON (→ null), which would
  // corrupt the most identity-critical field on the wire.
  return typeof value === 'string' || (typeof value === 'number' && Number.isFinite(value))
}

/**
 * Type guard: is `value` a valid {@link NativePropValue}? Rejects functions,
 * `undefined`, symbols, bigints, non-finite numbers, and non-plain objects
 * (recursively).
 */
export function isNativePropValue(value: unknown): value is NativePropValue {
  return isPropValue(value, new WeakSet())
}

function isPropValue(value: unknown, seen: WeakSet<object>): boolean {
  switch (typeof value) {
    case 'string':
    case 'boolean':
      return true
    case 'number':
      return Number.isFinite(value)
    case 'object': {
      if (value === null) return true
      if (seen.has(value)) return false // a cycle is not serializable
      seen.add(value)
      try {
        // for…of yields `undefined` for array holes, so sparse arrays are rejected
        // (matching normalizeNativeProp — the two stay a consistent accept/coerce pair).
        if (Array.isArray(value)) {
          for (const item of value) if (!isPropValue(item, seen)) return false
          return true
        }
        if (isPlainObject(value)) {
          for (const v of Object.values(value)) if (!isPropValue(v, seen)) return false
          return true
        }
        return false
      } finally {
        seen.delete(value) // shared (diamond) references are fine — only true cycles fail
      }
    }
    default:
      return false
  }
}

/**
 * Coerce `value` to a {@link NativePropValue}, or `undefined` if it cannot be
 * represented (signalling the prop should be removed rather than set).
 *
 * - Primitives/`null` pass through (non-finite numbers are rejected).
 * - Arrays are rejected wholesale if **any** element is unrepresentable (so
 *   element indices are never silently shifted).
 * - Plain objects keep only their representable entries (an unrepresentable value
 *   drops that key); non-plain objects (Date, Map, class instances, …) are rejected.
 */
export function normalizeNativeProp(value: unknown): NativePropValue | undefined {
  return normalizeProp(value, new WeakSet())
}

function normalizeProp(value: unknown, seen: WeakSet<object>): NativePropValue | undefined {
  switch (typeof value) {
    case 'string':
    case 'boolean':
      return value
    case 'number':
      return Number.isFinite(value) ? value : undefined
    case 'object': {
      if (value === null) return null
      if (seen.has(value)) return undefined // a cycle can't be represented — drop it
      seen.add(value)
      try {
        if (Array.isArray(value)) {
          const out: NativePropValue[] = []
          for (const item of value) {
            const n = normalizeProp(item, seen)
            if (n === undefined) return undefined
            out.push(n)
          }
          return out
        }
        if (isPlainObject(value)) {
          // Null-prototype accumulator so an own `__proto__` key (e.g. from
          // JSON.parse) becomes a real data key instead of mutating the prototype.
          const out: Record<string, NativePropValue> = Object.create(null)
          for (const [k, v] of Object.entries(value)) {
            const n = normalizeProp(v, seen)
            if (n !== undefined) out[k] = n
          }
          return out
        }
        return undefined
      } finally {
        seen.delete(value)
      }
    }
    default:
      return undefined
  }
}

/** Type guard: is `value` a well-formed {@link NativeCommand}? */
export function isNativeCommand(value: unknown): value is NativeCommand {
  if (!isObject(value)) return false
  const type = value.type
  if (typeof type !== 'string' || !COMMAND_TYPES.has(type as NativeCommand['type'])) return false
  switch (type as NativeCommand['type']) {
    case 'createNode':
      return isId(value.id) && typeof value.tag === 'string'
    case 'createText':
    case 'updateText':
      return isId(value.id) && typeof value.text === 'string'
    case 'setProp':
      return isId(value.id) && typeof value.name === 'string' && isNativePropValue(value.value)
    case 'removeProp':
      return isId(value.id) && typeof value.name === 'string'
    case 'insertChild':
      return (
        isId(value.parentId) &&
        isId(value.childId) &&
        typeof value.index === 'number' &&
        Number.isInteger(value.index) &&
        value.index >= 0
      )
    case 'removeChild':
      return isId(value.parentId) && isId(value.childId)
    case 'disposeNode':
      return isId(value.id)
    case 'registerEvent':
    case 'unregisterEvent':
      return (
        isId(value.id) && typeof value.eventName === 'string' && typeof value.handlerId === 'string'
      )
    default:
      return false
  }
}

/**
 * Create a generator of unique node ids. Each call returns the next id as
 * `` `${prefix}${n}` `` with a monotonically increasing `n`. Pass a distinct
 * `prefix` per backend instance so ids from different backends never collide.
 */
export function createNativeNodeIdFactory(prefix = 'n'): () => string {
  let n = 0
  return () => `${prefix}${++n}`
}
