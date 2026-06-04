/**
 * Automatic JSX runtime for MindeesNative — the target of TypeScript's `react-jsx`
 * transform (and the same transform in esbuild/oxc/rolldown bundlers).
 *
 * Set this in `tsconfig.json` and write `<View/>` with **no manual import**:
 *
 * ```jsonc
 * { "compilerOptions": { "jsx": "react-jsx", "jsxImportSource": "@mindees/core" } }
 * ```
 *
 * The compiler then injects `jsx`/`jsxs`/`Fragment` from here automatically. Both
 * delegate to {@link createElement}; the only wrinkle is that the automatic runtime
 * delivers children inside `props.children` (a single node, or an array for static
 * multi-children) — we hand them to `createElement` as positional children so arrays
 * never nest.
 *
 * @module
 */

import { createElement, type MindeesElement, type MindeesNode } from './component'

export { Fragment } from './component'

/** Props as the automatic runtime delivers them: regular props plus `children`. */
type JsxProps = (Record<string, unknown> & { children?: MindeesNode }) | null | undefined

function jsxImpl(
  type: string | ((props: never) => MindeesNode) | symbol,
  props: JsxProps,
  key?: string | number,
): MindeesElement {
  const { children, ...rest } = props ?? {}
  if (key !== undefined) rest.key = key
  const factory = type as Parameters<typeof createElement>[0]
  if (children === undefined) return createElement(factory, rest)
  return Array.isArray(children)
    ? createElement(factory, rest, ...children)
    : createElement(factory, rest, children)
}

/** JSX factory for an element with zero or one child (automatic runtime). */
export const jsx = jsxImpl
/** JSX factory for an element with static multiple children (automatic runtime). */
export const jsxs = jsxImpl

/**
 * The JSX type environment TypeScript resolves from `jsxImportSource`. Host tags are
 * intentionally permissive for v1 (any lowercase tag with arbitrary props); component
 * elements are checked against their own props by TS. `Element`/`ElementType` tie JSX
 * back to the MindeesNative node model.
 */
// biome-ignore lint/style/noNamespace: TypeScript resolves JSX typings only from a `JSX` namespace.
export namespace JSX {
  /** The type of a JSX expression. */
  export type Element = MindeesElement
  /** Valid JSX element tags: host strings or component functions. */
  export type ElementType = string | ((props: never) => MindeesNode)
  /** Host intrinsic tags (`<view>`, `<text>`, …) — permissive prop bags for v1. */
  export interface IntrinsicElements {
    [tag: string]: Record<string, unknown>
  }
  /** Tells TS which prop carries children (so `<X>child</X>` type-checks). */
  export interface ElementChildrenAttribute {
    children: Record<string, never>
  }
}
