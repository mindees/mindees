import { describe, expect, it } from 'vitest'
import { buildRouteManifest, chunkName, fileToRoute } from './routes'

describe('fileToRoute', () => {
  it('maps index to the parent path', () => {
    expect(fileToRoute('index.tsx')).toEqual({ routePath: '/', params: [], catchAll: false })
    expect(fileToRoute('blog/index.tsx')).toEqual({
      routePath: '/blog',
      params: [],
      catchAll: false,
    })
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
})
