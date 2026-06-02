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

/** Compiler options for emit (JSX classic → createElement/Fragment). */
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
