/**
 * `buildProject` — compile a project's sources with the Mindees Compiler.
 *
 * Walks `src/**` via an injected {@link FileSystem}, runs each TS/TSX module
 * through `@mindees/compiler`'s `compileChecked` (the type-check gate + emit),
 * writes the JS (and source map) to `dist/`, and — if a `src/routes/` dir
 * exists — emits a per-route manifest. Returns structured results so the CLI can
 * report diagnostics and fail the build on type errors.
 *
 * @module
 */

import { buildRouteManifest, compile, type Diagnostic, typecheck } from '@mindees/compiler'
import type { FileSystem } from './fs'

/**
 * Diagnostic codes that are artifacts of type-checking a module **in isolation**
 * (without the project's dependency graph or ambient JSX types), not real app
 * errors. `buildProject` reports these as warnings instead of failing the build:
 *
 * - `TS2307` — "Cannot find module '…'": imports aren't resolved in single-module mode.
 * - `TS7026` — "no interface 'JSX.IntrinsicElements'": the framework's JSX env
 *   types aren't loaded in isolation.
 *
 * Genuine type errors (e.g. `TS2322` not-assignable) are untouched and still
 * fail the build. A full project-graph type-check is future work (see ROADMAP).
 */
const ISOLATION_NOISE = new Set(['TS2307', 'TS7026'])

/** Options for {@link buildProject}. */
export interface BuildOptions {
  /** Project root (contains `src/`). Default `"."`. */
  root?: string
  /** Output directory. Default `"dist"`. */
  outDir?: string
  /** Emit source maps. Default `true`. */
  sourceMap?: boolean
}

/** Result of a project build. */
export interface BuildResult {
  ok: boolean
  /** Source files compiled (relative paths), sorted. */
  compiled: string[]
  /** All diagnostics across modules (errors fail the build). */
  diagnostics: Diagnostic[]
  /** Route manifest, if `src/routes/` existed. */
  routes?: ReturnType<typeof buildRouteManifest>
  /** Optimizer totals across all modules. */
  stats: { flattenedNodes: number; totalElements: number }
}

const COMPILABLE = /\.(tsx|ts)$/
const DECLARATION = /\.d\.ts$/

/**
 * Build the project at `root`. Compiles every `src/**\/*.{ts,tsx}` (except
 * `.d.ts`) and writes outputs to `outDir`. Stops emitting a module on type
 * errors but collects diagnostics from all modules so the report is complete.
 */
export function buildProject(fs: FileSystem, options: BuildOptions = {}): BuildResult {
  const { root = '.', outDir = 'dist', sourceMap = true } = options
  const srcDir = root === '.' ? 'src' : `${root}/src`

  const diagnostics: Diagnostic[] = []
  const compiled: string[] = []
  const stats = { flattenedNodes: 0, totalElements: 0 }

  const entries = fs.exists(srcDir) ? fs.readDir(srcDir) : []
  for (const rel of entries) {
    if (!COMPILABLE.test(rel) || DECLARATION.test(rel)) continue
    const srcPath = `${srcDir}/${rel}`
    const source = fs.readFile(srcPath)

    // Type-check for diagnostics, but downgrade isolation-only noise to warnings
    // so a normal app (with cross-module imports + JSX) still builds. Genuine
    // type errors remain errors and fail the build below.
    const moduleDiags = typecheck(source, rel).map((d) =>
      d.severity === 'error' && ISOLATION_NOISE.has(d.code)
        ? { ...d, severity: 'warning' as const }
        : d,
    )
    diagnostics.push(...moduleDiags)

    // Emit only if this module has no real (post-downgrade) error.
    const moduleHasError = moduleDiags.some((d) => d.severity === 'error')
    if (!moduleHasError) {
      const emitted = compile(source, { fileName: rel, sourceMap })
      stats.flattenedNodes += emitted.stats.flattenedNodes
      stats.totalElements += emitted.stats.totalElements
      const outPath = `${outDir}/${rel.replace(COMPILABLE, '.js')}`
      fs.writeFile(outPath, emitted.code)
      if (emitted.map) fs.writeFile(`${outPath}.map`, emitted.map)
      compiled.push(rel)
    }
  }

  // Per-route manifest, if a routes dir is present.
  let routes: BuildResult['routes']
  const routesDir = `${srcDir}/routes`
  if (fs.exists(routesDir)) {
    routes = buildRouteManifest(fs.readDir(routesDir))
    fs.writeFile(`${outDir}/routes.manifest.json`, `${JSON.stringify(routes, null, 2)}\n`)
  }

  compiled.sort()
  const ok = !diagnostics.some((d) => d.severity === 'error')
  const result: BuildResult = { ok, compiled, diagnostics, stats }
  if (routes) result.routes = routes
  return result
}
