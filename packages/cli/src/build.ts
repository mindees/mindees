/**
 * `buildProject` — compile a project's sources with the Mindees Compiler.
 *
 * Walks `src/**` via an injected {@link FileSystem}, runs each TS/TSX module
 * through `@mindees/compiler`'s `typecheck` gate and then `compile` (emit),
 * writes the JS (and source map) to `dist/`, and — if a `src/routes/` dir
 * exists — emits a per-route manifest. Returns structured results so the CLI can
 * report diagnostics and fail the build on type errors.
 *
 * @module
 */

import { buildRouteManifest, compile, type Diagnostic, typecheck } from '@mindees/compiler'
import type { FileSystem } from './fs'
import { VERSION } from './version'

/** Runtime packages a web app imports — mapped in the emitted index.html's import-map (to the esm.sh CDN). */
const WEB_RUNTIME_PACKAGES = [
  'core',
  'renderer',
  'router',
  'atlas',
  'data',
  'updates',
  'ai',
] as const

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * The runnable HTML shell. Loads the compiled entry as a native ES module; the bare `@mindees/*`
 * specifiers in the compiled output resolve via the import-map to the published packages on the esm.sh
 * CDN (which serves their transitive graph), so the app runs in a browser with no bundler step. Both the
 * bare name and a trailing-slash mapping are emitted so subpath imports (e.g. `@mindees/atlas/list`) work.
 */
function renderIndexHtml(appName: string, entry: string, version: string): string {
  const imports = WEB_RUNTIME_PACKAGES.flatMap((p) => [
    `      "@mindees/${p}": "https://esm.sh/@mindees/${p}@${version}"`,
    `      "@mindees/${p}/": "https://esm.sh/@mindees/${p}@${version}/"`,
  ]).join(',\n')
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(appName)}</title>
    <script type="importmap">
{
  "imports": {
${imports}
  }
}
    </script>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="./${entry}"></script>
  </body>
</html>
`
}

/**
 * Add explicit `.js` extensions to RELATIVE import/export specifiers in emitted code. The compiler emits
 * `from './App'` (TS preserves the extensionless source specifier), which a browser's native ESM loader
 * cannot resolve. Bare specifiers (`@mindees/*`) are left untouched (the import-map resolves them). Only
 * touches `./`/`../` specifiers that lack a file extension. (Minor source-map drift on import lines only.)
 */
