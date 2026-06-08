/**
 * `buildProject` — compile a project's sources with the Mindees Compiler.
 *
 * Walks `src/**` via an injected {@link FileSystem}, runs each TS/TSX module
 * through `@mindees/compiler`'s `typecheck` gate and then `compile` (emit),
 * writes the JS (and source map) to `dist/`, and — if a `src/app/` dir exists —
 * emits a per-route manifest plus a `routes.gen.js` module map for file-based
 * routing. Returns structured results so the CLI can report diagnostics and fail
 * the build on type errors.
 *
 * @module
 */

import {
  type BudgetOptions,
  buildRouteManifest,
  checkBudget,
  compile,
  type Diagnostic,
  generateRouteModule,
  type PerfLintOptions,
  perfLint,
  rewriteImportSpecifiers,
  typecheck,
} from '@mindees/compiler'
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

/** Resolve a relative `./`/`../` specifier (from `fromDir`) to a normalized path, collapsing `.`/`..`. */
function resolveRelDir(fromDir: string, spec: string): string {
  const parts = fromDir ? fromDir.split('/') : []
  for (const seg of spec.split('/')) {
    if (seg === '' || seg === '.') continue
    if (seg === '..') parts.pop()
    else parts.push(seg)
  }
  return parts.join('/')
}

/**
 * Build a specifier resolver for the module at `rel`: turns a relative, extensionless import into a
 * browser-loadable one — `.js` for a sibling FILE, `/index.js` for a directory (barrel) import — by
 * consulting the set of compiled source files. Leaves specifiers that already have an extension alone.
 */
function makeImportResolver(
  rel: string,
  sourceFiles: ReadonlySet<string>,
): (spec: string) => string {
  const fromDir = dirOf(rel)
  return (spec) => {
    const target = resolveRelDir(fromDir, spec)
    // Check the compiled source set FIRST, so a dotted basename (e.g. `./routes.gen`) is recognized as a
    // module and gets `.js` — rather than `.gen` being mistaken for a real file extension below.
    if (sourceFiles.has(`${target}.tsx`) || sourceFiles.has(`${target}.ts`)) return `${spec}.js`
    if (sourceFiles.has(`${target}/index.tsx`) || sourceFiles.has(`${target}/index.ts`)) {
      return `${spec.replace(/\/$/, '')}/index.js`
    }
    if (/\.[a-zA-Z0-9]+$/.test(spec)) return spec // a real asset extension (.json/.css/.js) — leave it
    return `${spec}.js` // best-effort default (covers the common sibling-file case)
  }
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
 * - `TS2882` — "no type declarations for a side-effect import" (e.g. `import './x.css'`): an asset
 *   import shouldn't fail the build; the import is left for the host to resolve (assets aren't bundled).
 *
 * In practice the compiler's single-module gate already **filters** these upstream
 * (it drops unresolved-import codes and injects ambient JSX types), so they
 * normally don't appear here at all — this set is a defensive backstop in case a
 * future gate surfaces them. Genuine type errors (e.g. `TS2322` not-assignable)
 * are untouched and still fail the build. A full project-graph type-check is
 * future work (see ROADMAP).
 */
const ISOLATION_NOISE = new Set(['TS2307', 'TS7026', 'TS2882'])

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
  /**
   * Run the MDC perf-lint (build-time advice neither RN nor Flutter ships, e.g. `MDC_PERF_001`: a bare
   * `.map()` re-mounts every row). Emits **warnings** only (never fails the build). `true` for defaults,
   * or pass {@link PerfLintOptions} to tune. The CLI enables this by default.
   */
  perf?: boolean | PerfLintOptions
  /**
   * Enforce a per-module performance budget (spec §12: "100% optimized, enforced"). A violation is an
   * **error** that fails the build (non-zero exit). Opt-in via `mindees.config`.
   */
  budget?: BudgetOptions
}

