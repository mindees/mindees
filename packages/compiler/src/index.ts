import type { Maturity, PackageInfo } from '@mindees/core'
import { NotImplementedError, notImplemented } from '@mindees/core'

/** TS → native AOT (research track). */
export { compileToNative, type NativeTarget } from './aot'
/** Build-time performance budget (opt-in via `compileChecked(src, { budget })`) — fails the build. */
export { type BudgetOptions, checkBudget } from './budget'
/** Tree-flattening optimizer pass. */
export { createFlattenTransformer, STATIC_MARKER } from './flatten'
/** Build-time perf-lint (opt-in via `compileChecked(src, { perf: true })`). */
export { type PerfLintOptions, perfLint } from './perf-lint'
/** Rewrite relative import specifiers in emitted JS for native-ESM (browser) loading. */
export { rewriteImportSpecifiers } from './rewrite-imports'
/** Per-route code-splitting manifest + file-based route codegen. */
export {
  buildRouteManifest,
  chunkName,
  fileToRoute,
  type GenerateRouteModuleOptions,
  generateRouteModule,
  type RouteEntry,
  type RouteManifest,
} from './routes'
/** Compile pipeline (TSX → optimized JS). */
export { compile, compileChecked } from './transform'
/** The type-check gate. */
export { hasErrors, typecheck } from './typecheck'
/** Shared types. */
export type {
  CompileOptions,
  CompileResult,
  CompileStats,
  Diagnostic,
  DiagnosticSeverity,
  MdcPlugin,
  SourcePosition,
} from './types'

/** The npm package name. */
export const name = '@mindees/compiler'

/** The package version. All `@mindees/*` packages share one locked version line. */
export const VERSION = '0.34.0'

/**
 * Current maturity. The build-time optimizer — type-check gate, TSX→createElement
 * transform, tree-flattening, per-route manifest, plugin API — is implemented
 * and tested on the TypeScript Compiler API. TS→native AOT is a research track
 * (throws `NotImplementedError`); the working path is TS → optimized JS.
 */
export const maturity: Maturity = 'experimental'

/**
 * Static identity + maturity metadata for this package. Frozen so the
 * self-reported identity tooling introspects cannot be mutated at runtime,
 * matching the `readonly` fields of {@link PackageInfo}.
 */
export const info: PackageInfo = Object.freeze({ name, version: VERSION, maturity })

export type { Maturity, PackageInfo }
export { NotImplementedError, notImplemented }
