/**
 * File-based routing for Quantum — turn a map of route modules into a router, with
 * the same conventions Expo Router uses so the structure is instantly familiar, but
 * feeding Quantum's better core (validated/typed params, loaders, re-render isolation).
 *
 * A *module map* is `{ [filePath]: RouteModule }` where each module's `default` export
 * is the screen and named exports (`loader`, `searchSchema`, …) configure the route.
 * The map comes from your bundler's glob (web: `import.meta.glob('./app/**', { eager:true })`)
 * or a generated table (native) — either way you never hand-write a route config.
 *
 * Conventions (file path → route):
 * - `index` → the directory's path (`index.tsx` → `/`)
 * - `[param]` → a dynamic segment (`:param`); `[...rest]` → a catch-all (`:rest*`)
 * - `(group)` → a layout group that does not affect the URL
 * - `_layout` → a layout route that wraps the directory's routes (render its outlet)
 * - `+not-found` → the fallback route for unmatched paths
 *
 * @module
 */

import type { Component } from '@mindees/core'
import type { LoaderDepsFn, LoaderFn } from './data'
import {
  type CreateRouterOptions,
  createRouter,
  type RouteComponentProps,
  type RouteRecord,
  type Router,
} from './router'
import type { StandardSchemaV1 } from './standard-schema'

/**
 * A route module: the `default` export is the screen component; named exports
 * configure the route (mirroring {@link RouteRecord}). A `_layout` module's `default`
 * receives the matched child as `props.children` (the outlet).
 */
export interface RouteModule {
  default?: Component<RouteComponentProps>
  loader?: LoaderFn
  loaderDeps?: LoaderDepsFn
  searchSchema?: StandardSchemaV1<unknown, Record<string, unknown>>
  staleTime?: number
  meta?: Readonly<Record<string, unknown>>
}

const ROUTE_EXT = /\.(tsx|ts|jsx|js)$/

function isGroup(seg: string): boolean {
  return seg.startsWith('(') && seg.endsWith(')')
}

/** Convert one path segment to its route form (`index`→``, `[id]`→`:id`, `[...x]`→`:x*`). */
function segmentToPath(seg: string): string {
  if (seg === 'index') return ''
  const rest = seg.match(/^\[\.\.\.(.+)\]$/)
  if (rest?.[1]) return `:${rest[1]}*`
  const param = seg.match(/^\[(.+)\]$/)
  if (param?.[1]) return `:${param[1]}`
  return seg
}

/** Build a {@link RouteRecord} from a module, copying only the fields it defines. */
function recordFrom(path: string, mod: RouteModule, children?: RouteRecord[]): RouteRecord {
  const record: { -readonly [K in keyof RouteRecord]?: RouteRecord[K] } = { path }
  if (mod.default) record.component = mod.default
  if (mod.loader) record.loader = mod.loader
  if (mod.loaderDeps) record.loaderDeps = mod.loaderDeps
  if (mod.searchSchema) record.searchSchema = mod.searchSchema
  if (mod.staleTime !== undefined) record.staleTime = mod.staleTime
  if (mod.meta) record.meta = mod.meta
  if (children && children.length > 0) record.children = children
  return record as RouteRecord
}

interface DirNode {
  layout?: RouteModule
  files: { seg: string; module: RouteModule }[]
  dirs: Map<string, DirNode>
}

function emptyDir(): DirNode {
  return { files: [], dirs: new Map() }
}

/** Group the flat module map into a directory tree, pulling out a top-level not-found. */
function buildTree(modules: Record<string, RouteModule>): {
  root: DirNode
  notFound?: RouteModule
} {
  const root = emptyDir()
  let notFound: RouteModule | undefined
  // Sort keys so output is deterministic regardless of map insertion order.
  for (const rawKey of Object.keys(modules).sort()) {
    // Accept keys relative to the app dir, with optional leading "./" or "app/".
    const key = rawKey.replace(/^\.\//, '').replace(/^app\//, '')
    const parts = key
      .replace(ROUTE_EXT, '')
      .split('/')
      .filter((s) => s.length > 0)
    if (parts.length === 0) continue
    const filename = parts[parts.length - 1] as string
    const mod = modules[rawKey] as RouteModule

    if (filename === '+not-found') {
      notFound = mod
      continue
    }

    let node = root
    for (const dir of parts.slice(0, -1)) {
      let next = node.dirs.get(dir)
      if (!next) {
        next = emptyDir()
        node.dirs.set(dir, next)
      }
      node = next
    }
    if (filename === '_layout') node.layout = mod
    else node.files.push({ seg: filename, module: mod })
  }
  return notFound ? { root, notFound } : { root }
}

/** Convert a directory node into the route records *relative to that node*. */
function nodeToRoutes(node: DirNode): RouteRecord[] {
  const routes: RouteRecord[] = []

  for (const file of node.files) {
    routes.push(recordFrom(segmentToPath(file.seg), file.module))
  }

  for (const [dirName, child] of node.dirs) {
    const childRoutes = nodeToRoutes(child)
    const seg = isGroup(dirName) ? '' : dirName

    if (child.layout) {
      // A layout wraps the directory's routes (it renders the outlet via children).
      routes.push(recordFrom(seg, child.layout, childRoutes))
    } else if (seg === '') {
      // A group with no layout adds no path/wrapper — its routes rise to this level.
      routes.push(...childRoutes)
    } else {
      // A plain directory nests its routes under a component-less path segment.
      routes.push({ path: seg, children: childRoutes })
    }
  }

  return routes
}

/**
 * Build a Quantum route table ({@link RouteRecord}[]) from a file-based module map.
 * Pure — use it directly, or via {@link createFileRouter}.
 */
export function routesFromModules(modules: Record<string, RouteModule>): RouteRecord[] {
  const { root, notFound } = buildTree(modules)
  const routes = nodeToRoutes(root)
  if (notFound?.default) {
    // Lowest-specificity catch-all: real routes always win; this matches the rest.
    routes.push({ path: '/:__notFound*', component: notFound.default })
  }
  return routes
}

/**
 * Create a router from a file-based module map — the file-based equivalent of
 * {@link createRouter}. Pass any other router options (history, guard, …).
 *
 * @example
 * // web (Vite): const modules = import.meta.glob('./app/**\/*.tsx', { eager: true })
 * const router = createFileRouter(modules, { history: createMemoryHistory() })
 */
export function createFileRouter(
  modules: Record<string, RouteModule>,
  options: Omit<CreateRouterOptions, 'routes'> = {},
): Router {
  return createRouter({ ...options, routes: routesFromModules(modules) })
}
