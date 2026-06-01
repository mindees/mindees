/**
 * MindeesNative component model — a minimal, renderer-agnostic element tree plus
 * **selector-based, re-render-isolated context**.
 *
 * The element tree (`createElement` / `Fragment`) is a plain data structure: a
 * component is a function of `props` returning elements. It carries no rendering
 * logic itself — the Helix renderer (Phase 3) turns this tree into host nodes.
 *
 * The context system is the important primitive: a `createContext` value is read
 * through a **selector**, and a consumer only re-runs when its *selected slice*
 * actually changes — not on every context update. This is the re-render
 * isolation the Quantum Router (Phase 6) builds on. It is implemented on the
 * Phase 1 signals, so selection participates in normal reactivity.
 *
 * @module
 */

import { computed, createRoot, getOwner, signal } from '../reactive'

// ---------------------------------------------------------------------------
// Element tree
// ---------------------------------------------------------------------------

/** A component: a function from props to a renderable node. */
export type Component<P = Record<string, unknown>> = (props: P) => MindeesNode

/** Anything that can appear in the tree. */
export type MindeesNode =
  | MindeesElement
  | string
  | number
  | boolean
  | null
  | undefined
  | MindeesNode[]

/** The tag of an element: a host string (e.g. `"view"`) or a component function. */
export type ElementType = string | Component<never>

/** A virtual element: a tag, its props, and its children. */
export interface MindeesElement {
  readonly $$typeof: typeof ELEMENT_TYPE
  readonly type: ElementType
  readonly props: Readonly<Record<string, unknown>>
  readonly children: readonly MindeesNode[]
  readonly key: string | number | null
}

/** Brand so a renderer can reliably distinguish elements from plain objects. */
export const ELEMENT_TYPE: unique symbol = Symbol.for('mindees.element')

/** Marker tag for a fragment (children with no wrapper host node). */
export const Fragment: unique symbol = Symbol.for('mindees.fragment')

interface PropsWithKey {
  key?: string | number | null
  children?: MindeesNode
}

/**
 * Create a virtual element. `type` is a host-component string or a component
 * function; `Fragment` groups children without a wrapper.
 *
 * @example
 * createElement('view', { id: 'root' }, createElement('text', null, 'hi'))
 */
export function createElement(
  type: ElementType | typeof Fragment,
  props?: (Record<string, unknown> & PropsWithKey) | null,
  ...children: MindeesNode[]
): MindeesElement {
  const { key = null, children: propsChildren, ...rest } = props ?? {}
  // Children passed as args win over a `children` prop; otherwise fall back to it.
  const resolved: MindeesNode[] =
    children.length > 0 ? children : propsChildren !== undefined ? [propsChildren] : []
  return {
    $$typeof: ELEMENT_TYPE,
    type: type as ElementType,
    props: Object.freeze({ ...rest }),
    children: Object.freeze(resolved),
    key,
  }
}

/** Type guard: is `value` a MindeesElement? */
export function isElement(value: unknown): value is MindeesElement {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { $$typeof?: unknown }).$$typeof === ELEMENT_TYPE
  )
}

// ---------------------------------------------------------------------------
// Selector-based, re-render-isolated context
// ---------------------------------------------------------------------------

/** Equality used by context selectors. Defaults to `Object.is`. */
export type SelectorEquals<S> = (a: S, b: S) => boolean

/** A context handle created by {@link createContext}. */
export interface Context<T> {
  /** Provide a value to a subtree (conceptually); returns a scoped reader set. */
  readonly id: symbol
  /** The default value used when no provider is present. */
  readonly defaultValue: T
}

/**
 * A live provider instance: holds the current value and lets consumers subscribe
 * to a derived slice with re-render isolation.
 */
export interface ContextProvider<T> {
  /** Replace the provided value (notifies only consumers whose slice changed). */
  set(value: T): void
  /** Read the current value without subscribing. */
  peek(): T
  /**
   * Subscribe to a selected slice. The returned accessor is a memo that only
   * changes — and thus only re-runs its observers — when `selector(value)`
   * changes under `equals` (default `Object.is`).
   */
  select<S>(selector: (value: T) => S, equals?: SelectorEquals<S>): () => S
}

/** Create a context with a default value. */
export function createContext<T>(defaultValue: T): Context<T> {
  return { id: Symbol('mindees.context'), defaultValue }
}

/**
 * Create a provider instance for `context`. Built on a signal, so selected
 * slices are memos: a consumer that selects `c => c.user.name` does not re-run
 * when an unrelated field changes.
 *
 * @example
 * const Theme = createContext({ mode: 'light', accent: 'blue' })
 * const p = createProvider(Theme, { mode: 'light', accent: 'blue' })
 * const mode = p.select((t) => t.mode) // only re-runs when `mode` changes
 */
export function createProvider<T>(context: Context<T>, initial?: T): ContextProvider<T> {
  // equals:false at the root — every set() re-evaluates selectors, but each
  // selector memo applies its own equality to isolate re-renders.
  const source = signal<T>(initial ?? context.defaultValue, { equals: false })
  return {
    set: (value: T) => {
      source.set(value)
    },
    peek: () => source.peek(),
    select<S>(selector: (value: T) => S, equals: SelectorEquals<S> = Object.is): () => S {
      return computed(() => selector(source()), { equals })
    },
  }
}

// ---------------------------------------------------------------------------
// Rendering a component subtree under an owner (so it can be disposed)
// ---------------------------------------------------------------------------

/**
 * Invoke a component within a reactive ownership scope, so every effect, memo,
 * and `onCleanup` it registers is torn down together when `dispose` is called.
 * Returns the produced node and that disposer.
 *
 * Built on the Phase 1 {@link createRoot}, so disposal reuses the same
 * leak-free teardown the reactivity tests cover. This is a renderer building
 * block; it does not touch any host.
 */
export function renderComponent<P>(
  component: Component<P>,
  props: P,
): { node: MindeesNode; dispose: () => void } {
  let node!: MindeesNode
  const dispose = createRoot((dispose) => {
    node = component(props)
    return dispose
  })
  return { node, dispose }
}

/** Whether code is currently running inside a reactive ownership scope. */
export function hasOwner(): boolean {
  return getOwner() !== null
}
