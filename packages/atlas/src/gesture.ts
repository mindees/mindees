/**
 * Atlas `GestureView` — attach a gesture {@link Recognizer} to a view. Spreads the recognizer's
 * pointer handlers onto a RAW host `view` (the curated primitives don't forward arbitrary
 * `onPointer*` props) and registers `onCleanup(reset)` so an unmount mid-gesture clears the
 * recognizer's pointer/timer state. Compose multiple recognizers with `composeGestures` first.
 *
 * @example
 * const drag = panAnimated(x, y, { release: () => ({ x: 0, y: 0 }) })
 * <GestureView gesture={drag} style={() => ({ transform: `translate(${x()}px, ${y()}px)` })}>…</GestureView>
 *
 * @module
 */

import { type Component, createElement, getOwner, type MindeesNode, onCleanup } from '@mindees/core'
import { type BaseProps, toHostProps } from './host'

/** The minimal recognizer shape `GestureView` needs (any factory or `composeGestures` result fits). */
export interface AttachableGesture {
  readonly handlers: {
    onPointerDown(e: unknown): void
    onPointerMove(e: unknown): void
    onPointerUp(e: unknown): void
    onPointerCancel(e: unknown): void
  }
  reset(): void
}

/** Props for {@link GestureView}. */
export interface GestureViewProps extends BaseProps {
  /** The recognizer (or `composeGestures(...)`) to attach. */
  readonly gesture: AttachableGesture
  readonly children?: MindeesNode
}

/** A view wired to a gesture recognizer (pointer handlers attached, auto-reset on unmount). */
export const GestureView: Component<GestureViewProps> = (props) => {
  const { gesture, children, ...rest } = props
  if (getOwner() !== null) onCleanup(() => gesture.reset())
  return createElement('view', { ...toHostProps(rest), ...gesture.handlers }, children)
}
