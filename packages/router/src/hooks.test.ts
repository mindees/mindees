import { createElement, isElement } from '@mindees/core'
import { describe, expect, it } from 'vitest'
import { createMemoryHistory } from './history'
import { Link, useParams, usePathname, useRouter, useSearch } from './hooks'
import { createRouter, type RouteRecord } from './router'

const routes: RouteRecord[] = [
  { path: '/', component: () => createElement('home') },
  { path: '/about', component: () => createElement('about') },
  { path: '/posts/:id', component: () => createElement('post') },
]

describe('router hooks', () => {
  // Runs first: no router has been created in this isolated test module yet.
  it('useRouter throws before any router exists', () => {
    expect(() => useRouter()).toThrow(/no active router/i)
  })

  it('useRouter returns the active (most recently created) router', () => {
    const router = createRouter({ routes, history: createMemoryHistory({ initialEntries: ['/'] }) })
    expect(useRouter()).toBe(router)
  })

  it('useParams / useSearch / usePathname track navigation reactively', () => {
    const router = createRouter({
      routes,
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })
    const params = useParams()
    const search = useSearch()
    const pathname = usePathname()

    expect(pathname()).toBe('/')
    expect(params()).toEqual({})

    router.navigate('/posts/7?tab=reviews')
    expect(pathname()).toBe('/posts/7')
    expect(params().id).toBe('7')
    expect(search().tab).toBe('reviews')
  })

  it('Link builds an element whose activation navigates the active router', () => {
    const router = createRouter({ routes, history: createMemoryHistory({ initialEntries: ['/'] }) })
    const link = Link({ to: '/about', children: 'About' })
    expect(isElement(link)).toBe(true)
    // Drive the link's handler (DOM click or native press both wire to onClick).
    const onClick = (link.props as { onClick?: (e?: unknown) => void }).onClick
    expect(typeof onClick).toBe('function')
    onClick?.({})
    expect(router.location().pathname).toBe('/about')
  })
})
