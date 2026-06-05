/**
 * Per-route code-splitting: build a route manifest from a file tree.
 *
 * MDC maps a routes directory (file-based routing, à la the Quantum Router) to a
 * **manifest** of chunks — one lazily-loadable entry per route — so the bundler
 * can split per route and the runtime can load a route's code on demand. This
 * pass is platform-agnostic: it produces the manifest; wiring it to a specific
 * bundler/runtime is the CLI's job (Phase 5) and the router's job (Phase 6).
 *
 * @module
 */

/** A single route in the manifest. */
export interface RouteEntry {
  /** URL path, e.g. `/`, `/about`, `/blog/[slug]`. */
  routePath: string
  /** Source file implementing the route, relative to the routes dir. */
  file: string
  /** Stable chunk name for the split bundle, e.g. `route_blog_slug`. */
  chunk: string
  /** Dynamic param names parsed from the path, e.g. `["slug"]`. */
  params: string[]
  /** True for a catch-all segment (`[...rest]`). */
  catchAll: boolean
}

/** The route manifest: every route plus a not-found fallback if present. */
export interface RouteManifest {
  routes: RouteEntry[]
  /** The `+not-found` route file, if any. */
  notFound?: string
}

const ROUTE_FILE = /\.(tsx|ts|jsx|js)$/

/** Strip the file extension. */
function stripExt(file: string): string {
  return file.replace(ROUTE_FILE, '')
}

/**
 * Convert a file path (relative, POSIX separators) to a route path + params.
 *
 * Conventions (subset of the Quantum Router, see ROADMAP Phase 6):
 * - `index` → the directory's path (`index.tsx` → `/`).
 * - `[param]` → a dynamic segment (`:param`); collected into `params`.
 * - `[...rest]` → a catch-all segment; sets `catchAll`.
 * - `(group)` → a layout group that does NOT affect the URL (removed).
 */
export function fileToRoute(file: string): {
  routePath: string
  params: string[]
  catchAll: boolean
} {
  const params: string[] = []
  let catchAll = false

  // Normalize Windows separators: a backslash path (what `path.join` yields on Windows) would
  // otherwise never split into segments, collapsing the whole route to one literal segment.
  const segments = stripExt(file.replace(/\\/g, '/'))
    .split('/')
    .filter((s) => s.length > 0)
    // Drop layout groups like `(marketing)`.
    .filter((s) => !(s.startsWith('(') && s.endsWith(')')))
    .map((s) => {
      // index → empty (resolves to parent path)
      if (s === 'index') return ''
      // [...rest] → catch-all
      const restMatch = s.match(/^\[\.\.\.(.+)\]$/)
      if (restMatch?.[1]) {
        catchAll = true
        params.push(restMatch[1])
        return `:${restMatch[1]}*`
      }
      // [param] → dynamic
      const paramMatch = s.match(/^\[(.+)\]$/)
      if (paramMatch?.[1]) {
        params.push(paramMatch[1])
        return `:${paramMatch[1]}`
      }
      return s
    })
    .filter((s) => s.length > 0)

  // A catch-all must terminate the path; `docs/[...rest]/edit` is structurally
  // invalid and would otherwise emit a nonsensical `/docs/:rest*/edit`.
  const catchAllIndex = segments.findIndex((s) => s.endsWith('*'))
  if (catchAllIndex !== -1 && catchAllIndex !== segments.length - 1) {
    throw new Error(
      `Invalid route file "${file}": a catch-all segment ([...x]) must be the last segment.`,
    )
  }

  const routePath = segments.length === 0 ? '/' : `/${segments.join('/')}`
  return { routePath, params, catchAll }
}

