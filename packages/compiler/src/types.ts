/**
 * Shared types for the Mindees Compiler (MDC).
 *
 * @module
 */

/** Severity of a {@link Diagnostic}. */
export type DiagnosticSeverity = 'error' | 'warning'

/** A 1-based source position. */
export interface SourcePosition {
  /** 1-based line. */
  line: number
  /** 1-based column. */
  column: number
}

/** A compiler diagnostic (a type error, lint-ish issue, or transform note). */
export interface Diagnostic {
  severity: DiagnosticSeverity
  /** Stable code, e.g. `"TS2345"` for a TypeScript diagnostic. */
  code: string
  /** Human-readable message. */
  message: string
  /** Source file the diagnostic refers to, if known. */
  file?: string
  /** Start position in the file, if known. */
  position?: SourcePosition
}

/** The result of compiling a single module. */
export interface CompileResult {
  /** Emitted JavaScript. */
  code: string
  /** Source map (JSON string), when source maps are enabled. */
  map?: string
  /** Diagnostics produced (type errors etc.). Empty on a clean compile. */
  diagnostics: Diagnostic[]
  /** Optimizer statistics for this module. */
  stats: CompileStats
}

/** Per-compile optimizer statistics, used by tests and the perf budget. */
export interface CompileStats {
  /** `createElement` calls collapsed by tree-flattening. */
  flattenedNodes: number
  /** Total `createElement` calls seen before flattening. */
  totalElements: number
}

/** Options controlling a compile. */
export interface CompileOptions {
  /** Logical file name (drives JSX/TS parsing + diagnostics + maps). Default `"module.tsx"`. */
  fileName?: string
  /** Emit a source map. Default `true`. */
  sourceMap?: boolean
  /** Run the tree-flattening optimizer pass. Default `true`. */
  flatten?: boolean
  /** Additional transform plugins to run (after the built-in passes). */
  plugins?: MdcPlugin[]
}

/**
 * A transform plugin. Plugins operate on the desugared `createElement(...)` call
 * form, so they see a stable, framework-level shape. Because `transpileModule`
 * lowers JSX during the **`after`** phase, the returned factory is run as an
 * **`after`** transformer (a `before` transformer would see raw JSX, not calls).
 *
 * Typed structurally against `unknown` here to avoid leaking the `typescript`
 * types across the package boundary; see `transform.ts` for the concrete usage.
 */
export interface MdcPlugin {
  /** Unique plugin name (for diagnostics + ordering). */
  name: string
  /**
   * Build a TypeScript transformer factory:
   * `(ts, program?) => TransformerFactory<SourceFile>`.
   * Receives the `typescript` module so plugins don't import it themselves.
   */
  transformer: (ts: typeof import('typescript')) => unknown
}
