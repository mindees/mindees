/**
 * Atlas `For` — the ergonomic, keyed list component (on the `@mindees/atlas/for` subpath).
 *
 * `For` is keyed identity (rows keep their host node, focus, scroll across reorders); the
 * virtualized {@link import('./list').List} is for huge lists — complementary, not competing.
 * Use `For` when you'd otherwise write `() => items().map(...)` (which full-rebuilds): it
 * reconciles by key so only the diff is created/moved/disposed. Consume the `item`/`index`
 * accessors lazily so a row patches in place.
 *
 * @example
 * For({ each: () => todos(), key: (t) => t.id, children: (todo) => (
 *   <Row><Text>{() => todo().title}</Text></Row>
 * )})
 *
 * @module
 */

import { type KeyedRegion, keyedRegion, type MindeesNode } from '@mindees/core'

/** Props for {@link For}. */
export interface ForProps<T> {
  /** The items, static or reactive. */
  readonly each: readonly T[] | (() => readonly T[])
  /** Render one row from reactive `item`/`index` accessors. */
  readonly children: (item: () => T, index: () => number) => MindeesNode
  /** Stable key per item (defaults to item identity). Provide it for primitive/object lists that change shape. */
  readonly key?: (item: T, index: number) => unknown
  /** Rendered when the list is empty. */
  readonly fallback?: () => MindeesNode
}

/** A keyed, identity-preserving list. Returns a {@link KeyedRegion} node the renderer reconciles. */
export function For<T>(props: ForProps<T>): KeyedRegion<T> {
  return keyedRegion<T>(props)
}
