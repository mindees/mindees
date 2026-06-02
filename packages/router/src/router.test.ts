import { effect } from '@mindees/core'
import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { createMemoryHistory } from './history'
import { createRouter, resolvePath } from './router'

const routes = [
  { path: '/' },
  { path: '/about' },
  { path: '/posts/:postId' },
  { path: '/posts/:postId/comments/:commentId' },
  { path: '/files/:rest*' },
]

function makeRouter(initial = '/') {
  return createRouter({ routes, history: createMemoryHistory({ initialEntries: [initial] }) })
}

describe('createRouter — matching', () => {
  it('matches the initial location and exposes params', () => {
    const router = makeRouter('/posts/42')
    expect(router.match()?.route.path).toBe('/posts/:postId')
    expect(router.params()).toEqual({ postId: '42' })
    router.dispose()
  })

  it('returns null match + empty params/search when nothing matches', () => {
    const router = makeRouter('/nope/nope/nope')
    expect(router.match()).toBeNull()
    expect(router.params()).toEqual({})
    expect(router.search()).toEqual({})
    router.dispose()
  })

  it('prefers the most specific route', () => {
    const r = createRouter({
      routes: [{ path: '/posts/:rest*' }, { path: '/posts/new' }, { path: '/posts/:id' }],
      history: createMemoryHistory({ initialEntries: ['/posts/new'] }),
    })
    expect(r.match()?.route.path).toBe('/posts/new')
    r.dispose()
  })

  it('parses search params (raw, when no schema)', () => {
    const router = makeRouter('/about?tab=billing&tag=a&tag=b')
    expect(router.search()).toEqual({ tab: 'billing', tag: ['a', 'b'] })
    router.dispose()
  })

  it('matches an explicit root over a bare catch-all', () => {
    const r = createRouter({
      routes: [{ path: '/:rest*' }, { path: '/' }],
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })
    expect(r.match()?.route.path).toBe('/')
    // The catch-all still wins for non-root paths.
    r.navigate('/anything/here')
    expect(r.match()?.route.path).toBe('/:rest*')
    r.dispose()
  })
})

describe('createRouter — navigation', () => {
  it('navigates by absolute href string', () => {
    const router = makeRouter('/')
    router.navigate('/posts/7?page=2')
    expect(router.location().pathname).toBe('/posts/7')
    expect(router.params()).toEqual({ postId: '7' })
    expect(router.search()).toEqual({ page: '2' })
    router.dispose()
  })

  it('navigates by typed structured target (params + search + hash)', () => {
    const router = makeRouter('/')
    router.navigate({
      to: '/posts/:postId',
      params: { postId: '9' },
      search: { page: 3 },
      hash: 'c',
    })
    expect(router.location()).toEqual({ pathname: '/posts/9', search: '?page=3', hash: '#c' })
    router.dispose()
  })

  it('supports replace (no new history entry)', () => {
    const router = makeRouter('/')
    router.navigate('/about')
    router.navigate('/posts/1', { replace: true })
    router.history.back()
    expect(router.location().pathname).toBe('/')
    router.dispose()
  })

  it('resolves relative navigation against the current pathname', () => {
    const router = makeRouter('/posts/1')
    router.navigate('./comments/5')
    expect(router.location().pathname).toBe('/posts/1/comments/5')
    router.navigate('../..')
    expect(router.location().pathname).toBe('/posts/1')
    router.dispose()
  })

  it('changes only the query with a ?-relative target', () => {
    const router = makeRouter('/posts/1')
    router.navigate('?page=2')
    expect(router.location().pathname).toBe('/posts/1')
    expect(router.search()).toEqual({ page: '2' })
    router.dispose()
  })

  it('preserves the current query for a #fragment-only navigation (RFC 3986)', () => {
    const router = makeRouter('/posts/1')
    router.navigate('?tab=info')
    router.navigate('#reviews')
    expect(router.location()).toEqual({
      pathname: '/posts/1',
      search: '?tab=info',
      hash: '#reviews',
    })
    router.dispose()
  })
})

describe('createRouter — re-render isolation', () => {
  it('a param selector re-runs only when its slice changes', () => {
    const router = makeRouter('/posts/1?page=1')
    const postId = router.select((s) => s.params.postId)

    const runs = vi.fn()
    const dispose = effect(() => {
      postId()
      runs()
    })
    expect(runs).toHaveBeenCalledTimes(1)

    // search-only change → postId unchanged → no re-run
    router.navigate('/posts/1?page=2')
    expect(postId()).toBe('1')
    expect(runs).toHaveBeenCalledTimes(1)

    // postId change → re-run
    router.navigate('/posts/2?page=2')
    expect(postId()).toBe('2')
    expect(runs).toHaveBeenCalledTimes(2)

    dispose()
    router.dispose()
  })
})

describe('createRouter — dynamic reconfiguration', () => {
  it('setRoutes re-matches in place without resetting the location', () => {
    const router = createRouter({
      routes: [{ path: '/dashboard/:rest*' }],
      history: createMemoryHistory({ initialEntries: ['/dashboard/reports'] }),
    })
    expect(router.match()?.route.path).toBe('/dashboard/:rest*')
    expect(router.match()?.params).toEqual({ rest: 'reports' })

    // Swap the table: the location is untouched, but it now matches a finer route.
    router.setRoutes([{ path: '/dashboard/:rest*' }, { path: '/dashboard/reports' }])
    expect(router.location().pathname).toBe('/dashboard/reports')
    expect(router.match()?.route.path).toBe('/dashboard/reports')
    router.dispose()
  })
})

describe('createRouter — search validation', () => {
  it('validates and types search params against a route schema', () => {
    const router = createRouter({
      routes: [{ path: '/search', searchSchema: z.object({ page: z.coerce.number() }) }],
      history: createMemoryHistory({ initialEntries: ['/search?page=2'] }),
    })
    expect(router.search()).toEqual({ page: 2 })
    expect(router.match()?.issues).toBeUndefined()
    router.dispose()
  })

  it('exposes issues and falls back to raw search on invalid input (no crash)', () => {
    const router = createRouter({
      routes: [{ path: '/search', searchSchema: z.object({ page: z.coerce.number() }) }],
      history: createMemoryHistory({ initialEntries: ['/search?page=notnum'] }),
    })
    // Coercion makes 'notnum' -> NaN, which z.number() rejects.
    expect(router.match()).not.toBeNull()
    expect(router.match()?.issues?.length).toBeGreaterThan(0)
    expect(router.match()?.searchRaw).toEqual({ page: 'notnum' })
    router.dispose()
  })
})

describe('createRouter — disposal', () => {
  it('unsubscribes from history on dispose', () => {
    const history = createMemoryHistory()
    const router = createRouter({ routes, history })
    router.dispose()
    history.push('/about')
    // The router stopped reacting, so its location did not advance.
    expect(router.location().pathname).toBe('/')
  })
})

describe('resolvePath', () => {
  it('keeps absolute paths and normalizes them', () => {
    expect(resolvePath('/a/b', '/x')).toBe('/a/b')
    expect(resolvePath('/a/./b/../c', '/x')).toBe('/a/c')
  })

  it('resolves relative paths against the base directory', () => {
    expect(resolvePath('edit', '/posts/1')).toBe('/posts/1/edit')
    expect(resolvePath('./edit', '/posts/1')).toBe('/posts/1/edit')
    expect(resolvePath('../', '/posts/1')).toBe('/posts')
    expect(resolvePath('../../x', '/a/b/c')).toBe('/a/x')
  })
})
