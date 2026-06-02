import { describe, expect, it, vi } from 'vitest'
import { createMemoryHistory } from './history'
import { createRouter, type RouteMatch, type Router } from './router'

/** Flush microtasks (loaders resolve on the microtask queue). */
const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0))

/** The current leaf match (throws if unmatched — keeps tests terse). */
function leafOf(router: Router): RouteMatch {
  const match = router.match()
  if (!match) throw new Error('expected a match')
  return match
}

describe('loaders + data', () => {
  it('runs a loader and exposes success data', async () => {
    const loader = vi.fn(() => 'hello')
    const router = createRouter({ routes: [{ path: '/', loader }], history: createMemoryHistory() })
    expect(router.loaderData(leafOf(router)).status).toBe('pending')
    await flush()
    expect(router.loaderData(leafOf(router))).toMatchObject({ status: 'success', data: 'hello' })
    expect(loader).toHaveBeenCalledTimes(1)
    router.dispose()
  })

  it('resolves async loaders and passes a typed context', async () => {
    const loader = vi.fn((ctx: { params: Record<string, string> }) =>
      Promise.resolve(`post-${ctx.params.postId}`),
    )
    const router = createRouter({
      routes: [{ path: '/posts/:postId', loader }],
      history: createMemoryHistory({ initialEntries: ['/posts/7'] }),
    })
    await flush()
    expect(router.loaderData(leafOf(router))).toMatchObject({ status: 'success', data: 'post-7' })
    router.dispose()
  })

  it('captures loader errors', async () => {
    const router = createRouter({
      routes: [
        {
          path: '/',
          loader: () => {
            throw new Error('boom')
          },
        },
      ],
      history: createMemoryHistory(),
    })
    await flush()
    const data = router.loaderData(leafOf(router))
    expect(data.status).toBe('error')
    expect((data.error as Error).message).toBe('boom')
    router.dispose()
  })

  it('reloads on every visit by default (staleTime 0)', async () => {
    const loader = vi.fn(() => 'x')
    const router = createRouter({
      routes: [{ path: '/', loader }, { path: '/o' }],
      history: createMemoryHistory(),
    })
    await flush()
    expect(loader).toHaveBeenCalledTimes(1)
    router.navigate('/o')
    await flush()
    router.navigate('/')
    await flush()
    expect(loader).toHaveBeenCalledTimes(2)
    router.dispose()
  })

  it('serves cached data within staleTime (no reload)', async () => {
    const loader = vi.fn(() => 'x')
    const router = createRouter({
      routes: [{ path: '/', loader, staleTime: 100_000 }, { path: '/o' }],
      history: createMemoryHistory(),
    })
    await flush()
    router.navigate('/o')
    await flush()
    router.navigate('/')
    await flush()
    expect(loader).toHaveBeenCalledTimes(1) // reused — still fresh
    router.dispose()
  })

  it('reloads only when a declared dep changes', async () => {
    const loader = vi.fn((ctx: { search: Record<string, unknown> }) => ctx.search.page)
    const router = createRouter({
      routes: [
        { path: '/list', loader, loaderDeps: ({ search }) => search.page, staleTime: 100_000 },
      ],
      history: createMemoryHistory({ initialEntries: ['/list?page=1'] }),
    })
    await flush()
    expect(loader).toHaveBeenCalledTimes(1)
    router.navigate('/list?page=1&x=2') // page (dep) unchanged
    await flush()
    expect(loader).toHaveBeenCalledTimes(1)
    router.navigate('/list?page=2') // page changed → reload
    await flush()
    expect(loader).toHaveBeenCalledTimes(2)
    router.dispose()
  })

  it('does not throw out of navigation when loaderDeps is non-serializable', async () => {
    const loader = vi.fn(() => 'ok')
    const router = createRouter({
      routes: [{ path: '/' }, { path: '/x', loader, loaderDeps: () => 1n }],
      history: createMemoryHistory(),
    })
    // BigInt deps can't be JSON-serialized; the key computation must degrade,
    // not throw out of navigate().
    expect(() => router.navigate('/x')).not.toThrow()
    await flush()
    expect(router.location().pathname).toBe('/x')
    expect(loader).toHaveBeenCalledTimes(1)
    router.dispose()
  })

  it('does not throw out of navigation when loaderDeps itself throws', async () => {
    const loader = vi.fn(() => 'ok')
    const router = createRouter({
      routes: [
        { path: '/' },
        {
          path: '/x',
          loader,
          loaderDeps: () => {
            throw new Error('bad deps')
          },
        },
      ],
      history: createMemoryHistory(),
    })
    expect(() => router.navigate('/x')).not.toThrow()
    await flush()
    expect(router.location().pathname).toBe('/x')
    expect(loader).toHaveBeenCalledTimes(1)
    router.dispose()
  })

  it('aborts an in-flight load when navigating away', async () => {
    let aborted = false
    const router = createRouter({
      routes: [
        {
          path: '/slow',
          loader: (ctx) =>
            new Promise<string>((resolve) => {
              const timer = setTimeout(() => resolve('done'), 1000)
              ctx.signal.addEventListener('abort', () => {
                clearTimeout(timer)
                aborted = true
              })
            }),
        },
        { path: '/fast' },
      ],
      history: createMemoryHistory({ initialEntries: ['/slow'] }),
    })
    await flush() // let the loader run and attach its abort listener (still pending)
    router.navigate('/fast')
    await flush()
    expect(aborted).toBe(true)
    router.dispose()
  })

  it('invalidate() reloads the current chain', async () => {
    const loader = vi.fn(() => 'x')
    const router = createRouter({
      routes: [{ path: '/', loader, staleTime: 100_000 }],
      history: createMemoryHistory(),
    })
    await flush()
    expect(loader).toHaveBeenCalledTimes(1)
    router.invalidate()
    await flush()
    expect(loader).toHaveBeenCalledTimes(2)
    router.dispose()
  })

  it('preload() runs a target loader without navigating', async () => {
    const loader = vi.fn(() => 'x')
    const router = createRouter({
      routes: [{ path: '/' }, { path: '/p', loader, staleTime: 100_000 }],
      history: createMemoryHistory(),
    })
    await flush()
    expect(loader).toHaveBeenCalledTimes(0)
    router.preload('/p')
    await flush()
    expect(loader).toHaveBeenCalledTimes(1)
    expect(router.location().pathname).toBe('/') // did not navigate
    router.navigate('/p')
    await flush()
    expect(loader).toHaveBeenCalledTimes(1) // reused the preloaded cache
    router.dispose()
  })

  it('runs loaders for every route in a nested chain', async () => {
    const parent = vi.fn(() => 'P')
    const child = vi.fn(() => 'C')
    const router = createRouter({
      routes: [{ path: '/app', loader: parent, children: [{ path: 'page', loader: child }] }],
      history: createMemoryHistory({ initialEntries: ['/app/page'] }),
    })
    await flush()
    expect(parent).toHaveBeenCalledTimes(1)
    expect(child).toHaveBeenCalledTimes(1)
    const matches = router.matches()
    expect(router.loaderData(matches[0] as RouteMatch).data).toBe('P')
    expect(router.loaderData(matches[1] as RouteMatch).data).toBe('C')
    router.dispose()
  })
})

