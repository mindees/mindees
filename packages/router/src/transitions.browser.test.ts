// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import { createMemoryHistory } from './history'
import { createRouter } from './router'

interface VTDoc {
  startViewTransition?: ((cb: () => void) => unknown) | undefined
}
const vtDoc = document as unknown as VTDoc

afterEach(() => {
  vtDoc.startViewTransition = undefined
})

describe('view transitions', () => {
  it('wraps the navigation in document.startViewTransition when requested', () => {
    const calls: Array<() => void> = []
    vtDoc.startViewTransition = (cb) => {
      calls.push(cb)
      cb()
      return {}
    }
    const router = createRouter({
      routes: [{ path: '/' }, { path: '/a' }],
      history: createMemoryHistory(),
    })
    router.navigate('/a', { viewTransition: true })
    expect(calls).toHaveLength(1)
    expect(router.location().pathname).toBe('/a')
    router.dispose()
  })

  it('honors the router-level viewTransitions default', () => {
    let used = false
    vtDoc.startViewTransition = (cb) => {
      used = true
      cb()
      return {}
    }
    const router = createRouter({
      routes: [{ path: '/' }, { path: '/a' }],
      history: createMemoryHistory(),
      viewTransitions: true,
    })
    router.navigate('/a')
    expect(used).toBe(true)
    router.dispose()
  })

  it('still navigates when startViewTransition is unavailable (feature-detect no-op)', () => {
    vtDoc.startViewTransition = undefined
    const router = createRouter({
      routes: [{ path: '/' }, { path: '/a' }],
      history: createMemoryHistory(),
      viewTransitions: true,
    })
    router.navigate('/a')
    expect(router.location().pathname).toBe('/a')
    router.dispose()
  })
})
