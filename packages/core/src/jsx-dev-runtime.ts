/**
 * Automatic JSX **dev** runtime — the target of TypeScript's `react-jsxdev` transform
 * (used by dev/HMR builds). It carries the same `jsxImportSource: "@mindees/core"`
 * setup as {@link import('./jsx-runtime')}; the dev factory receives extra debug
 * arguments (source location, self), which we ignore and delegate to the same impl.
 *
 * @module
 */

import type { MindeesElement, MindeesNode } from './component'
import { jsx } from './jsx-runtime'

export { Fragment } from './component'
export type { JSX } from './jsx-runtime'

/** Dev JSX factory; the trailing debug args (`isStaticChildren`, `source`, `self`) are ignored. */
export function jsxDEV(
  type: string | ((props: never) => MindeesNode) | symbol,
  props: (Record<string, unknown> & { children?: MindeesNode }) | null | undefined,
  key?: string | number,
): MindeesElement {
  return jsx(type, props, key)
}
