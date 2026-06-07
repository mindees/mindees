import { describe, expect, it } from 'vitest'
import { buildRouteManifest, chunkName, fileToRoute, generateRouteModule } from './routes'

describe('generateRouteModule', () => {
  it('emits sorted static imports + a module map keyed by relative path', () => {
    const src = generateRouteModule(['index.tsx', 'about.tsx', 'blog/[slug].tsx'], {
      importBase: './app',
    })
    expect(src).toContain('import * as _route0 from "./app/about"')
    expect(src).toContain('import * as _route1 from "./app/blog/[slug]"')
    expect(src).toContain('import * as _route2 from "./app/index"')
    expect(src).toContain('export const routes = {')
    expect(src).toContain('"about.tsx": _route0,')
    expect(src).toContain('"blog/[slug].tsx": _route1,')
    expect(src).toContain('"index.tsx": _route2,')
  })

  it('ignores non-route files and honors a custom export name', () => {
    const src = generateRouteModule(['index.tsx', 'styles.css', 'README.md'], {
      exportName: 'appRoutes',
    })
    expect(src).toContain('export const appRoutes = {')
    expect(src).not.toContain('styles.css')
    expect(src).not.toContain('README.md')
    expect(src).toContain('"./app/index"') // default importBase
  })

  it('emits an empty map for no route files', () => {
    expect(generateRouteModule([])).toContain('export const routes = {\n\n}')
  })

  it('normalizes Windows backslash paths in import specifiers and map keys', () => {
    const src = generateRouteModule(['blog\\[slug].tsx'], { importBase: './app' })
    expect(src).toContain('import * as _route0 from "./app/blog/[slug]"') // POSIX specifier
    expect(src).toContain('"blog/[slug].tsx": _route0,') // POSIX map key
    expect(src).not.toContain('\\') // no backslashes leak into generated code
  })
})

describe('fileToRoute', () => {
  it('maps index to the parent path', () => {
    expect(fileToRoute('index.tsx')).toEqual({ routePath: '/', params: [], catchAll: false })
    expect(fileToRoute('blog/index.tsx')).toEqual({
      routePath: '/blog',
      params: [],
      catchAll: false,
    })
  })

  it('normalizes Windows backslash separators (path.join output)', () => {
    expect(fileToRoute('blog\\[slug].tsx')).toEqual({
      routePath: '/blog/:slug',
      params: ['slug'],
      catchAll: false,
    })
    expect(fileToRoute('settings\\profile.tsx').routePath).toBe('/settings/profile')
  })

  it('rejects a catch-all that is not the last segment', () => {
    expect(() => fileToRoute('docs/[...rest]/edit.tsx')).toThrow(/catch-all/)
  })

  it('maps static segments', () => {
    expect(fileToRoute('about.tsx').routePath).toBe('/about')
    expect(fileToRoute('settings/profile.tsx').routePath).toBe('/settings/profile')
  })

  it('parses a dynamic param', () => {
    expect(fileToRoute('blog/[slug].tsx')).toEqual({
      routePath: '/blog/:slug',
      params: ['slug'],
      catchAll: false,
    })
  })

  it('parses a catch-all', () => {
    expect(fileToRoute('docs/[...rest].tsx')).toEqual({
      routePath: '/docs/:rest*',
      params: ['rest'],
      catchAll: true,
    })
  })

  it('drops layout groups from the URL', () => {
    expect(fileToRoute('(marketing)/pricing.tsx').routePath).toBe('/pricing')
  })

  it('handles multiple params', () => {
    const r = fileToRoute('org/[org]/repo/[repo].tsx')
    expect(r.routePath).toBe('/org/:org/repo/:repo')
    expect(r.params).toEqual(['org', 'repo'])
  })
})

describe('chunkName', () => {
  it('produces filesystem-safe identifiers', () => {
    expect(chunkName('index.tsx')).toBe('route_index')
    expect(chunkName('blog/[slug].tsx')).toBe('route_blog_slug')
    expect(chunkName('docs/[...rest].tsx')).toBe('route_docs_rest_rest')
    expect(chunkName('(marketing)/pricing.tsx')).toBe('route_marketing_pricing')
  })
})

describe('buildRouteManifest', () => {
  it('rejects two files that map to the same route path', () => {
    // `index.tsx` and `(app)/index.tsx` both resolve to '/' (groups drop from the URL).
    expect(() => buildRouteManifest(['index.tsx', '(app)/index.tsx'])).toThrow(/Duplicate/)
  })

  it('rejects two DISTINCT routes that collapse to the same chunk name', () => {
    // `/blog/:slug` and `/blog/slug` are different routes but both strip to
    // `route_blog_slug`; without a chunk-collision guard they'd share one bundle.
    expect(() => buildRouteManifest(['blog/slug.tsx', 'blog/[slug].tsx'])).toThrow(/chunk name/)
  })

  it('builds a manifest from a file tree (deterministic order)', () => {
    const m = buildRouteManifest([
      'index.tsx',
      'about.tsx',
      'blog/[slug].tsx',
      'blog/index.tsx',
      '+not-found.tsx',
    ])
    expect(m.notFound).toBe('+not-found.tsx')
    const paths = m.routes.map((r) => r.routePath)
    expect(paths).toContain('/')
    expect(paths).toContain('/about')
    expect(paths).toContain('/blog')
    expect(paths).toContain('/blog/:slug')
    expect(m.routes).toHaveLength(4) // not-found excluded
  })

  it('excludes layout and reserved files from the route table', () => {
    const m = buildRouteManifest(['index.tsx', '_layout.tsx', '+middleware.ts'])
    expect(m.routes.map((r) => r.file)).toEqual(['index.tsx'])
  })

  it('ignores non-route files', () => {
    const m = buildRouteManifest(['index.tsx', 'styles.css', 'README.md'])
    expect(m.routes).toHaveLength(1)
  })

  it('carries chunk + params on each entry', () => {
    const m = buildRouteManifest(['blog/[slug].tsx'])
    expect(m.routes[0]).toMatchObject({
      routePath: '/blog/:slug',
      chunk: 'route_blog_slug',
      params: ['slug'],
      catchAll: false,
    })
  })

  it('normalizes Windows backslash paths to POSIX in routePath and the import specifier', () => {
    const m = buildRouteManifest(['blog\\[slug].tsx', 'settings\\profile.tsx'])
    const byPath = Object.fromEntries(m.routes.map((r) => [r.routePath, r]))
    expect(byPath['/blog/:slug']?.file).toBe('blog/[slug].tsx') // POSIX import() specifier
    expect(byPath['/settings/profile']?.file).toBe('settings/profile.tsx')
  })

  it('escapes a special char in a route filename (emits a valid module specifier)', () => {
    const out = generateRouteModule(["o'brien.tsx"], { importBase: './app' })
    expect(out).toContain(`from "./app/o'brien"`) // double-quoted, escaped — not a broken string literal
  })
})
