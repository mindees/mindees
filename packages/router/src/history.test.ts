import { describe, expect, it, vi } from 'vitest'
import { createHref, createMemoryHistory, parseHref } from './history'

describe('parseHref / createHref', () => {
  it('splits pathname, search, and hash', () => {
    expect(parseHref('/posts/42?page=2#top')).toEqual({
      pathname: '/posts/42',
      search: '?page=2',
      hash: '#top',
    })
  })

  it('defaults an empty path to /', () => {
    expect(parseHref('?page=2')).toEqual({ pathname: '/', search: '?page=2', hash: '' })
    expect(parseHref('')).toEqual({ pathname: '/', search: '', hash: '' })
  })

  it('ensures a leading slash on a relative path (invariant)', () => {
    expect(parseHref('rel?q=1')).toEqual({ pathname: '/rel', search: '?q=1', hash: '' })
  })

  it('round-trips', () => {
    const href = '/a/b?x=1#h'
    expect(createHref(parseHref(href))).toBe(href)
  })
})

describe('createMemoryHistory', () => {
  it('starts at / by default', () => {
    expect(createMemoryHistory().location().pathname).toBe('/')
  })

  it('honors initial entries and index', () => {
    const h = createMemoryHistory({ initialEntries: ['/a', '/b', '/c'], initialIndex: 1 })
    expect(h.location().pathname).toBe('/b')
  })

  it('pushes new entries and notifies subscribers', () => {
    const h = createMemoryHistory()
    const listener = vi.fn()
    h.subscribe(listener)
    h.push('/posts/42?page=2')
    expect(h.location()).toEqual({ pathname: '/posts/42', search: '?page=2', hash: '' })
    expect(listener).toHaveBeenCalledOnce()
  })

  it('replaces in place without growing history', () => {
    const h = createMemoryHistory({ initialEntries: ['/a'] })
    h.push('/b')
    h.replace('/c')
    h.back()
    expect(h.location().pathname).toBe('/a')
  })

  it('navigates back and forward', () => {
    const h = createMemoryHistory({ initialEntries: ['/a', '/b', '/c'] })
    expect(h.location().pathname).toBe('/c')
    h.back()
    expect(h.location().pathname).toBe('/b')
    h.forward()
    expect(h.location().pathname).toBe('/c')
    h.go(-2)
    expect(h.location().pathname).toBe('/a')
  })

  it('clamps go() to the bounds and does not notify when it cannot move', () => {
    const h = createMemoryHistory({ initialEntries: ['/a'] })
    const listener = vi.fn()
    h.subscribe(listener)
    h.back()
    expect(h.location().pathname).toBe('/a')
    expect(listener).not.toHaveBeenCalled()
  })

  it('truncates forward entries on push', () => {
    const h = createMemoryHistory({ initialEntries: ['/a', '/b', '/c'], initialIndex: 0 })
    h.push('/x')
    h.back()
    expect(h.location().pathname).toBe('/a')
    h.forward()
    expect(h.location().pathname).toBe('/x')
  })

  it('stops notifying after unsubscribe', () => {
    const h = createMemoryHistory()
    const listener = vi.fn()
    const unsubscribe = h.subscribe(listener)
    unsubscribe()
    h.push('/b')
    expect(listener).not.toHaveBeenCalled()
  })
})