function rewriteRelativeImports(code: string): string {
  const addExt = (spec: string): string => (/\.[a-zA-Z0-9]+$/.test(spec) ? spec : `${spec}.js`)
  return code.replace(
    /(\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)(['"])(\.\.?\/[^'"]*)\2/g,
    (_m, pre: string, q: string, spec: string) => `${pre}${q}${addExt(spec)}${q}`,
  )
}

/**
 * Diagnostic codes that are artifacts of type-checking a module **in isolation**
 * (without the project's dependency graph or ambient JSX types), not real app
 * errors. If any ever reaches the build it is **downgraded to a warning** rather
 * than failing the build:
 *
 * - `TS2307` — "Cannot find module '…'": imports aren't resolved in single-module mode.
 * - `TS7026` — "no interface 'JSX.IntrinsicElements'": the framework's JSX env
 *   types aren't loaded in isolation.
 *
 * In practice the compiler's single-module gate already **filters** these upstream
 * (it drops unresolved-import codes and injects ambient JSX types), so they
 * normally don't appear here at all — this set is a defensive backstop in case a
 * future gate surfaces them. Genuine type errors (e.g. `TS2322` not-assignable)
 * are untouched and still fail the build. A full project-graph type-check is
 * future work (see ROADMAP).
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
  /** Emit a runnable `index.html` (web target) when an app entry compiled. Default `true`. */
  html?: boolean
  /** Title for the emitted `index.html`. Default `"Mindees App"`. */
  appName?: string
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
  /** Whether a runnable `index.html` was emitted (an app entry `src/main.{tsx,ts}` compiled). */
  htmlEmitted?: boolean
}

const COMPILABLE = /\.(tsx|ts)$/
const DECLARATION = /\.d\.ts$/

/** The directory portion of a POSIX path (`a/b/c.js` → `a/b`; no slash → `''`). */
function dirOf(path: string): string {
  const i = path.lastIndexOf('/')
  return i < 0 ? '' : path.slice(0, i)
}
/** The final segment of a POSIX path (`a/b/c.js` → `c.js`). */
function baseOf(path: string): string {
  const i = path.lastIndexOf('/')
  return i < 0 ? path : path.slice(i + 1)
}
/** Relative POSIX path from `fromDir` to `toPath` (e.g. `dist/routes` → `src/routes/x.tsx`). */
function relativePath(fromDir: string, toPath: string): string {
  const from = fromDir.split('/').filter(Boolean)
  const to = toPath.split('/').filter(Boolean)
  let i = 0
  while (i < from.length && i < to.length && from[i] === to[i]) i++
  return [...Array(from.length - i).fill('..'), ...to.slice(i)].join('/') || '.'
}

/**
 * Build the project at `root`. Compiles every `src/**\/*.{ts,tsx}` (except
 * `.d.ts`) and writes outputs to `outDir`. Stops emitting a module on type
 * errors but collects diagnostics from all modules so the report is complete.
 */
export function buildProject(fs: FileSystem, options: BuildOptions = {}): BuildResult {
  const {
    root = '.',
    outDir = 'dist',
    sourceMap = true,
    html = true,
    appName = 'Mindees App',
  } = options
  const srcDir = root === '.' ? 'src' : `${root}/src`

  const diagnostics: Diagnostic[] = []
  const compiled: string[] = []
  const stats = { flattenedNodes: 0, totalElements: 0 }
  const writtenOutPaths = new Map<string, string>() // outPath → the rel that emitted it (collision guard)

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
      // Two sources whose basenames differ only by extension (App.ts + App.tsx) map to one dist/App.js
      // — fail loudly instead of silently overwriting one with the other.
      const collidedWith = writtenOutPaths.get(outPath)
      if (collidedWith !== undefined) {
        diagnostics.push({
          severity: 'error',
          code: 'MDC_OUTPUT_COLLISION',
          message: `Output collision: "${rel}" and "${collidedWith}" both emit "${outPath}". Rename one.`,
        })
        continue
      }
      writtenOutPaths.set(outPath, rel)
      let code = emitted.code
      if (emitted.map) {
        // Rewrite the map so `sources` resolves to the real src/ file (TS emits a bare basename that
        // resolves to a non-existent dist/*.tsx), and point the sourceMappingURL comment at the LITERAL
        // .map filename (TS percent-encodes special chars like `[ ]`, which won't match the written file).
        let mapText = emitted.map
        try {
          const map = JSON.parse(emitted.map) as { sources?: string[]; sourceRoot?: string }
          map.sources = [relativePath(dirOf(outPath), `${srcDir}/${rel}`)]
          map.sourceRoot = ''
          mapText = JSON.stringify(map)
        } catch {
          // leave the map untouched if it isn't parseable (shouldn't happen)
        }
        fs.writeFile(`${outPath}.map`, mapText)
        code = code.replace(
          /\/\/# sourceMappingURL=.*$/m,
          `//# sourceMappingURL=${baseOf(outPath)}.map`,
        )
      }
      // Make relative specifiers browser-resolvable (`./App` → `./App.js`) so the output runs as native ESM.
      fs.writeFile(outPath, rewriteRelativeImports(code))
      compiled.push(rel)
    }
  }

  // Per-route manifest, if a routes dir is present. buildRouteManifest THROWS on
  // a malformed routes dir (duplicate route path, or a non-terminal catch-all) —
  // ordinary user misconfigurations that `mindees build` exists to report. Turn
  // them into a build diagnostic + failing result so the CLI prints a clean error
  // and exits non-zero, honoring runCli's "never throws for expected failures"
  // contract instead of crashing with a raw stack trace.
  let routes: BuildResult['routes']
  const routesDir = `${srcDir}/routes`
  if (fs.exists(routesDir)) {
    try {
      // Only manifest routes the build actually COMPILES (.tsx/.ts) — buildRouteManifest otherwise
      // accepts .jsx/.js too, which the compile loop skips, leaving a manifest entry with no emitted chunk.
      routes = buildRouteManifest(fs.readDir(routesDir).filter((f) => COMPILABLE.test(f)))
      fs.writeFile(`${outDir}/routes.manifest.json`, `${JSON.stringify(routes, null, 2)}\n`)
    } catch (e) {
      diagnostics.push({
        severity: 'error',
        code: 'MDC_ROUTES',
        message: e instanceof Error ? e.message : String(e),
        file: routesDir,
      })
    }
  }

  // Emit a runnable index.html when an app entry (`src/main.{tsx,ts}` → `dist/main.js`) compiled, so
  // `mindees build`/`dev` produce something that actually renders in a browser (import-map → CDN; no bundler).
  let htmlEmitted = false
  if (html && writtenOutPaths.has(`${outDir}/main.js`)) {
    fs.writeFile(`${outDir}/index.html`, renderIndexHtml(appName, 'main.js', VERSION))
    htmlEmitted = true
  }

  compiled.sort()
  const ok = !diagnostics.some((d) => d.severity === 'error')
  const result: BuildResult = { ok, compiled, diagnostics, stats }
  if (routes) result.routes = routes
  if (htmlEmitted) result.htmlEmitted = true
  return result
}
