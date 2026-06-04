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

  it('falls back to a plain commit when startViewTransition throws synchronously', () => {
    // Some browsers throw synchronously (e.g. a hidden/background document).
    vtDoc.startViewTransition = () => {
      throw new Error('document is hidden')
    }
    const router = createRouter({
      routes: [{ path: '/' }, { path: '/a' }],
      history: createMemoryHistory(),
      viewTransitions: true,
    })
    expect(() => router.navigate('/a')).not.toThrow() // must not escape navigate()
    expect(router.location().pathname).toBe('/a') // navigation still landed
    router.dispose()
  })

  it('swallows a rejected transition.ready (no unhandled rejection) and still navigates', async () => {
    // A rapid second navigation aborts the first transition, rejecting its
    // eagerly-created `ready` promise. It must be handled, not leak.
    vtDoc.startViewTransition = (cb) => {
      cb()
      return { ready: Promise.reject(new Error('aborted by a newer transition')) }
    }
    const router = createRouter({
      routes: [{ path: '/' }, { path: '/a' }],
      history: createMemoryHistory(),
      viewTransitions: true,
    })
    expect(() => router.navigate('/a')).not.toThrow()
    expect(router.location().pathname).toBe('/a')
    // Let the rejection settle; the .catch in startViewTransition handles it, so
    // vitest's unhandled-rejection guard stays silent.
    await new Promise((resolve) => setTimeout(resolve, 0))
    router.dispose()
  })
})
