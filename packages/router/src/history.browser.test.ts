// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createBrowserHistory } from './history'

describe('createBrowserHistory', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/')
  })

  it('reads the current window location', () => {
    window.history.replaceState(null, '', '/posts/42?page=2')
    const h = createBrowserHistory()
    expect(h.location()).toEqual({ pathname: '/posts/42', search: '?page=2', hash: '' })
  })

  it('pushes via the History API and notifies subscribers', () => {
    const h = createBrowserHistory()
    const listener = vi.fn()
    h.subscribe(listener)
    h.push('/about')
    expect(window.location.pathname).toBe('/about')
    expect(listener).toHaveBeenCalledOnce()
  })

  it('replaces in place', () => {
    const h = createBrowserHistory()
    h.push('/a')
    h.replace('/b')
    expect(window.location.pathname).toBe('/b')
  })

  it('forwards popstate (back/forward) to subscribers', () => {
    const h = createBrowserHistory()
    const listener = vi.fn()
    h.subscribe(listener)
    window.history.replaceState(null, '', '/elsewhere')
    window.dispatchEvent(new PopStateEvent('popstate'))
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ pathname: '/elsewhere' }))
  })

  it('detaches the popstate listener when the last subscriber unsubscribes', () => {
    const h = createBrowserHistory()
    const listener = vi.fn()
    const unsubscribe = h.subscribe(listener)
    unsubscribe()
    window.history.replaceState(null, '', '/gone')
    window.dispatchEvent(new PopStateEvent('popstate'))
    expect(listener).not.toHaveBeenCalled()
  })
})
