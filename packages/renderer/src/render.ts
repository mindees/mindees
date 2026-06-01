/**
 * Helix reconciler — turns a MindeesNative element tree into host nodes via a
 * {@link HostBackend}, with **fine-grained reactive bindings**.
 *
 * There is no virtual-DOM diff. Instead:
 * - A dynamic prop (a function value) becomes an `effect` that patches exactly
 *   that one attribute when its signals change.
 * - A dynamic child (a function returning nodes) becomes an `effect` that
 *   replaces exactly that region of the host tree.
 * - Everything created during render is owned by a reactive scope, so unmounting
 *   disposes every binding — no leaks.
 *
 * This is the Phase 1/2 reactivity paying off: updates are O(what-changed), not
 * O(tree).
 *
 * @module
 */

import {
  type Component,
  createRoot,
  ELEMENT_TYPE,
  effect,
  type MindeesElement,
  type MindeesNode,
  untrack,
} from '@mindees/core'
import type { HostBackend } from './backend'

/** A dynamic value: pass a function and the binding reacts to its signals. */
type MaybeReactive<T> = T | (() => T)

function isElementLike(value: unknown): value is MindeesElement {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { $$typeof?: unknown }).$$typeof === ELEMENT_TYPE
  )
}

function isEventProp(key: string): boolean {
  return (
    key.length > 2 && key[0] === 'o' && key[1] === 'n' && key[2] === (key[2] ?? '').toUpperCase()
  )
}

/** A mounted subtree: its host nodes plus a disposer that unmounts + cleans up. */
export interface Mounted<N> {
  /** The top-level host nodes produced (a fragment can yield several). */
  readonly nodes: N[]
  /** Unmount: remove host nodes and dispose all reactive bindings. */
  dispose(): void
}

/**
 * Render `node` into `container` using `backend`. Returns a {@link Mounted}
 * handle whose `dispose()` removes the produced nodes and tears down every
 * reactive binding created during the render.
 *
 * @example
 * const backend = createHeadlessBackend()
 * const root = createHeadlessRoot()
 * const app = render(MyComponent, {}, backend, root) // component form
 * const m = render(element, backend, root)           // element form
 * m.dispose()
 */
export function render<N>(node: MindeesNode, backend: HostBackend<N>, container: N): Mounted<N>
export function render<N, P>(
  component: Component<P>,
  props: P,
  backend: HostBackend<N>,
  container: N,
): Mounted<N>
export function render<N, P>(
  a: MindeesNode | Component<P>,
  b: HostBackend<N> | P,
  c?: HostBackend<N> | N,
  d?: N,
): Mounted<N> {
  // Disambiguate by ARITY, not `typeof a`: `MindeesNode` now includes the
  // accessor form `() => MindeesNode`, so a function `a` may be either a
  // component (4-arg form) or a reactive node (3-arg form). The component form
  // is the only one with a 4th argument (`container = d`).
  const isComponentForm = d !== undefined
  const backend = (isComponentForm ? c : b) as HostBackend<N>
  const container = (isComponentForm ? d : c) as N

  let nodes: N[] = []
  const dispose = createRoot((dispose) => {
    // Evaluate the component INSIDE the root scope so its effects/memos are
    // owned here and disposed with us. A non-component node is mounted as-is
    // (an accessor node becomes a reactive region during mount).
    const node: MindeesNode = isComponentForm ? (a as Component<P>)(b as P) : (a as MindeesNode)
    nodes = mountNode(node, backend, container, null)
    return dispose
  })

  return {
    nodes,
    dispose() {
      for (const n of nodes) {
        const parent = backend.parentOf(n)
        if (parent) backend.remove(parent, n)
      }
      dispose()
    },
  }
}

/**
 * Mount a node into `parent` before `anchor`. Returns the top-level host nodes
 * created (for fragments / arrays this can be more than one).
 */
