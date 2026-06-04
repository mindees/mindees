/**
 * The **native command backend** — a {@link HostBackend} that, instead of
 * mutating a DOM, records a stream of {@link NativeCommand}s describing how to
 * build and update a native view tree.
 *
 * This is the bridge between Helix (the reconciler + fine-grained reactivity) and
 * a native host: render an app against this backend and you get a deterministic,
 * serializable command stream a UIKit or Android View host can replay. It depends
 * only on `@mindees/core` reactivity
 * (via the reconciler) — no DOM, no browser globals — so it runs in Node tests.
 *
 * It is **not** an end-to-end native app bridge. It produces the protocol that the
 * verified host projects in `examples/native-hosts/` replay/render in CI; the direct
 * runtime backend and embedded JS engine remain research tracks
 * ({@link createNativeBackend}).
 *
 * @module
 */

import type { HostBackend } from './backend'
import { isEventProp } from './headless'
import {
  createNativeNodeIdFactory,
  type NativeCommand,
  type NativeNodeId,
  normalizeNativeProp,
} from './native-protocol'

/**
 * An opaque native host node. The reconciler treats it as a handle; the backend
 * tracks structure (parent/children) on it to translate the {@link HostBackend}
 * tree operations into index-based {@link NativeCommand}s.
 */
export interface NativeCommandNode {
  /** Stable id, shared with the host via the command stream. */
  readonly id: NativeNodeId
  /** `"element"` or `"text"`. */
  kind: 'element' | 'text'
  /** Element tag (empty for text nodes). */
  tag: string
  /** Text content (text nodes). */
  text: string
  /** Parent node, or `null` when detached / the root. */
  parent: NativeCommandNode | null
  /** Ordered child nodes. */
  children: NativeCommandNode[]
}

/** Options for {@link createNativeCommandBackend}. */
export interface NativeCommandBackendOptions {
  /** Id of the host's pre-existing root container. Defaults to a per-instance id. */
  rootId?: NativeNodeId
  /**
   * Custom node-id generator. Must return **unique, finite** ids (a non-finite
   * number is rejected at the boundary). Defaults to a collision-free per-instance
   * factory; uniqueness of a custom factory is the caller's responsibility.
   */
  idFactory?: () => NativeNodeId
  /** Called synchronously for every emitted command. */
  onCommand?: (command: NativeCommand) => void
  /** Called by {@link NativeCommandBackend.flushCommands} with the flushed batch. */
  onBatch?: (commands: readonly NativeCommand[]) => void
}

/** A {@link HostBackend} that emits a {@link NativeCommand} stream. */
export interface NativeCommandBackend<N> extends HostBackend<N> {
  /** Discriminator for backend kind. */
  readonly kind: 'native-command'
  /** Id of the host root container (the `parentId` of top-level inserts). */
  readonly rootId: NativeNodeId
  /** The root node to pass as the `container` to `render()`. */
  readonly root: N
  /** A readonly snapshot of all commands buffered since the last flush/clear. */
  getCommands(): readonly NativeCommand[]
  /** Return the buffered commands as a batch, fire `onBatch`, and clear the buffer. */
  flushCommands(): readonly NativeCommand[]
  /** Drop all buffered commands without firing `onBatch`. */
  clearCommands(): void
  /**
   * Invoke a registered event handler by id (what a host calls when a native
   * event fires). Returns `true` if a handler was found and called.
   */
  dispatchEvent(handlerId: string, event?: unknown): boolean
}

/**
 * Private, monotonic instance counter used only to give each backend a distinct
 * id prefix so default node ids never collide across instances. Not observable
 * outside the module; callers that want stable ids pass their own `idFactory`.
 */
let backendInstanceSeq = 0

/** `onPress` → `press`, `onPointerDown` → `pointerdown`. */
function eventNameFor(key: string): string {
  return key.slice(2).toLowerCase()
}

/**
 * Enforce the protocol's id invariant at the backend boundary: a non-finite number
 * id would silently corrupt to `null` through JSON and break node identity on the
 * wire. Throws on misuse (e.g. a custom `idFactory`/`rootId` yielding `NaN`).
 */
function validateNodeId(id: NativeNodeId): NativeNodeId {
  if (typeof id === 'number' && !Number.isFinite(id)) {
    throw new TypeError(`native node id must be a string or finite number, received ${String(id)}`)
  }
  return id
}

/**
 * Create a {@link NativeCommandBackend}. Render against it to capture the native
 * command stream:
 *
 * @example
 * const backend = createNativeCommandBackend()
 * const app = render(MyComponent, {}, backend, backend.root)
 * const commands = backend.flushCommands() // replay these on a native host
 */
