/**
 * Web adapter for the platform environment.
 *
 * Wires the browser's live signals — color scheme, reduced motion, window size, the soft keyboard (via
 * `visualViewport`), and CSS `env(safe-area-inset-*)` — into {@link setEnvironment}, so the device hooks
 * (`useColorScheme`, `useWindowDimensions`, `useSafeAreaInsets`, `useKeyboard`, `useReducedMotion`) are
 * LIVE on the web target with zero configuration. Without this, those signals keep their inert defaults
 * (0×0, light, no insets, keyboard hidden) on web.
 *
 * SSR-safe: a no-op when there is no DOM. Call once at startup — the `create` template wires it into
 * `main.tsx`. Returns a `disconnect()` that removes every listener and the probe element.
 *
 * @module
 */

import { setEnvironment } from './environment'

// Minimal STRUCTURAL views of the DOM we touch — so this package needs no `lib.dom` in its types and
// stays platform-neutral. A real `Window` satisfies these shapes.
interface MediaQueryLike {
  readonly matches: boolean
  addEventListener(type: 'change', listener: () => void): void
  removeEventListener(type: 'change', listener: () => void): void
}
interface VisualViewportLike {
  readonly height: number
  readonly offsetTop: number
  addEventListener(type: string, listener: () => void): void
  removeEventListener(type: string, listener: () => void): void
}
interface ProbeLike {
  style: { cssText: string }
  remove(): void
}
interface DocumentLike {
  body: { appendChild(node: ProbeLike): void } | null
  createElement(tag: string): ProbeLike
}
/** The subset of `Window` the adapter uses. */
export interface WebEnvWindow {
  readonly innerWidth: number
  readonly innerHeight: number
  readonly devicePixelRatio?: number
  readonly visualViewport?: VisualViewportLike | null
  readonly document?: DocumentLike
  matchMedia(query: string): MediaQueryLike
  getComputedStyle?(el: ProbeLike): { getPropertyValue(prop: string): string }
  addEventListener(type: string, listener: () => void): void
  removeEventListener(type: string, listener: () => void): void
}

// Below this the viewport-height delta is browser chrome (URL bar), not a soft keyboard.
const KEYBOARD_THRESHOLD = 80

/**
 * Connect the browser environment to the reactive device hooks. Pass a `window` (defaults to the global).
 * Returns a `disconnect()`.
 */
export function connectWebEnvironment(win?: WebEnvWindow): () => void {
  const w = win ?? (globalThis as unknown as { window?: WebEnvWindow }).window
  if (!w || typeof w.matchMedia !== 'function') return () => {} // SSR / non-DOM → inert

  const cleanups: Array<() => void> = []

  const bindMedia = (query: string, apply: (matches: boolean) => void): void => {
    const mq = w.matchMedia(query)
    const on = (): void => apply(mq.matches)
    on()
    mq.addEventListener('change', on)
    cleanups.push(() => mq.removeEventListener('change', on))
  }
  bindMedia('(prefers-color-scheme: dark)', (m) =>
    setEnvironment({ colorScheme: m ? 'dark' : 'light' }),
  )
  bindMedia('(prefers-reduced-motion: reduce)', (m) => setEnvironment({ reducedMotion: m }))

  const readWindow = (): void =>
    setEnvironment({
      window: {
        width: w.innerWidth,
        height: w.innerHeight,
        scale: w.devicePixelRatio ?? 1,
        fontScale: 1,
      },
    })

  // Safe-area insets: a hidden probe whose padding is `env(safe-area-inset-*)`; read its computed style.
  const doc = w.document
  let probe: ProbeLike | null = null
  if (
    doc?.body &&
    typeof doc.createElement === 'function' &&
    typeof w.getComputedStyle === 'function'
  ) {
    probe = doc.createElement('div')
    probe.style.cssText =
      'position:fixed;visibility:hidden;pointer-events:none;top:0;left:0;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)'
    doc.body.appendChild(probe)
    cleanups.push(() => probe?.remove())
  }
  const readSafeArea = (): void => {
    if (!probe || typeof w.getComputedStyle !== 'function') return
    const cs = w.getComputedStyle(probe)
    const px = (v: string): number => Number.parseFloat(v) || 0
    setEnvironment({
      safeAreaInsets: {
        top: px(cs.getPropertyValue('padding-top')),
        right: px(cs.getPropertyValue('padding-right')),
        bottom: px(cs.getPropertyValue('padding-bottom')),
        left: px(cs.getPropertyValue('padding-left')),
      },
    })
  }

  const vv = w.visualViewport
  const readKeyboard = (): void => {
    if (!vv) return
    const h = Math.max(0, w.innerHeight - vv.height - vv.offsetTop)
    const visible = h > KEYBOARD_THRESHOLD
    setEnvironment({ keyboard: { visible, height: visible ? h : 0 } })
  }

  const onResize = (): void => {
    readWindow()
    readSafeArea()
    readKeyboard()
  }
  onResize() // seed immediately
  w.addEventListener('resize', onResize)
  cleanups.push(() => w.removeEventListener('resize', onResize))

  if (vv) {
    const onViewport = (): void => {
      readKeyboard()
      readSafeArea()
    }
    vv.addEventListener('resize', onViewport)
    vv.addEventListener('scroll', onViewport)
    cleanups.push(() => {
      vv.removeEventListener('resize', onViewport)
      vv.removeEventListener('scroll', onViewport)
    })
  }

  return () => {
    for (const c of cleanups) c()
    cleanups.length = 0
  }
}
