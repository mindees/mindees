import { createElement } from '@mindees/core'
import { createHeadlessBackend, createHeadlessRoot, render } from '@mindees/renderer'
import { describe, expect, it } from 'vitest'
import { createLink, createRouterView } from './components'
import { createMemoryHistory } from './history'
import { createRouter, type RouteComponentProps } from './router'

function setup(routes: Parameters<typeof createRouter>[0]['routes'], initial = '/') {
  const router = createRouter({
    routes,
    history: createMemoryHistory({ initialEntries: [initial] }),
  })
  const backend = createHeadlessBackend()
  const root = createHeadlessRoot()
  return { router, backend, root }
}

const Home = () => createElement('view', null, createElement('text', null, 'home'))
const About = () => createElement('view', null, createElement('text', null, 'about'))

describe('createRouterView — flat rendering', () => {
  it('renders the matched route component', () => {
    const { router, backend, root } = setup([{ path: '/', component: Home }])
    render(createRouterView(router), backend, root)
    expect(backend.serialize(root)).toContain('home')
    router.dispose()
  })

  it('swaps the view on navigation', () => {
    const { router, backend, root } = setup([
      { path: '/', component: Home },
      { path: '/about', component: About },
    ])
    render(createRouterView(router), backend, root)
    expect(backend.serialize(root)).toContain('home')
    router.navigate('/about')
    const html = backend.serialize(root)
    expect(html).toContain('about')
    expect(html).not.toContain('home')
    router.dispose()
  })

  it('renders the notFound component when nothing matches', () => {
    const { router, backend, root } = setup([{ path: '/', component: Home }], '/missing')
    const NotFound = () => createElement('text', null, 'not-found')
    render(createRouterView(router, { notFound: NotFound }), backend, root)
    expect(backend.serialize(root)).toContain('not-found')
    router.dispose()
  })

  it('keeps reacting across REPEATED navigations (no freeze after the first)', () => {
    const { router, backend, root } = setup([
      { path: '/', component: Home },
      { path: '/about', component: About },
    ])
    render(createRouterView(router), backend, root)
    for (const [to, expected] of [
      ['/about', 'about'],
      ['/', 'home'],
      ['/about', 'about'],
      ['/', 'home'],
    ] as const) {
      router.navigate(to)
      expect(backend.serialize(root)).toContain(expected)
    }
    router.dispose()
  })

  it('re-expands after a notFound and back (repeated)', () => {
    const { router, backend, root } = setup([{ path: '/', component: Home }])
    const NotFound = () => createElement('text', null, 'nf')
    render(createRouterView(router, { notFound: NotFound }), backend, root)
    expect(backend.serialize(root)).toContain('home')
    router.navigate('/missing')
    expect(backend.serialize(root)).toContain('nf')
    router.navigate('/')
    expect(backend.serialize(root)).toContain('home')
    router.dispose()
  })
})