/** Build a stable chunk name from a route file (filesystem-safe identifier). */
export function chunkName(file: string): string {
  const base = stripExt(file)
    .replace(/[/\\]/g, '_')
    .replace(/\[\.\.\.(.+?)\]/g, 'rest_$1')
    .replace(/\[(.+?)\]/g, '$1')
    .replace(/[()]/g, '')
    .replace(/[^a-zA-Z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
  return `route_${base || 'index'}`
}

/**
 * Build a {@link RouteManifest} from a list of route files (relative paths,
 * POSIX `/` separators). Routes are sorted for deterministic output.
 *
 * @example
 * buildRouteManifest(['index.tsx', 'about.tsx', 'blog/[slug].tsx', '+not-found.tsx'])
 */
export function buildRouteManifest(files: readonly string[]): RouteManifest {
  const routes: RouteEntry[] = []
  let notFound: string | undefined
  // Detect collisions (e.g. `index.tsx` and `(app)/index.tsx` both map to `/`).
  const byPath = new Map<string, string>()
  // Distinct routes must also get distinct chunk names — `chunkName` is lossy
  // (e.g. `blog/[slug]` and `blog/slug` both strip to `route_blog_slug`), so a
  // collision here would silently make two routes share one split bundle.
  const byChunk = new Map<string, string>()

  // Normalize separators up front so the manifest's `file` (an `import()` specifier — backslashes
  // are invalid there), chunk names, and route paths are all POSIX, regardless of the host OS.
  const normalized = files.map((f) => f.replace(/\\/g, '/'))
  for (const file of [...normalized].sort()) {
    if (!ROUTE_FILE.test(file)) continue
    const baseName = stripExt(file).split('/').pop() ?? ''
    if (baseName === '+not-found') {
      notFound = file
      continue
    }
    // Skip layout files (`_layout`) and other reserved `_`/`+` prefixed files
    // from the navigable route table (they're handled separately by the router).
    if (baseName.startsWith('_') || baseName.startsWith('+')) continue

    const { routePath, params, catchAll } = fileToRoute(file)
    const prior = byPath.get(routePath)
    if (prior !== undefined) {
      throw new Error(
        `Duplicate route path "${routePath}": both "${prior}" and "${file}" map to it.`,
      )
    }
    byPath.set(routePath, file)
    const chunk = chunkName(file)
    const priorChunk = byChunk.get(chunk)
    if (priorChunk !== undefined) {
      throw new Error(
        `Duplicate chunk name "${chunk}": both "${priorChunk}" and "${file}" produce it; ` +
          'rename one route file so their split bundles do not collide.',
      )
    }
    byChunk.set(chunk, file)
    routes.push({ routePath, file, chunk, params, catchAll })
  }

  const manifest: RouteManifest = { routes }
  if (notFound !== undefined) manifest.notFound = notFound
  return manifest
}

/** Options for {@link generateRouteModule}. */
export interface GenerateRouteModuleOptions {
  /** Import-specifier prefix for the route files. Default `'./app'`. */
  importBase?: string
  /** Name of the exported module-map constant. Default `'routes'`. */
  exportName?: string
}

/**
 * Generate a TypeScript module that statically imports every route file and exposes
 * them as a module map keyed by relative path — exactly the input
 * `@mindees/router`'s `createFileRouter`/`routesFromModules` consume.
 *
 * This is the codegen behind **file-based routing** for bundlers without
 * `import.meta.glob` (e.g. an embedded-engine native bundle): scan the `app/` dir, run
 * this over the file list, write the result (e.g. `routes.gen.ts`), and import the map.
 * Files are sorted for deterministic output. (`_layout`/`+not-found` are intentionally
 * kept — the router applies them via its conventions.)
 *
 * @example
 * generateRouteModule(['index.tsx', 'about.tsx'], { importBase: './app' })
 * // import * as _route0 from './app/about'
 * // import * as _route1 from './app/index'
 * // export const routes = { 'about.tsx': _route0, 'index.tsx': _route1 }
 */
export function generateRouteModule(
  files: readonly string[],
  options: GenerateRouteModuleOptions = {},
): string {
  const importBase = (options.importBase ?? './app').replace(/\/+$/, '')
  const exportName = options.exportName ?? 'routes'
  // Normalize separators: backslashes are invalid in import specifiers, and the map keys must be
  // the POSIX paths `routesFromModules` matches against.
  const routeFiles = [...files]
    .map((f) => f.replace(/\\/g, '/'))
    .filter((f) => ROUTE_FILE.test(f))
    .sort()
  const imports = routeFiles.map(
    (file, i) => `import * as _route${i} from '${importBase}/${stripExt(file)}'`,
  )
  const entries = routeFiles.map((file, i) => `  ${JSON.stringify(file)}: _route${i},`)
  const header =
    '// AUTO-GENERATED by @mindees/compiler generateRouteModule. Do not edit; regenerate when routes change.\n'
  const body = `export const ${exportName} = {\n${entries.join('\n')}\n}\n`
  return imports.length > 0 ? `${header}${imports.join('\n')}\n\n${body}` : `${header}${body}`
}
