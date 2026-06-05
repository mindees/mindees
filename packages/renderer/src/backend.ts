/**
 * Helix host-backend contract.
 *
 * A {@link HostBackend} is the seam between the renderer and a concrete target
 * (DOM today; native iOS/Android and a GPU canvas are research tracks). The
 * reconciler ({@link import('./render').render}) speaks only this interface, so
 * a new platform is "implement `HostBackend<N>`" — nothing in the reconciler
 * changes.
 *
 * `N` is the opaque host-node type (a real DOM `Node`, a headless record, a
 * native view handle, …). The backend never interprets MindeesNative elements;
 * it just creates, mutates, and arranges host nodes on command.
 *
 * @module
 */

/**
 * A platform target. Implementations create/mutate/arrange host nodes of type
 * `N`. All methods are synchronous and side-effecting on the host tree.
 */
export interface HostBackend<N> {
  /** Create an element host node for `type` (e.g. `"view"`, `"text"`). */
  createElement(type: string): N
  /** Create a text host node holding `value`. */
  createText(value: string): N
  /**
   * Apply a single prop/attribute. `prev` is the previously-applied value (or
   * `undefined` on first apply) so the backend can diff/cleanup if needed
   * (e.g. removing an old event listener). Event props are `onX` (capitalized).
   */
  setProp(node: N, key: string, value: unknown, prev: unknown): void
  /** Update a text host node's value. */
  setText(node: N, value: string): void
  /**
   * Insert `node` into `parent` immediately before `anchor`, or append when
   * `anchor` is `null`.
   */
  insert(parent: N, node: N, anchor: N | null): void
  /** Remove `node` from `parent`. */
  remove(parent: N, node: N): void
  /** The parent of `node`, or `null` if it has none (detached / root). */
  parentOf(node: N): N | null
  /** The next sibling of `node`, or `null`. Used to compute insertion anchors. */
  nextSibling(node: N): N | null
  /** True if `node` is a text host node (vs an element). */
  isText(node: N): boolean
  /**
   * Optional capability: the host node that portaled children mount into — an overlay/root layer
   * above normal flow. The renderer's portal binding is the ONLY caller. Omit (or return `null`)
   * and portals fall back to their local parent (in-place mount) — the correct, deterministic
   * SSR / no-layer behavior.
   */
  overlayRoot?(): N | null
}

/** Options controlling {@link SerializableBackend.serialize}. */
export interface SerializeOptions {
  /**
   * Map a MindeesNative element tag to the tag actually emitted (e.g. the web
   * target maps `view`→`div`, `text`→`span`). Defaults to identity.
   */
  mapTag?: (type: string) => string
}

/**
 * Optional capability: serialize a host subtree to an HTML string. Backends
 * that support server-side rendering implement this; the headless backend does.
 */
export interface SerializableBackend<N> extends HostBackend<N> {
  /** Serialize `node` (and its subtree) to an HTML string. */
  serialize(node: N, options?: SerializeOptions): string
}

/** Type guard: does `backend` support {@link SerializableBackend.serialize}? */
export function isSerializable<N>(backend: HostBackend<N>): backend is SerializableBackend<N> {
  return typeof (backend as Partial<SerializableBackend<N>>).serialize === 'function'
}