export function createNativeCommandBackend(
  options: NativeCommandBackendOptions = {},
): NativeCommandBackend<NativeCommandNode> {
  const prefix = `b${backendInstanceSeq++}`
  const rawNextId = options.idFactory ?? createNativeNodeIdFactory(`${prefix}n`)
  // Validate every id at the boundary. Uniqueness is the idFactory's contract (the
  // default factory guarantees it); we deliberately don't track every id forever to
  // detect duplicates, which would leak memory in the long-running apps this targets.
  const nextId = (): NativeNodeId => validateNodeId(rawNextId())
  const nextHandlerId = createNativeNodeIdFactory(`${prefix}h`)
  const rootId = validateNodeId(options.rootId ?? `${prefix}root`)

  const root: NativeCommandNode = {
    id: rootId,
    kind: 'element',
    tag: 'root',
    text: '',
    parent: null,
    children: [],
  }

  const pending: NativeCommand[] = []
  /** handlerId → handler function. The function never enters the command stream. */
  const handlers = new Map<string, (event?: unknown) => void>()
  /** node → (eventName → handlerId), so we can unregister on change/dispose. */
  const nodeEvents = new WeakMap<NativeCommandNode, Map<string, string>>()

  function emit(command: NativeCommand): void {
    pending.push(command)
    options.onCommand?.(command)
  }

  function applyEvent(node: NativeCommandNode, eventName: string, value: unknown): void {
    let events = nodeEvents.get(node)
    const existing = events?.get(eventName)
    if (existing !== undefined) {
      handlers.delete(existing)
      events?.delete(eventName)
      emit({ type: 'unregisterEvent', id: node.id, eventName, handlerId: existing })
    }
    if (typeof value === 'function') {
      const handlerId = nextHandlerId()
      handlers.set(handlerId, value as (event?: unknown) => void)
      if (!events) {
        events = new Map()
        nodeEvents.set(node, events)
      }
      events.set(eventName, handlerId)
      emit({ type: 'registerEvent', id: node.id, eventName, handlerId })
    }
  }

  /** Tear down a removed subtree: unregister its events, dispose deepest-first. */
  function disposeSubtree(node: NativeCommandNode): void {
    for (const child of node.children) disposeSubtree(child)
    const events = nodeEvents.get(node)
    if (events) {
      for (const [eventName, handlerId] of events) {
        handlers.delete(handlerId)
        emit({ type: 'unregisterEvent', id: node.id, eventName, handlerId })
      }
      nodeEvents.delete(node)
    }
    emit({ type: 'disposeNode', id: node.id })
    // Detach every disposed node so parentOf() reports it removed. The reconciler's
    // region cleanup re-checks parentOf before removing (render.ts bindReactiveChild),
    // so without this a descendant whose parent pointer still pointed at the (already
    // removed) parent would be removed + disposed a SECOND time — a host double-free.
    node.parent = null
    node.children = []
  }

  return {
    kind: 'native-command',
    rootId,
    root,

    createElement(type: string): NativeCommandNode {
      const node: NativeCommandNode = {
        id: nextId(),
        kind: 'element',
        tag: type,
        text: '',
        parent: null,
        children: [],
      }
      emit({ type: 'createNode', id: node.id, tag: type })
      return node
    },

    createText(value: string): NativeCommandNode {
      const node: NativeCommandNode = {
        id: nextId(),
        kind: 'text',
        tag: '',
        text: value,
        parent: null,
        children: [],
      }
      emit({ type: 'createText', id: node.id, text: value })
      return node
    },

    setProp(node: NativeCommandNode, key: string, value: unknown, prev: unknown): void {
      if (isEventProp(key)) {
        applyEvent(node, eventNameFor(key), value)
        return
      }
      const normalized = normalizeNativeProp(value)
      if (normalized === undefined) {
        // Only emit a removal if there was actually a representable value before.
        if (normalizeNativeProp(prev) !== undefined) {
          emit({ type: 'removeProp', id: node.id, name: key })
        }
        return
      }
      emit({ type: 'setProp', id: node.id, name: key, value: normalized })
    },

    setText(node: NativeCommandNode, value: string): void {
      node.text = value
      emit({ type: 'updateText', id: node.id, text: value })
    },

    insert(
      parent: NativeCommandNode,
      node: NativeCommandNode,
      anchor: NativeCommandNode | null,
    ): void {
      // A move: detach from the old parent first so indices stay correct.
      if (node.parent) {
        const old = node.parent
        const oldIndex = old.children.indexOf(node)
        if (oldIndex >= 0) old.children.splice(oldIndex, 1)
        emit({ type: 'removeChild', parentId: old.id, childId: node.id })
      }
      let index: number
      if (anchor === null) {
        index = parent.children.length
        parent.children.push(node)
      } else {
        const at = parent.children.indexOf(anchor)
        index = at < 0 ? parent.children.length : at
        parent.children.splice(index, 0, node)
      }
      node.parent = parent
      emit({ type: 'insertChild', parentId: parent.id, childId: node.id, index })
    },

    remove(parent: NativeCommandNode, node: NativeCommandNode): void {
      const at = parent.children.indexOf(node)
      if (at >= 0) parent.children.splice(at, 1)
      node.parent = null
      emit({ type: 'removeChild', parentId: parent.id, childId: node.id })
      // The reconciler discards removed nodes, so free the whole subtree + handlers.
      disposeSubtree(node)
    },

    parentOf(node: NativeCommandNode): NativeCommandNode | null {
      return node.parent
    },

    nextSibling(node: NativeCommandNode): NativeCommandNode | null {
      const parent = node.parent
      if (!parent) return null
      const at = parent.children.indexOf(node)
      return at >= 0 && at + 1 < parent.children.length ? (parent.children[at + 1] ?? null) : null
    },

    isText(node: NativeCommandNode): boolean {
      return node.kind === 'text'
    },

    getCommands(): readonly NativeCommand[] {
      return pending.slice()
    },

    flushCommands(): readonly NativeCommand[] {
      const batch = pending.slice()
      pending.length = 0
      options.onBatch?.(batch)
      return batch
    },

    clearCommands(): void {
      pending.length = 0
    },

    dispatchEvent(handlerId: string, event?: unknown): boolean {
      const handler = handlers.get(handlerId)
      if (!handler) return false
      handler(event)
      return true
    },
  }
}
