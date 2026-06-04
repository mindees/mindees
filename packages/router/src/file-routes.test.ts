import { createElement } from '@mindees/core'
import { describe, expect, it } from 'vitest'
import { createFileRouter, type RouteModule, routesFromModules } from './file-routes'
import { createMemoryHistory } from './history'
import type { RouteRecord } from './router'

/** A module whose default renders a tagged marker, for identity assertions. */
function mod(tag: string): RouteModule {
  return { default: () => createElement(tag) }
}

/** Find a route by path in a (possibly nested) tree. */
function find(routes: readonly RouteRecord[], path: string): RouteRecord | undefined {
  for (const r of routes) {
    if (r.path === path) return r
    if (r.children) {
      const hit = find(r.children, path)
      if (hit) return hit
    }
  }
  return undefined
}

describe('routesFromModules (file-based conventions)', () => {
  it('maps index/flat files to routes', () => {
    const routes = routesFromModules({ 'index.tsx': mod('home'), 'about.tsx': mod('about') })
    expect(find(routes, '')?.component).toBeTruthy() // index → ''
    expect(find(routes, 'about')?.component).toBeTruthy()
  })

  it('nests a directory under a path segment with index + dynamic + catch-all', () => {
    const routes = routesFromModules({
      'blog/index.tsx': mod('blogIndex'),
      'blog/[slug].tsx': mod('post'),
      'docs/[...rest].tsx': mod('docs'),
    })
    const blog = find(routes, 'blog')
    expect(blog?.children).toBeTruthy()
    expect(find(blog?.children ?? [], '')).toBeTruthy() // blog/index → ''
    expect(find(blog?.children ?? [], ':slug')).toBeTruthy() // [slug] → :slug
    expect(find(routes, ':rest*')).toBeTruthy() // [...rest] → catch-all
  })

  it('drops a (group) from the URL but keeps its routes', () => {
    const routes = routesFromModules({ '(marketing)/about.tsx': mod('about') })
    // Group adds no segment: `about` rises to the top level.
    expect(find(routes, 'about')).toBeTruthy()
    expect(find(routes, '(marketing)')).toBeUndefined()
  })

  it('wraps a directory in its _layout route', () => {
    const routes = routesFromModules({
      'settings/_layout.tsx': mod('settingsLayout'),
      'settings/index.tsx': mod('settingsHome'),
      'settings/profile.tsx': mod('profile'),
    })
    const layout = find(routes, 'settings')
    expect(layout?.component).toBeTruthy() // the layout component
    expect(find(layout?.children ?? [], '')).toBeTruthy()
    expect(find(layout?.children ?? [], 'profile')).toBeTruthy()
  })

  it('adds +not-found as a lowest-specificity catch-all', () => {
    const routes = routesFromModules({ 'index.tsx': mod('home'), '+not-found.tsx': mod('nf') })
    expect(find(routes, '/:__notFound*')?.component).toBeTruthy()
  })

  it('copies loader/searchSchema/meta from named module exports', () => {
    const loader = () => 'data'
    const routes = routesFromModules({
      'x.tsx': { default: () => createElement('x'), loader, meta: { a: 1 } },
    })
    const x = find(routes, 'x')
    expect(x?.loader).toBe(loader)
    expect(x?.meta).toEqual({ a: 1 })
  })
})

describe('createFileRouter', () => {
  it('builds a working router that matches and navigates by file routes', () => {
    const router = createFileRouter(
      { 'index.tsx': mod('home'), 'about.tsx': mod('about'), 'posts/[id].tsx': mod('post') },
      { history: createMemoryHistory({ initialEntries: ['/'] }) },
    )
    expect(router.location().pathname).toBe('/')
    expect(router.match()?.route.path).toBe('') // index

    router.navigate('/about')
    expect(router.location().pathname).toBe('/about')

    router.navigate('/posts/42')
    expect(router.params().id).toBe('42')
  })
})