/** Result of a project build. */
export interface BuildResult {
  ok: boolean
  /** Source files compiled (relative paths), sorted. */
  compiled: string[]
  /** All diagnostics across modules (errors fail the build). */
  diagnostics: Diagnostic[]
  /** Route manifest, if `src/app/` existed. */
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
    perf = false,
    budget,
  } = options
  const srcDir = root === '.' ? 'src' : `${root}/src`
  const appDir = `${srcDir}/app`

  // Clean the output dir first so a renamed/deleted source can't leave a stale module (or a
  // manifest-vs-chunk drift) behind — a full build owns its `outDir`.
  if (fs.exists(outDir)) fs.rm(outDir)

  // File-based routing (`src/app/`, Expo-style): regenerate `src/routes.gen.ts` — a static-import module
  // map the app feeds to `createFileRouter` — BEFORE compiling, so it compiles + type-resolves like any
  // module (the browser/QuickJS has no `import.meta.glob`). The app does `import { routes } from
  // './routes.gen'`; it lands at `dist/routes.gen.js` (route imports rewritten to `.js`). Regenerated each
  // build → git-ignore it. (Generated only when `src/app/` has compilable routes.)
  if (fs.exists(appDir)) {
    const appRoutes = fs.readDir(appDir).filter((f) => COMPILABLE.test(f) && !DECLARATION.test(f))
    if (appRoutes.length > 0) {
      const genPath = `${srcDir}/routes.gen.ts`
      const genContent = generateRouteModule(appRoutes, {
        importBase: './app',
        exportName: 'routes',
      })
      // Write only when the content actually changed — in `dev` the file watcher is on `src/`, so an
      // unconditional rewrite of this file (under `src/`) would re-trigger itself into a rebuild loop.
      if (!fs.exists(genPath) || fs.readFile(genPath) !== genContent) {
        fs.writeFile(genPath, genContent)
      }
    }
  }

  const diagnostics: Diagnostic[] = []
  const compiled: string[] = []
  const stats = { flattenedNodes: 0, totalElements: 0 }
  const writtenOutPaths = new Map<string, string>() // outPath → the rel that emitted it (collision guard)

  const entries = fs.exists(srcDir) ? fs.readDir(srcDir) : []
  const sourceFiles = new Set(entries) // for directory-vs-file import resolution
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
      // Flagship build-time DX: perf-lint (warnings — advice, never blocks) + an enforced perf budget
      // (errors — fails the build). Previously wired only into compiler unit tests; now reachable from
      // `mindees build`/`dev` so the "100% optimized, enforced" claim is real, not aspirational.
      if (perf) diagnostics.push(...perfLint(source, rel, typeof perf === 'object' ? perf : {}))
      if (budget) {
        for (const d of checkBudget(emitted, budget)) diagnostics.push({ ...d, file: rel })
      }
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
      // Make relative specifiers browser-resolvable (`./App` → `./App.js`, a directory → `/index.js`)
      // so the output runs as native ESM. AST-based: never corrupts dynamic imports or string literals.
      fs.writeFile(outPath, rewriteImportSpecifiers(code, makeImportResolver(rel, sourceFiles)))
      compiled.push(rel)
    }
  }

  // File-based routing convention dir — `src/app/` (Expo Router-style; the same dir the native example
  // and `createFileRouter`'s conventions use). buildRouteManifest THROWS on a malformed dir (duplicate
  // route path, or a non-terminal catch-all) — ordinary user misconfigurations that `mindees build`
  // reports as a clean diagnostic + failing result rather than crashing with a raw stack trace.
  let routes: BuildResult['routes']
  if (fs.exists(appDir)) {
    // Only consider routes the build actually COMPILES (.tsx/.ts) — buildRouteManifest otherwise accepts
    // .jsx/.js too, which the compile loop skips, leaving a manifest entry with no emitted chunk.
    try {
      routes = buildRouteManifest(fs.readDir(appDir).filter((f) => COMPILABLE.test(f)))
      fs.writeFile(`${outDir}/routes.manifest.json`, `${JSON.stringify(routes, null, 2)}\n`)
    } catch (e) {
      diagnostics.push({
        severity: 'error',
        code: 'MDC_ROUTES',
        message: e instanceof Error ? e.message : String(e),
        file: appDir,
      })
    }
  }

  // Copy a conventional `public/` dir verbatim into `dist/` (favicons, images, fonts, CSS — anything
  // referenced by an ABSOLUTE URL like `/logo.png`). Binary-safe via `copyFile`. The app's generated
  // index.html (below) takes precedence over a `public/index.html`.
  const publicDir = root === '.' ? 'public' : `${root}/public`
  if (fs.exists(publicDir)) {
    for (const rel of fs.readDir(publicDir)) fs.copyFile(`${publicDir}/${rel}`, `${outDir}/${rel}`)
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
