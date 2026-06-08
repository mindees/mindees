import { afterEach, describe, expect, it } from 'vitest'
import { getEnvironment, setEnvironment } from './environment'
import { connectWebEnvironment, type WebEnvWindow } from './web-environment'

// Reset the shared environment signals after each test (they're module-global).
afterEach(() =>
  setEnvironment({
    window: { width: 0, height: 0, scale: 1, fontScale: 1 },
    colorScheme: 'light',
    safeAreaInsets: { top: 0, right: 0, bottom: 0, left: 0 },
    keyboard: { visible: false, height: 0 },
    reducedMotion: false,
  }),
)

interface FakeWindow extends WebEnvWindow {
  fire(type: string): void
}

function makeWindow(opts: { vvHeight?: number } = {}): FakeWindow {
  const winListeners = new Map<string, Set<() => void>>()
  const add = (m: Map<string, Set<() => void>>, t: string, l: () => void) =>
    (m.get(t) ?? m.set(t, new Set()).get(t) ?? new Set()).add(l)
  return {
    innerWidth: 390,
    innerHeight: 844,
    devicePixelRatio: 3,
    visualViewport: {
      height: opts.vvHeight ?? 844,
      offsetTop: 0,
      addEventListener: () => {},
      removeEventListener: () => {},
    },
    document: {
      body: { appendChild: () => {} },
      createElement: () => ({ style: { cssText: '' }, remove() {} }),
    },
    matchMedia: (q: string) => ({
      matches: q.includes('dark') || q.includes('reduce'),
      addEventListener: () => {},
      removeEventListener: () => {},
    }),
    getComputedStyle: () => ({
      getPropertyValue: (p: string) =>
        p === 'padding-top' ? '47px' : p === 'padding-bottom' ? '34px' : '0px',
    }),
    addEventListener: (t: string, l: () => void) => add(winListeners, t, l),
    removeEventListener: (t: string, l: () => void) => winListeners.get(t)?.delete(l),
    fire: (t: string) => {
      for (const l of winListeners.get(t) ?? []) l()
    },
  }
}

describe('connectWebEnvironment', () => {
  it('wires color scheme, reduced-motion, dimensions, and safe-area from the browser', () => {
    const win = makeWindow()
    const disconnect = connectWebEnvironment(win)
    const env = getEnvironment()
    expect(env.colorScheme).toBe('dark')
    expect(env.reducedMotion).toBe(true)
    expect(env.window).toEqual({ width: 390, height: 844, scale: 3, fontScale: 1 })
    expect(env.safeAreaInsets).toEqual({ top: 47, right: 0, bottom: 34, left: 0 })
    disconnect()
  })

  it('derives keyboard height from a shrunken visual viewport', () => {
    const win = makeWindow({ vvHeight: 600 }) // 844 - 600 = 244px keyboard
    const disconnect = connectWebEnvironment(win)
    expect(getEnvironment().keyboard).toEqual({ visible: true, height: 244 })
    disconnect()
  })

  it('stops updating after disconnect()', () => {
    const win = makeWindow()
    const disconnect = connectWebEnvironment(win)
    disconnect()
    setEnvironment({ window: { width: 1, height: 1, scale: 1, fontScale: 1 } }) // sentinel
    win.fire('resize') // listener should be gone → no overwrite
    expect(getEnvironment().window).toEqual({ width: 1, height: 1, scale: 1, fontScale: 1 })
  })

  it('is a no-op without a DOM (SSR-safe)', () => {
    const disconnect = connectWebEnvironment(undefined)
    expect(typeof disconnect).toBe('function')
    expect(getEnvironment().window).toEqual({ width: 0, height: 0, scale: 1, fontScale: 1 })
    disconnect()
  })
})
