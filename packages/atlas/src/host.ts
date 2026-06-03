/**
 * The prop→host adapter. Atlas primitives expose a curated, typed prop surface; `toHostProps`
 * lowers the shared base (style + accessibility + id/testID) to the host prop bag that
 * `createElement` receives — the renderer then special-cases `style` (object → inline/native)
 * and passes `role`/`aria-*`/attributes through. Each primitive adds its own events/extra props.
 *
 * @module
 */

import type { Accessor } from '@mindees/core'
import { type A11yProps, toA11yProps } from './a11y'
import { flattenStyle, type StyleInput, type StyleObject } from './style'

/** A value that may be static or a reactive accessor — a function makes it a fine-grained binding. */
export type Reactive<T> = T | Accessor<T>

/** Props every Atlas primitive accepts. */
export interface BaseProps extends A11yProps {
  /** Style (or a list of styles), static or reactive. */
  readonly style?: Reactive<StyleInput>
  /** Host element id. */
  readonly id?: string
  /** Test identifier (lowered to `data-testid`). */
  readonly testID?: string
}

/** Resolve a `Reactive<StyleInput>` to a flattened style object, or an accessor of one. */
export function resolveStyle(style: Reactive<StyleInput>): StyleObject | Accessor<StyleObject> {
  if (typeof style === 'function') {
    const accessor = style as Accessor<StyleInput>
    return () => flattenStyle(accessor())
  }
  return flattenStyle(style)
}

/** Lower the base props (style + a11y + id/testID) to a host prop bag (omitted stays omitted). */
export function toHostProps(props: BaseProps): Record<string, unknown> {
  const host: Record<string, unknown> = { ...toA11yProps(props) }
  if (props.style !== undefined) host.style = resolveStyle(props.style)
  if (props.id !== undefined) host.id = props.id
  if (props.testID !== undefined) host['data-testid'] = props.testID
  return host
}
