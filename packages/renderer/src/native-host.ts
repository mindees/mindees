/**
 * A **strict reference native host** — the inverse of
 * {@link import('./native-command-backend').createNativeCommandBackend}.
 *
 * It consumes a {@link NativeCommand} stream and reconstructs an in-memory view
 * tree, **strictly validating** the stream as it goes: it throws
 * {@link NativeHostError} on any malformed sequence (unknown/duplicate id,
 * `removeChild` of a non-child, double `disposeNode`, out-of-range insert index,
 * …). This makes it the executable **conformance spec** for a native host: a real
 * iOS (SwiftUI/UIKit) or Android (Jetpack Compose/View) host implements exactly
 * these semantics but builds platform views instead of these model nodes.
 *
 * Piping the command backend's output through this host is a powerful end-to-end
 * check: it proves the backend never emits an invalid or leaking stream (a lenient
 * host would silently hide a double-free; this one fails loudly).
 *
 * This is **not** a renderer — it draws nothing. It is the host-side contract,
 * verifiable in Node, that the (toolchain-gated) compiled native hosts must satisfy.
 *
 * @module
 */

import type { NativeCommand, NativeNodeId, NativePropValue } from './native-protocol'

/** A reconstructed host node. */
export interface ReferenceHostNode {
  /** Stable id from the command stream. */
  readonly id: NativeNodeId
  /** `"root"` (the pre-existing container), `"element"`, or `"text"`. */
  readonly kind: 'root' | 'element' | 'text'
  /** Element tag (empty for text nodes). */
  tag: string
  /** Text content (text nodes). */
  text: string
  /** Applied props (elements). */
  props: Record<string, NativePropValue>
  /** Wired events: eventName → handlerId. */
  events: Map<string, string>
  /** Parent, or `null` when detached / the root. */
  parent: ReferenceHostNode | null
  /** Ordered children. */
  children: ReferenceHostNode[]
}

/** A reference host that applies a {@link NativeCommand} stream to a model tree. */
export interface ReferenceHost {
  /** Id of the root container. */
  readonly rootId: NativeNodeId
  /** The root node; its `children` mirror the rendered top-level nodes. */
  readonly root: ReferenceHostNode
  /** Apply a single command (throws {@link NativeHostError} on a malformed one). */
  apply(command: NativeCommand): void
  /** Apply a batch in order. */
  applyBatch(commands: readonly NativeCommand[]): void
  /** Look up a live node by id. */
  getNode(id: NativeNodeId): ReferenceHostNode | undefined
  /** Number of live (created, not yet disposed) nodes, excluding the root. */
  liveNodeCount(): number
  /** A compact structural string of the tree (tags + text; inspect props via {@link getNode}). */
  serialize(): string
}

/** Thrown when a command stream violates the host contract. */
export class NativeHostError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'NativeHostError'
  }
}

/**
 * Create a {@link ReferenceHost}. Wire it to a backend to validate + reconstruct:
 *
 * @example
 * const host = createReferenceHost()
 * const backend = createNativeCommandBackend({ rootId: host.rootId, onCommand: (c) => host.apply(c) })
 * render(MyComponent, {}, backend, backend.root)
 * host.serialize() // the reconstructed tree
 */
export function createReferenceHost(rootId: NativeNodeId = 'host-root'): ReferenceHost {
  const root: ReferenceHostNode = {
    id: rootId,
    kind: 'root',
    tag: 'root',
    text: '',
    props: {},
    events: new Map(),
    parent: null,
    children: [],
  }
  const nodes = new Map<NativeNodeId, ReferenceHostNode>([[rootId, root]])

  function requireNode(id: NativeNodeId): ReferenceHostNode {
    const node = nodes.get(id)
    if (!node) throw new NativeHostError(`command references unknown node ${String(id)}`)
    return node
  }

  function create(id: NativeNodeId, kind: 'element' | 'text', tag: string, text: string): void {
    if (nodes.has(id)) throw new NativeHostError(`duplicate node id ${String(id)}`)
    nodes.set(id, { id, kind, tag, text, props: {}, events: new Map(), parent: null, children: [] })
  }

  function detach(node: ReferenceHostNode): void {
    const parent = node.parent
    if (!parent) return
    const at = parent.children.indexOf(node)
    if (at >= 0) parent.children.splice(at, 1)
    node.parent = null
  }

  function apply(command: NativeCommand): void {
    switch (command.type) {
      case 'createNode':
        create(command.id, 'element', command.tag, '')
        break
      case 'createText':
        create(command.id, 'text', '', command.text)
        break
      case 'setProp':
        requireNode(command.id).props[command.name] = command.value
        break
      case 'removeProp':
        delete requireNode(command.id).props[command.name]
        break
      case 'updateText': {
        const node = requireNode(command.id)
        if (node.kind !== 'text') {
          throw new NativeHostError(`updateText on non-text node ${String(command.id)}`)
        }
        node.text = command.text
        break
      }
      case 'insertChild': {
        const parent = requireNode(command.parentId)
        const child = requireNode(command.childId)
        if (child.parent) {
          throw new NativeHostError(
            `insertChild: ${String(command.childId)} already has a parent (detach it first)`,
          )
        }
        if (command.index < 0 || command.index > parent.children.length) {
          throw new NativeHostError(`insertChild: index ${command.index} out of range`)
        }
        parent.children.splice(command.index, 0, child)
        child.parent = parent
        break
      }
      case 'removeChild': {
        const parent = requireNode(command.parentId)
        const child = requireNode(command.childId)
        if (child.parent !== parent) {
          throw new NativeHostError(
            `removeChild: ${String(command.childId)} is not a child of ${String(command.parentId)}`,
          )
        }
        detach(child)
        break
      }
      case 'disposeNode': {
        if (command.id === rootId) throw new NativeHostError('cannot dispose the root node')
        const node = requireNode(command.id) // throws if already freed → catches double dispose
        detach(node) // interior subtree nodes are freed without an explicit removeChild
        nodes.delete(command.id)
        break
      }
      case 'registerEvent':
        requireNode(command.id).events.set(command.eventName, command.handlerId)
        break
      case 'unregisterEvent':
        requireNode(command.id).events.delete(command.eventName)
        break
      default: {
        // Exhaustiveness: every NativeCommand variant is handled above.
        const _exhaustive: never = command
        throw new NativeHostError(`unknown command ${JSON.stringify(_exhaustive)}`)
      }
    }
  }

  function serializeNode(node: ReferenceHostNode): string {
    if (node.kind === 'text') return node.text
    const inner = node.children.map(serializeNode).join('')
    return `<${node.tag}>${inner}</${node.tag}>`
  }

  return {
    rootId,
    root,
    apply,
    applyBatch(commands) {
      for (const command of commands) apply(command)
    },
    getNode: (id) => nodes.get(id),
    liveNodeCount: () => nodes.size - 1,
    serialize: () => root.children.map(serializeNode).join(''),
  }
}
