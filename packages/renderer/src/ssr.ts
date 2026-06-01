/**
 * Server-side rendering for the web target.
 *
 * `renderToString` renders an element/component tree to crawlable HTML using the
 * headless backend (no DOM needed) — giving MindeesNative real SSR + SEO, which
 * Flutter Web's canvas renderer cannot. `hydrate` then attaches reactive
 * bindings to the server-rendered DOM on the client.
 *
 * @module
 */

import type { Component, MindeesNode } from '@mindees/core'
import { createDomBackend, type DomDocument, type DomNode, domTagFor } from './dom'
import { createHeadlessBackend, createHeadlessRoot } from './headless'
import { type Mounted, render } from './render'

/**
 * Render an element tree (or component + props) to an HTML string on the server.
 *
 * Reactive bindings run once to produce the initial snapshot, then the scope is
 * disposed (SSR is a one-shot render — no live updates on the server).
 *
 * @example
 * const html = renderToString(App, {})
 * // → "<div><span>hello</span></div>"
 */
export function renderToString(node: MindeesNode): string
export function renderToString<P>(component: Component<P>, props: P): string
export function renderToString<P>(...args: [MindeesNode] | [Component<P>, P]): string {
  const backend = createHeadlessBackend()
  const root = createHeadlessRoot('#root')
  // Component form is the 2-arg call (a component + its props). A 1-arg call is
  // a node — including an accessor node `() => MindeesNode` — so we dispatch by
  // arity, not `typeof`.
  const mounted =
    args.length === 2
      ? render(args[0] as Component<P>, args[1] as P, backend, root)
      : render(args[0] as MindeesNode, backend, root)
  try {
    // Serialize with the web tag mapping so SSR HTML matches what the DOM
    // backend produces on hydration (view→div, text→span, …).
    return root.children.map((child) => backend.serialize(child, { mapTag: domTagFor })).join('')
  } finally {
    // SSR is one-shot: dispose bindings so nothing leaks on the server.
    mounted.dispose()
  }
}

/**
 * Hydrate a server-rendered container on the client: render the same tree with
 * the DOM backend so reactive bindings attach and take over updates.
 *
 * NOTE: this is a **developer-preview** hydration. It currently renders into the
 * (cleared) container rather than adopting existing DOM nodes in place;
 * node-adopting hydration (zero re-create) is tracked for a later phase. The
 * observable result — a live, reactive tree matching the server HTML — is
 * correct today.
 *
 * @param container - The element whose contents were server-rendered.
 * @param node - The same tree (element or component+props) used on the server.
 * @param options - Optionally supply a `document` (e.g. for tests).
 */
export function hydrate(
  container: DomNode,
  node: MindeesNode,
  options?: { document?: DomDocument },
): Mounted<DomNode>
export function hydrate<P>(
  container: DomNode,
  component: Component<P>,
  props: P,
  options?: { document?: DomDocument },
): Mounted<DomNode>
export function hydrate<P>(
  container: DomNode,
  a: MindeesNode | Component<P>,
  b?: P | { document?: DomDocument },
  c?: { document?: DomDocument },
): Mounted<DomNode> {
  type Options = { document?: DomDocument }
  const looksLikeOptions = (v: unknown): v is Options =>
    v === undefined ||
    (typeof v === 'object' && v !== null && Object.keys(v).every((k) => k === 'document'))

  // `MindeesNode` includes the accessor form `() => MindeesNode`, so `typeof a`
  // can't tell a component from a node. Dispatch by arity/shape instead:
  // - a 4th arg (`c`) present ⇒ component form `(container, Component, props, options?)`.
  // - a 3rd arg (`b`) that is NOT a bare `{ document }` options object ⇒ also the
  //   component form (props supplied without options).
  // - otherwise ⇒ node form `(container, node, options?)` where `b` is options.
  const isComponent = c !== undefined || (b !== undefined && !looksLikeOptions(b))
  const props = isComponent ? (b as P) : undefined
  const options: Options = (isComponent ? c : (b as Options | undefined)) ?? {}

  const backend = createDomBackend(options.document)

  // Current preview: clear server-rendered children, then render fresh and
  // attach bindings. Adopt-in-place hydration is a documented follow-up.
  let child = (container as DomNode & { firstChild?: DomNode | null }).firstChild ?? null
  while (child) {
    const next = child.nextSibling
    container.removeChild(child)
    child = next
  }

  return isComponent
    ? render(a as Component<P>, props as P, backend, container)
    : render(a as MindeesNode, backend, container)
}
