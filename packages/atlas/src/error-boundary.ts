/**
 * Atlas `ErrorBoundary` — catch errors thrown while rendering a subtree and show a fallback instead of
 * letting the whole app fail (RN/React's `<ErrorBoundary>`, signals-native). The children are a thunk
 * evaluated inside a **reactive region**: if it throws, the region renders `fallback(error, reset)`;
 * `reset()` re-runs the children (retry after the cause is fixed), and any signal the children read
 * before throwing also re-runs the region automatically when it changes.
 *
 * Scope: this catches **synchronous render-time** errors (a component throwing while building its
 * view). Errors thrown later inside an `effect` run on their own and are not routed here — handle
 * those where the effect lives.
 *
 * @example
 * ErrorBoundary({
 *   fallback: (err, reset) => <Button title="Retry" onPress={reset} />,
 *   children: () => <RiskyScreen />,
 * })
 *
 * @module
 */

import { type MindeesNode, signal, untrack } from '@mindees/core'

/** Props for {@link ErrorBoundary}. */
export interface ErrorBoundaryProps {
  /** Rendered when `children` throws. `reset` re-runs `children` (retry). */
  readonly fallback: (error: unknown, reset: () => void) => MindeesNode
  /** The guarded subtree, as a thunk so it's evaluated (and re-evaluated) inside the boundary. */
  readonly children: () => MindeesNode
}

/** Render `children`; if it throws, render `fallback(error, reset)` instead. Returns a reactive region. */
export function ErrorBoundary(props: ErrorBoundaryProps): () => MindeesNode {
  const resetKey = signal(0)
  const reset = (): void => {
    resetKey.set(untrack(resetKey) + 1)
  }
  return () => {
    resetKey() // track: reset() (and tracked children deps) re-run this region, retrying
    try {
      return props.children()
    } catch (error) {
      return props.fallback(error, reset)
    }
  }
}
