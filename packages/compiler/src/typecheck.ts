/**
 * The MDC type-check gate.
 *
 * Runs the TypeScript checker over a single in-memory module and reports
 * structured {@link Diagnostic}s. This is the compiler's correctness gate: a
 * build with any `error`-severity diagnostic must not ship.
 *
 * It uses an in-memory `CompilerHost` so no files touch disk; lib `.d.ts` files
 * are read from the real `typescript` install so global types resolve.
 *
 * @module
 */

import ts from 'typescript'
import type { Diagnostic } from './types'

/** Default compiler options for the gate: strict, modern, JSX-aware. */
function defaultOptions(): ts.CompilerOptions {
  return {
    strict: true,
    noUncheckedIndexedAccess: true,
    exactOptionalPropertyTypes: true,
    target: ts.ScriptTarget.ES2023,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    jsx: ts.JsxEmit.React,
    jsxFactory: 'createElement',
    jsxFragmentFactory: 'Fragment',
    noEmit: true,
    skipLibCheck: true,
    // Don't require imports to resolve to real files — we type-check a single
    // module in isolation; unresolved imports are not the gate's concern.
    noResolve: true,
    types: [],
  }
}

function toSeverity(category: ts.DiagnosticCategory): 'error' | 'warning' | null {
  if (category === ts.DiagnosticCategory.Error) return 'error'
  if (category === ts.DiagnosticCategory.Warning) return 'warning'
  return null
}

/**
 * Map a file extension to its `ScriptKind`. `ts.createSourceFile` does NOT infer
 * this — omitting it would mis-parse files — so we map it explicitly (not via
 * any TypeScript-internal helper). A `.ts` file thus rejects JSX, while `.tsx`
 * accepts it.
 */
function scriptKindForFile(fileName: string): ts.ScriptKind {
  const lower = fileName.toLowerCase()
  if (lower.endsWith('.tsx')) return ts.ScriptKind.TSX
  if (lower.endsWith('.jsx')) return ts.ScriptKind.JSX
  if (lower.endsWith('.js') || lower.endsWith('.mjs') || lower.endsWith('.cjs')) {
    return ts.ScriptKind.JS
  }
  if (lower.endsWith('.json')) return ts.ScriptKind.JSON
  return ts.ScriptKind.TS
}

/** Convert a TypeScript diagnostic to our structured form. */
function convert(diag: ts.Diagnostic): Diagnostic | null {
  const severity = toSeverity(diag.category)
  if (!severity) return null
  const message = ts.flattenDiagnosticMessageText(diag.messageText, '\n')
  const out: Diagnostic = {
    severity,
    code: `TS${diag.code}`,
    message,
  }
  if (diag.file) {
    out.file = diag.file.fileName
    if (diag.start !== undefined) {
      const { line, character } = diag.file.getLineAndCharacterOfPosition(diag.start)
      out.position = { line: line + 1, column: character + 1 }
    }
  }
  return out
}

/**
 * Type-check a single module's source and return its diagnostics.
 *
 * @param source - The module source (`.tsx` is assumed unless `fileName` says otherwise).
 * @param fileName - Logical file name. Default `"module.tsx"`.
 * @returns All `error`/`warning` diagnostics (semantic + syntactic). Empty = clean.
 */
export function typecheck(source: string, fileName = 'module.tsx'): Diagnostic[] {
  const options = defaultOptions()
  const sourceFile = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.ES2023,
    true,
    scriptKindForFile(fileName),
  )

  const defaultHost = ts.createCompilerHost(options)
  const host: ts.CompilerHost = {
    ...defaultHost,
    getSourceFile: (name, languageVersion, onError, shouldCreate) => {
      if (name === fileName) return sourceFile
      return defaultHost.getSourceFile(name, languageVersion, onError, shouldCreate)
    },
    writeFile: () => {
      /* noEmit */
    },
    fileExists: (name) => name === fileName || defaultHost.fileExists(name),
    readFile: (name) => (name === fileName ? source : defaultHost.readFile(name)),
  }

  const program = ts.createProgram([fileName], options, host)
  const diagnostics = [
    ...program.getSyntacticDiagnostics(sourceFile),
    ...program.getSemanticDiagnostics(sourceFile),
  ]

  const out: Diagnostic[] = []
  for (const d of diagnostics) {
    const converted = convert(d)
    if (converted) out.push(converted)
  }
  return out
}

/** True if any diagnostic is an `error` (i.e. the build must fail). */
export function hasErrors(diagnostics: readonly Diagnostic[]): boolean {
  return diagnostics.some((d) => d.severity === 'error')
}
