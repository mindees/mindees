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
  isKeyedRegion,
  type MindeesElement,
  type MindeesNode,
  onCleanup,
  untrack,
} from '@mindees/core'
import type { HostBackend } from './backend'
import { bindKeyedChild } from './for'

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
  // Capture the disposer eagerly — createRoot passes it to the callback
  // synchronously, BEFORE the body runs. If the component or mountNode throws
  // part-way, effects/regions created before the throw are already adopted on
  // this root; createRoot does NOT auto-dispose on a throw, so without this they
  // would leak (stay subscribed forever) and the caller would get no disposer.
  // Dispose the partial scope, then rethrow — restoring the "no leaks" guarantee.
  let dispose!: () => void
  try {
    createRoot((d) => {
      dispose = d
      // Evaluate the component INSIDE the root scope so its effects/memos are
      // owned here and disposed with us. A non-component node is mounted as-is
      // (an accessor node becomes a reactive region during mount).
      const node: MindeesNode = isComponentForm ? (a as Component<P>)(b as P) : (a as MindeesNode)
      nodes = mountNode(node, backend, container, null)
    })
  } catch (err) {
    dispose?.()
    throw err
  }

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
export function mountNode<N>(
  node: MindeesNode,
  backend: HostBackend<N>,
  parent: N,
  anchor: N | null,
): N[] {
  // Null-ish / boolean → nothing.
  if (node === null || node === undefined || typeof node === 'boolean') return []

  // Keyed list region → keyed reconciliation (identity-preserving). Checked before the
  // function branch so a `For` is never routed to the full-rebuild reactive-child path.
  if (isKeyedRegion(node)) {
    return bindKeyedChild(node, backend, parent, anchor)
  }

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
    // Symmetric teardown: remove the listener when this scope is disposed (unmount
    // or an enclosing region re-run), so a backend's addEventListener always has a
    // matching removal — not left to GC. Passing `undefined` drives the backend's
    // own listener-removal path (e.g. the DOM backend's removeEventListener).
    onCleanup(() => backend.setProp(el, key, undefined, value))
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
  // Pin the region's slot with a persistent, invisible empty-text marker, and
  // always (re)mount content immediately BEFORE it. This keeps the region's
  // exact position across empty↔content transitions (an empty region previously
  // collapsed — its content reappeared at the parent's end, breaking the
  // `() => cond() ? <X/> : null` pattern when the region had following siblings)
  // and keeps adjacent regions in order. The marker serializes to '' so it is
  // invisible in output.
  const marker = backend.createText('')
  backend.insert(parent, marker, initialAnchor)

  // `nodes` is a STABLE, live array — the region's current content followed by
  // the slot marker — mutated in place on every run. Returning the same array
  // reference (not a one-time snapshot) means a caller that captures it once
  // (e.g. render()'s root disposer) always removes the CURRENT content, not the
  // first-run nodes.
  const nodes: N[] = [marker]
  let content: N[] = []

  // Authoritative unmount for the region. Reading the LIVE `content`/`marker` at
  // teardown means it removes whatever is mounted NOW, regardless of how the
  // region was composed. This is required for correctness: when the region is a
  // child of a top-level array/fragment, render()'s disposer only captured a
  // flattened ONE-TIME snapshot of the host nodes (the array branch in mountNode
  // spreads `nodes` into a fresh array), so after a content swap it can no longer
  // remove the current content — that node would leak. This owner-scoped cleanup
  // closes that gap. It is owned by whoever mounted the region: render()'s root
  // (fires once, on final dispose) or an enclosing region effect (fires on each
  // re-run, tearing the nested region down). Guarded by parentOf so it is a safe
  // no-op for nodes already detached by render()'s disposer or a swap.
  onCleanup(() => {
    for (const n of content) {
      if (backend.parentOf(n)) backend.remove(parent, n)
    }
    if (backend.parentOf(marker)) backend.remove(parent, marker)
  })

  effect(() => {
    const value = accessor()
    untrack(() => {
      // Fast path: single existing text node + new text-like value → patch.
      if (
        content.length === 1 &&
        content[0] !== undefined &&
        backend.isText(content[0]) &&
        (typeof value === 'string' || typeof value === 'number')
      ) {
        backend.setText(content[0], String(value))
        return
      }
      // Guarded: when this region is nested in another region, the parent's
      // re-run fires this region's onCleanup first (detaching `content`), so a
      // second removal here would hit an already-detached node — the DOM
      // backend's removeChild throws on a non-child.
      for (const n of content) {
        if (backend.parentOf(n)) backend.remove(parent, n)
      }
      content = mountNode(value, backend, parent, marker)
      nodes.length = 0
      nodes.push(...content, marker)
    })
  })
  return nodes
}

export type { MaybeReactive }
