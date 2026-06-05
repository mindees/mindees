/**
 * The MDC transform/compile pipeline.
 *
 * `compile()` lowers TSX → `createElement(...)` (matching `@mindees/core`'s
 * factory), runs the built-in optimizer passes (tree-flattening) plus any user
 * plugins, and emits JavaScript + a source map. It does **not** type-check
 * (that's {@link typecheck}); `compileChecked()` runs the gate first and refuses
 * to emit on `error` diagnostics.
 *
 * @module
 */

import ts from 'typescript'
import { createFlattenTransformer } from './flatten'
import { hasErrors, typecheck } from './typecheck'
import type { CompileOptions, CompileResult, CompileStats } from './types'

/** Compiler options for emit (JSX → `createElement`/`Fragment`, which the optimizer matches). */
function emitOptions(sourceMap: boolean): ts.CompilerOptions {
  return {
    jsx: ts.JsxEmit.React,
    jsxFactory: 'createElement',
    jsxFragmentFactory: 'Fragment',
    target: ts.ScriptTarget.ES2023,
    module: ts.ModuleKind.ESNext,
    sourceMap,
  }
}

/** Runtime names the JSX desugar references; injected from `@mindees/core` if unbound. */
const RUNTIME_NAMES = ['createElement', 'Fragment'] as const

/**
 * Ensure the JSX runtime is in scope. Idiomatic components use **automatic JSX** and import
 * nothing, but we emit classic `createElement(...)`/`Fragment` (so the tree-flatten optimizer
 * can match them) — which would be unbound at runtime. This transformer prepends
 * `import { createElement, Fragment } from '@mindees/core'` for any runtime name that is
 * referenced but not already imported, so emitted modules run. Runs LAST (after flatten/plugins),
 * so names the optimizer removed don't get a needless import.
 */
function createRuntimeImportTransformer(tsmod: typeof ts): ts.TransformerFactory<ts.SourceFile> {
  return (context) => (sourceFile) => {
    const imported = new Set<string>()
    for (const stmt of sourceFile.statements) {
      if (
        tsmod.isImportDeclaration(stmt) &&
        tsmod.isStringLiteral(stmt.moduleSpecifier) &&
        stmt.moduleSpecifier.text === '@mindees/core'
      ) {
        const named = stmt.importClause?.namedBindings
        if (named && tsmod.isNamedImports(named)) {
          for (const el of named.elements) imported.add((el.propertyName ?? el.name).text)
        }
      }
    }
    const referenced = new Set<string>()
    const visit = (node: ts.Node): void => {
      if (tsmod.isIdentifier(node) && (RUNTIME_NAMES as readonly string[]).includes(node.text)) {
        referenced.add(node.text)
      }
      tsmod.forEachChild(node, visit)
    }
    visit(sourceFile)
    const missing = RUNTIME_NAMES.filter((n) => referenced.has(n) && !imported.has(n))
    if (missing.length === 0) return sourceFile
    const importDecl = tsmod.factory.createImportDeclaration(
      undefined,
      tsmod.factory.createImportClause(
        false,
        undefined,
        tsmod.factory.createNamedImports(
          missing.map((n) =>
            tsmod.factory.createImportSpecifier(
              false,
              undefined,
              tsmod.factory.createIdentifier(n),
            ),
          ),
        ),
      ),
      tsmod.factory.createStringLiteral('@mindees/core'),
    )
    return context.factory.updateSourceFile(sourceFile, [importDecl, ...sourceFile.statements])
  }
}

/**
 * Compile a single TSX/TS module to JavaScript.
 *
 * Pipeline: JSX desugar → tree-flatten (optional) → user plugins → emit.
 * Returns emitted code, an optional source map, any (transpile-level)
 * diagnostics, and optimizer stats. Use {@link compileChecked} to gate on the
 * full type checker.
 */
export function compile(source: string, options: CompileOptions = {}): CompileResult {
  const { fileName = 'module.tsx', sourceMap = true, flatten = true, plugins = [] } = options

  // IMPORTANT: our optimizer + plugins operate on the desugared
  // `createElement(...)` call form, but `transpileModule` runs `before`
  // transformers on the *pre-desugar* JSX AST. JSX is lowered during the
  // `after` phase, so flatten/plugins must run there to see the calls.
  const after: ts.TransformerFactory<ts.SourceFile>[] = []
  let stats: CompileStats = { flattenedNodes: 0, totalElements: 0 }

  if (flatten) {
    const flattener = createFlattenTransformer(ts)
    after.push(flattener.factory)
    stats = flattener.stats // live object, updated during emit
  }

  for (const plugin of plugins) {
    after.push(plugin.transformer(ts) as ts.TransformerFactory<ts.SourceFile>)
  }

  // LAST: bind the JSX runtime (automatic-JSX components import nothing) so output runs.
  after.push(createRuntimeImportTransformer(ts))

  const output = ts.transpileModule(source, {
    compilerOptions: emitOptions(sourceMap),
    fileName,
    reportDiagnostics: true,
    transformers: { after },
  })

  // transpileModule only surfaces a few syntactic diagnostics; semantic ones
  // come from the type-check gate. Map each to our structured form.
  const diagnostics = (output.diagnostics ?? []).map((d) => {
    const message = ts.flattenDiagnosticMessageText(d.messageText, '\n')
    return {
      severity:
        d.category === ts.DiagnosticCategory.Error ? ('error' as const) : ('warning' as const),
      code: `TS${d.code}`,
      message,
    }
  })

  const result: CompileResult = {
    code: output.outputText,
    diagnostics,
    stats,
  }
  if (sourceMap && output.sourceMapText) result.map = output.sourceMapText
  return result
}

/**
 * Type-check then compile. If the gate finds any `error` diagnostic, returns it
 * WITHOUT emitting code (`code: ''`) — the build must not ship type errors.
 */
export function compileChecked(source: string, options: CompileOptions = {}): CompileResult {
  const fileName = options.fileName ?? 'module.tsx'
  const diagnostics = typecheck(source, fileName)
  if (hasErrors(diagnostics)) {
    return { code: '', diagnostics, stats: { flattenedNodes: 0, totalElements: 0 } }
  }
  const compiled = compile(source, options)
  // Surface any type-check warnings alongside the compile result.
  return { ...compiled, diagnostics: [...diagnostics, ...compiled.diagnostics] }
}
