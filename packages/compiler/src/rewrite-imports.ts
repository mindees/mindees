/**
 * Rewrite relative import/export specifiers in EMITTED JavaScript so they load as native ES modules in a
 * browser (which needs explicit file extensions). AST-based, not regex: it touches ONLY real module
 * specifiers — `import … from '…'`, `export … from '…'`, and `import('…')` with a single string-literal
 * argument. A concatenated dynamic import (`import('./x/' + name)`) has a non-literal argument and is left
 * alone; import-like text inside a string or comment is never matched.
 *
 * The `resolve` callback decides the new specifier for each relative one (e.g. add `.js`, or `/index.js`
 * for a directory). Only `./`/`../` specifiers are passed to it; bare specifiers (`@mindees/*`, npm) are
 * left untouched. Edits are applied right-to-left so positions stay valid (minor column-level source-map
 * drift on the edited specifiers only — never structural corruption).
 *
 * @module
 */

import ts from 'typescript'

/** Rewrite relative module specifiers in `code` via `resolve`. Returns the original string if nothing changed. */
export function rewriteImportSpecifiers(
  code: string,
  resolve: (specifier: string) => string,
): string {
  const sf = ts.createSourceFile('module.js', code, ts.ScriptTarget.ESNext, true, ts.ScriptKind.JS)
  const edits: Array<{ start: number; end: number; text: string }> = []

  const consider = (lit: ts.StringLiteralLike): void => {
    const spec = lit.text
    if (!spec.startsWith('./') && !spec.startsWith('../')) return // only relative; bare specifiers pass through
    const next = resolve(spec)
    if (next === spec) return
    const start = lit.getStart(sf)
    const quote = code[start] ?? "'" // preserve the original quote character
    edits.push({ start, end: lit.getEnd(), text: `${quote}${next}${quote}` })
  }

  const visit = (node: ts.Node): void => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      consider(node.moduleSpecifier)
    } else if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments.length === 1 &&
      ts.isStringLiteralLike(node.arguments[0] as ts.Expression)
    ) {
      consider(node.arguments[0] as ts.StringLiteralLike)
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)

  if (edits.length === 0) return code
  edits.sort((a, b) => b.start - a.start) // right-to-left → earlier offsets stay valid
  let out = code
  for (const e of edits) out = out.slice(0, e.start) + e.text + out.slice(e.end)
  return out
}
