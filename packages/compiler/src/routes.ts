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

  const segments = stripExt(file)
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

  for (const file of [...files].sort()) {
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
    routes.push({ routePath, file, chunk: chunkName(file), params, catchAll })
  }

  const manifest: RouteManifest = { routes }
  if (notFound !== undefined) manifest.notFound = notFound
  return manifest
}
