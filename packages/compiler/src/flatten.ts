/**
 * Tree-flattening optimizer pass.
 *
 * Operates on the **desugared** `createElement(type, props, ...children)` call
 * form (JSX is lowered first): the TS `before` transformers run after JSX
 * desugaring, so we match call expressions, not JSX nodes.
 *
 * What it does (v0, conservative + correct): a `createElement` call is
 * **static** when its `type` is a string literal, its props are a static object
 * literal (or null/undefined), and all its children are themselves static. The
 * **outermost** static call is wrapped once as `_static(createElement(...))` — a
 * marker the runtime can treat as a create-once, never-diff constant. Nested
 * static children are left untouched (they're created once as part of the
 * wrapped root). The transform is purely additive (wraps a root; never drops or
 * reorders nodes), so it can't change behavior — only annotate optimizable
 * regions.
 *
 * `stats.flattenedNodes` counts static roots wrapped; `stats.totalElements`
 * counts every `createElement` call. These feed tests and the perf budget.
 *
 * @module
 */

import type ts from 'typescript'
import type { CompileStats } from './types'

/** Name the runtime exposes for the static-subtree marker. */
export const STATIC_MARKER = '_static'

/**
 * Build the flatten transformer. Returns a TS `TransformerFactory` plus a live
 * `stats` object updated as the transform runs.
 */
export function createFlattenTransformer(tsmod: typeof ts): {
  factory: ts.TransformerFactory<ts.SourceFile>
  stats: CompileStats
} {
  const stats: CompileStats = { flattenedNodes: 0, totalElements: 0 }

  const isCreateElementCall = (node: ts.Node): node is ts.CallExpression =>
    tsmod.isCallExpression(node) &&
    tsmod.isIdentifier(node.expression) &&
    node.expression.text === 'createElement'

  const isStaticExpression = (node: ts.Expression): boolean => {
    switch (node.kind) {
      case tsmod.SyntaxKind.StringLiteral:
      case tsmod.SyntaxKind.NumericLiteral:
      case tsmod.SyntaxKind.TrueKeyword:
      case tsmod.SyntaxKind.FalseKeyword:
      case tsmod.SyntaxKind.NullKeyword:
        return true
      default:
        return isCreateElementCall(node) && isStaticElement(node)
    }
  }

  const isStaticProps = (node: ts.Expression | undefined): boolean => {
    if (!node) return true
    if (node.kind === tsmod.SyntaxKind.NullKeyword) return true
    if (tsmod.isIdentifier(node) && node.text === 'undefined') return true
    if (tsmod.isObjectLiteralExpression(node)) {
      return node.properties.every(
        (p) =>
          // Only plain `key: value` props with a NON-computed key count as
          // static. A computed key (`{[k]: 1}`) can be dynamic/side-effectful,
          // and shorthand/spread/method/accessor members are not statically
          // analyzable here — any of these makes the element non-static.
          tsmod.isPropertyAssignment(p) &&
          !tsmod.isComputedPropertyName(p.name) &&
          isStaticExpression(p.initializer),
      )
    }
    return false
  }

  const isStaticElement = (call: ts.CallExpression): boolean => {
    const [type, props, ...children] = call.arguments
    if (!type || !tsmod.isStringLiteral(type)) return false
    if (!isStaticProps(props)) return false
    return children.every((c) => isStaticExpression(c))
  }

  /** Count every createElement call in a subtree (for accurate totals). */
  const countElements = (node: ts.Node): void => {
    if (isCreateElementCall(node)) stats.totalElements++
    tsmod.forEachChild(node, countElements)
  }

  const factory: ts.TransformerFactory<ts.SourceFile> = (context) => {
    const { factory: f } = context
    return (sourceFile) => {
      const visit = (node: ts.Node): ts.Node => {
        if (isCreateElementCall(node) && isStaticElement(node)) {
          // Outermost static root: wrap once and DON'T recurse (the whole
          // subtree is static and created as part of this wrapped constant).
          stats.flattenedNodes++
          return f.createCallExpression(f.createIdentifier(STATIC_MARKER), undefined, [node])
        }
        return tsmod.visitEachChild(node, visit, context)
      }
      // Count all elements up front (separately from the wrapping logic), so the
      // total is accurate even though we stop recursion at static roots.
      countElements(sourceFile)
      return tsmod.visitNode(sourceFile, visit) as ts.SourceFile
    }
  }

  return { factory, stats }
}
