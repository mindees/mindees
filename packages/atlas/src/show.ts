/**
 * Atlas `Show` — the ergonomic conditional. Renders `children` when `when` is truthy, else `fallback`.
 * `when` is a value or accessor; when it's an accessor the result is a **reactive region** that swaps
 * content as the condition flips. `children` may be a function that receives the **narrowed** truthy
 * value (so you don't re-check for null inside).
 *
 * You can always write `() => cond() ? a() : b()` by hand — `Show` is the readable, fallback-aware,
 * narrowing version of exactly that (Solid/Vue ship the same battery).
 *
 * @example
 * Show({ when: () => user(), fallback: () => <Spinner/>, children: (u) => <Text>{() => u.name}</Text> })
 *
 * @module
 */

import type { MindeesNode } from '@mindees/core'

/** A falsy condition value that hides the children. */
type Falsy = false | null | undefined | 0 | ''

/** Props for {@link Show}. */
export interface ShowProps<T> {
  /** The condition: a value or an accessor. Children render when it's truthy. */
  readonly when: T | (() => T)
  /** Rendered when `when` is falsy. */
  readonly fallback?: () => MindeesNode
  /** Rendered when `when` is truthy; a function receives the narrowed truthy value. */
  readonly children: MindeesNode | ((value: Exclude<T, Falsy>) => MindeesNode)
}

/** Render `children` when `when` is truthy, else `fallback`. Returns a reactive region. */
export function Show<T>(props: ShowProps<T>): () => MindeesNode {
  const cond = typeof props.when === 'function' ? (props.when as () => T) : () => props.when
  return () => {
    const value = cond()
    if (value) {
      return typeof props.children === 'function'
        ? (props.children as (value: Exclude<T, Falsy>) => MindeesNode)(value as Exclude<T, Falsy>)
        : props.children
    }
    return props.fallback ? props.fallback() : null
  }
}