describe('navigation guards', () => {
  it('cancels navigation when beforeNavigate returns false', () => {
    const router = createRouter({
      routes: [{ path: '/' }, { path: '/blocked' }],
      history: createMemoryHistory(),
      beforeNavigate: (to) => (to === '/blocked' ? false : undefined),
    })
    router.navigate('/blocked')
    expect(router.location().pathname).toBe('/')
    router.dispose()
  })

  it('redirects when beforeNavigate returns a string', () => {
    const router = createRouter({
      routes: [{ path: '/' }, { path: '/old' }, { path: '/new' }],
      history: createMemoryHistory(),
      beforeNavigate: (to) => (to === '/old' ? '/new' : undefined),
    })
    router.navigate('/old')
    expect(router.location().pathname).toBe('/new')
    router.dispose()
  })

  it('is idempotent — navigating to the current location is a no-op', () => {
    const router = createRouter({
      routes: [{ path: '/' }, { path: '/a' }],
      history: createMemoryHistory(),
    })
    router.navigate('/a')
    router.navigate('/a') // no-op (no duplicate entry)
    router.history.back()
    expect(router.location().pathname).toBe('/')
    router.dispose()
  })

  it('cancels navigation when the guard redirect-loops past the cap', () => {
    const router = createRouter({
      routes: [{ path: '/' }, { path: '/a' }, { path: '/b' }],
      history: createMemoryHistory(),
      // A pathological guard that ping-pongs forever.
      beforeNavigate: (to) => (to === '/a' ? '/b' : to === '/b' ? '/a' : undefined),
    })
    router.navigate('/a')
    expect(router.location().pathname).toBe('/') // capped → cancelled, not committed
    router.dispose()
  })

  it('force navigates even to the current location', () => {
    const router = createRouter({
      routes: [{ path: '/' }, { path: '/a' }],
      history: createMemoryHistory(),
    })
    router.navigate('/a')
    router.navigate('/a', { force: true }) // duplicate entry
    router.history.back()
    expect(router.location().pathname).toBe('/a')
    router.dispose()
  })
})