function mountNode<N>(
  node: MindeesNode,
  backend: HostBackend<N>,
  parent: N,
  anchor: N | null,
): N[] {
  // Null-ish / boolean → nothing.
  if (node === null || node === undefined || typeof node === 'boolean') return []

  // Function node → a reactive region (an accessor `() => MindeesNode`). Handled
  // uniformly here so it works at the top level and as a child.
  if (typeof node === 'function') {
    return bindReactiveChild(node as () => MindeesNode, backend, parent, anchor)
  }

  // Text-like primitives.
  if (typeof node === 'string' || typeof node === 'number') {
    const text = backend.createText(String(node))
    backend.insert(parent, text, anchor)
    return [text]
  }

  // Arrays / fragments → mount each child in order.
  if (Array.isArray(node)) {
    const out: N[] = []
    for (const child of node) out.push(...mountNode(child, backend, parent, anchor))
    return out
  }

  if (isElementLike(node)) {
    const { type } = node
    // Function component: invoked directly. We are already inside render()'s
    // createRoot owner scope, so any effects/memos the component creates are
    // owned here and disposed on unmount. `children` is passed through props.
    if (typeof type === 'function') {
      const component = type as Component<Record<string, unknown>>
      const rendered = component({ ...node.props, children: node.children })
      return mountNode(rendered, backend, parent, anchor)
    }

    // Host element.
    const el = backend.createElement(type)
    for (const [key, value] of Object.entries(node.props)) {
      bindProp(backend, el, key, value)
    }
    mountChildren(node.children, backend, el)
    backend.insert(parent, el, anchor)
    return [el]
  }

  return []
}

/** Mount a list of children into `parent`, appending in order. */
function mountChildren<N>(
  children: readonly MindeesNode[],
  backend: HostBackend<N>,
  parent: N,
): void {
  // mountNode handles every node kind uniformly, including function children
  // (reactive regions) via the function-node branch.
  for (const child of children) {
    mountNode(child, backend, parent, null)
  }
}

/**
 * Apply a prop. A function value is a **reactive binding**: an effect re-applies
 * exactly this attribute when its dependencies change. Event props (`onX`) are
 * applied once (the handler itself can close over signals).
 */
function bindProp<N>(backend: HostBackend<N>, el: N, key: string, value: unknown): void {
  if (key === 'children') return
  if (isEventProp(key)) {
    backend.setProp(el, key, value, undefined)
    return
  }
  if (typeof value === 'function') {
    let prev: unknown
    effect(() => {
      const next = (value as () => unknown)()
      backend.setProp(el, key, next, prev)
      prev = next
    })
    return
  }
  backend.setProp(el, key, value, undefined)
}

/**
 * Bind a reactive child region: an effect that, when the accessor changes,
 * unmounts the previous nodes and mounts the new ones at the same position. A
 * stable text-only fast path patches the text node in place.
 *
 * The effect runs synchronously on creation, so `current` is populated before
 * we return it — letting the caller report the region's initial host nodes.
 */
function bindReactiveChild<N>(
  accessor: () => MindeesNode,
  backend: HostBackend<N>,
  parent: N,
  initialAnchor: N | null,
): N[] {
  let current: N[] = []
  let first = true
  effect(() => {
    const value = accessor()
    untrack(() => {
      // Fast path: single existing text node + new text-like value → patch.
      if (
        current.length === 1 &&
        current[0] !== undefined &&
        backend.isText(current[0]) &&
        (typeof value === 'string' || typeof value === 'number')
      ) {
        backend.setText(current[0], String(value))
        return
      }
      // First run uses the caller's anchor; later runs reuse the region's slot.
      const anchor = first
        ? initialAnchor
        : current.length > 0
          ? nextSiblingAfter(backend, current)
          : initialAnchor
      for (const n of current) backend.remove(parent, n)
      current = mountNode(value, backend, parent, anchor)
      first = false
    })
  })
  return current
}

/** The sibling immediately after the last node of `group` (insertion anchor). */
function nextSiblingAfter<N>(backend: HostBackend<N>, group: N[]): N | null {
  const last = group[group.length - 1]
  return last !== undefined ? backend.nextSibling(last) : null
}

export type { MaybeReactive }