describe('createRouterView — nested routes', () => {
  it('renders a child into its parent layout via props.children (the outlet)', () => {
    const Layout = (props: RouteComponentProps) =>
      createElement('view', { id: 'layout' }, createElement('text', null, 'shell'), props.children)
    const Child = () => createElement('text', null, 'child')
    const { router, backend, root } = setup(
      [{ path: '/app', component: Layout, children: [{ path: 'inner', component: Child }] }],
      '/app/inner',
    )
    render(createRouterView(router), backend, root)
    const html = backend.serialize(root)
    expect(html).toContain('shell')
    expect(html).toContain('child')
    router.dispose()
  })

  it('passes through a component-less (layout) route', () => {
    const { router, backend, root } = setup(
      [{ path: '/group', children: [{ path: 'page', component: Home }] }],
      '/group/page',
    )
    render(createRouterView(router), backend, root)
    expect(backend.serialize(root)).toContain('home')
    router.dispose()
  })

  it('PRESERVES the parent layout across sibling navigation (does not re-invoke it)', () => {
    let layoutInvocations = 0
    const Layout = (props: RouteComponentProps) => {
      layoutInvocations++
      return createElement('view', { id: 'layout' }, props.children)
    }
    const A = () => createElement('text', null, 'page-a')
    const B = () => createElement('text', null, 'page-b')
    const { router, backend, root } = setup(
      [
        {
          path: '/dash',
          component: Layout,
          children: [
            { path: 'a', component: A },
            { path: 'b', component: B },
          ],
        },
      ],
      '/dash/a',
    )
    render(createRouterView(router), backend, root)
    expect(backend.serialize(root)).toContain('page-a')
    expect(layoutInvocations).toBe(1)

    router.navigate('/dash/b')
    expect(backend.serialize(root)).toContain('page-b')
    expect(backend.serialize(root)).not.toContain('page-a')
    // The layout was NOT re-rendered — fine-grained, layout-preserving navigation.
    expect(layoutInvocations).toBe(1)

    // ...and it keeps working across more navigations (a→b→a), still preserving.
    router.navigate('/dash/a')
    expect(backend.serialize(root)).toContain('page-a')
    expect(layoutInvocations).toBe(1)
    router.dispose()
  })

  it('re-expands a child after navigating up to the index (deep→shallow→deep)', () => {
    const Layout = (props: RouteComponentProps) => createElement('view', null, props.children)
    const Index = () => createElement('text', null, 'index')
    const Inner = () => createElement('text', null, 'inner')
    const { router, backend, root } = setup(
      [
        {
          path: '/app',
          component: Layout,
          children: [
            { path: '', component: Index },
            { path: 'inner', component: Inner },
          ],
        },
      ],
      '/app/inner',
    )
    render(createRouterView(router), backend, root)
    expect(backend.serialize(root)).toContain('inner')
    router.navigate('/app') // shallow (index)
    expect(backend.serialize(root)).toContain('index')
    expect(backend.serialize(root)).not.toContain('inner')
    router.navigate('/app/inner') // deep again — must re-expand
    expect(backend.serialize(root)).toContain('inner')
    router.dispose()
  })
})

describe('createRouterView — fine-grained params', () => {
  it('updates a param read WITHOUT re-invoking the component (same route)', () => {
    let invocations = 0
    const Post = (props: RouteComponentProps) => {
      invocations++
      return createElement('text', null, () => `post ${props.params().postId}`)
    }
    const { router, backend, root } = setup(
      [{ path: '/posts/:postId', component: Post }],
      '/posts/1',
    )
    render(createRouterView(router), backend, root)
    expect(backend.serialize(root)).toContain('post 1')
    expect(invocations).toBe(1)

    router.navigate('/posts/2')
    expect(backend.serialize(root)).toContain('post 2')
    // Same route → component not re-invoked; only the reactive text region updated.
    expect(invocations).toBe(1)

    // Repeated param navigation keeps updating in place (no freeze, no re-mount).
    router.navigate('/posts/3')
    expect(backend.serialize(root)).toContain('post 3')
    expect(invocations).toBe(1)
    router.dispose()
  })
})

describe('createRouterView — loader data', () => {
  it('exposes loader data to the route component, updating reactively (no re-mount)', async () => {
    let invocations = 0
    const Page = (props: RouteComponentProps) => {
      invocations++
      return createElement('text', null, () => {
        const d = props.data()
        return d.status === 'success' ? `data:${d.data}` : `status:${d.status}`
      })
    }
    const { router, backend, root } = setup([{ path: '/', component: Page, loader: () => 'hi' }])
    render(createRouterView(router), backend, root)
    expect(backend.serialize(root)).toContain('status:pending')
    await new Promise((r) => setTimeout(r, 0))
    expect(backend.serialize(root)).toContain('data:hi')
    // The component was rendered once; only the reactive data binding updated.
    expect(invocations).toBe(1)
    router.dispose()
  })

  it('keeps loader data reactive across REPEATED navigations (A→B→A, no freeze)', async () => {
    const flush = () => new Promise((r) => setTimeout(r, 0))
    const page = (label: string) => (props: RouteComponentProps) =>
      createElement('text', null, () => {
        const d = props.data()
        return d.status === 'success' ? `${label}:${d.data}` : `${label}:${d.status}`
      })
    const { router, backend, root } = setup(
      [
        { path: '/a', component: page('A'), loader: () => 'AA' },
        { path: '/b', component: page('B'), loader: () => 'BB' },
      ],
      '/a',
    )
    render(createRouterView(router), backend, root)
    await flush()
    expect(backend.serialize(root)).toContain('A:AA')

    router.navigate('/b')
    await flush()
    expect(backend.serialize(root)).toContain('B:BB')

    router.navigate('/a')
    await flush()
    expect(backend.serialize(root)).toContain('A:AA') // data() still resolves after multiple navs
    router.dispose()
  })
})

