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
  // Disambiguate the two overloads.
  let node: MindeesNode
  let backend: HostBackend<N>
  let container: N
  if (typeof a === 'function') {
    node = (a as Component<P>)(b as P)
    backend = c as HostBackend<N>
    container = d as N
  } else {
    node = a
    backend = b as HostBackend<N>
    container = c as N
  }

  let nodes: N[] = []
  const dispose = createRoot((dispose) => {
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
  for (const child of children) {
    // A function child is a reactive region.
    if (typeof child === 'function') {
      bindReactiveChild(child as () => MindeesNode, backend, parent)
    } else {
      mountNode(child, backend, parent, null)
    }
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
 */
function bindReactiveChild<N>(
  accessor: () => MindeesNode,
  backend: HostBackend<N>,
  parent: N,
): void {
  let current: N[] = []
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
      // Compute the anchor (where the region currently sits) before removing.
      const anchor = current.length > 0 ? nextSiblingAfter(backend, current) : null
      for (const n of current) backend.remove(parent, n)
      current = mountNode(value, backend, parent, anchor)
    })
  })
}

/** The sibling immediately after the last node of `group` (insertion anchor). */
function nextSiblingAfter<N>(backend: HostBackend<N>, group: N[]): N | null {
  const last = group[group.length - 1]
  return last !== undefined ? backend.nextSibling(last) : null
}

export type { MaybeReactive }