describe('createLink', () => {
  it('renders an anchor with the built href and navigates on click', () => {
    const { router, backend, root } = setup([{ path: '/' }, { path: '/posts/:postId' }])
    const Link = createLink(router)
    render(Link({ to: '/posts/:postId', params: { postId: '5' }, children: 'open' }), backend, root)
    const anchor = root.children[0]
    expect(anchor?.type).toBe('a')
    expect(anchor?.props.href).toBe('/posts/5')

    const onClick = anchor?.props.onClick as (e?: unknown) => void
    onClick()
    expect(router.location().pathname).toBe('/posts/5')
    router.dispose()
  })

  it('serializes search and hash into the href', () => {
    const { router, backend, root } = setup([{ path: '/' }, { path: '/search' }])
    const Link = createLink(router)
    render(Link({ to: '/search', search: { q: 'hi', page: 2 }, hash: 'top' }), backend, root)
    expect(root.children[0]?.props.href).toBe('/search?page=2&q=hi#top')
    router.dispose()
  })

  it('honors modified clicks (lets the browser handle them)', () => {
    const { router, backend, root } = setup([{ path: '/' }, { path: '/about' }])
    const Link = createLink(router)
    render(Link({ to: '/about', children: 'x' }), backend, root)
    const onClick = root.children[0]?.props.onClick as (e?: unknown) => void
    onClick({ metaKey: true, preventDefault: () => {} })
    expect(router.location().pathname).toBe('/')
    router.dispose()
  })

  it('applies activeClass reactively when the path is current', () => {
    const { router, backend, root } = setup([{ path: '/' }, { path: '/about' }])
    const Link = createLink(router)
    render(Link({ to: '/about', class: 'lnk', activeClass: 'on', children: 'x' }), backend, root)
    expect(root.children[0]?.props.class).toBe('lnk')
    router.navigate('/about')
    expect(root.children[0]?.props.class).toBe('lnk on')
    router.dispose()
  })
})

describe('createLink — auto-prefetch', () => {
  const prefetchRoutes = () => {
    let loaded = 0
    const routes = [
      { path: '/' },
      {
        path: '/p/:id',
        loader: () => {
          loaded++
          return 'data'
        },
      },
    ]
    return { routes, loaded: () => loaded }
  }

  // Loaders run in a microtask, so let scheduled loads settle before asserting.
  const tick = () => new Promise((r) => setTimeout(r, 0))

  it("prefetches the target's loader on intent (pointer enter), deduped", async () => {
    const { routes, loaded } = prefetchRoutes()
    const { router } = setup(routes)
    const Link = createLink(router)
    const el = Link({ to: '/p/:id', params: { id: '1' }, children: 'go' })
    await tick()
    expect(loaded()).toBe(0) // default 'intent' does NOT prefetch on render
    ;(el.props.onPointerEnter as () => void)()
    await tick()
    expect(loaded()).toBe(1) // warmed on intent
    ;(el.props.onPointerEnter as () => void)() // deduped per link
    ;(el.props.onFocus as () => void)()
    await tick()
    expect(loaded()).toBe(1)
    router.dispose()
  })

  it("prefetch='render' warms on mount; prefetch=false disables it", async () => {
    const a = prefetchRoutes()
    const ra = setup(a.routes)
    createLink(ra.router)({ to: '/p/:id', params: { id: '1' }, prefetch: 'render', children: 'go' })
    await tick()
    expect(a.loaded()).toBe(1) // warmed immediately on render
    ra.router.dispose()

    const b = prefetchRoutes()
    const rb = setup(b.routes)
    const el = createLink(rb.router)({
      to: '/p/:id',
      params: { id: '1' },
      prefetch: false,
      children: 'go',
    })
    expect(el.props.onPointerEnter).toBeUndefined() // no intent handlers wired
    await tick()
    expect(b.loaded()).toBe(0)
    rb.router.dispose()
  })
})
