/**
 * The example app's **real** UI — a multi-screen, TypeScript-only MindeesNative app
 * with @mindees/* end to end:
 *
 * - @mindees/core         signals + component model
 * - @mindees/atlas        UI primitives (View/Text/Button/Column/Row)
 * - @mindees/router       Quantum router: in-memory history, programmatic navigation
 * - @mindees/renderer     Helix reconciler → native command stream
 *
 * The router's `createRouterView` produces a backend-agnostic node; we render it
 * through `createNativeCommandBackend`, so navigating between routes drives the
 * native host to swap real Android view subtrees. A signal mutated from a button
 * re-runs only the affected nodes (fine-grained reactivity). No DOM, no browser
 * globals — it runs in the embedded QuickJS engine.
 *
 * Bundled to a QuickJS-safe IIFE (see ../tsdown.config.ts) and loaded from assets.
 * Regenerate with `pnpm run build:android-example-js` from the repo root.
 *
 * @module
 */

import { Button, Column, Row, Text } from '@mindees/atlas'
import { createElement as h, signal } from '@mindees/core'
import { createNativeCommandBackend, render } from '@mindees/renderer'
import { createMemoryHistory, createRouter, createRouterView } from '@mindees/router'

/** Must match the host's pre-registered root id (see MainActivity.HOST_ROOT_ID). */
const HOST_ROOT_ID = 'host-root'

/** The host bridge injected as a QuickJS global (see QuickJsMindeesRuntime). */
declare const MindeesHost: { emit(json: string): void }

const backend = createNativeCommandBackend({ rootId: HOST_ROOT_ID })

/** Send any buffered commands to the native host as one JSON batch. */
function flush(): void {
  const batch = backend.flushCommands()
  if (batch.length > 0) MindeesHost.emit(JSON.stringify(batch))
}

const palette = {
  screenBg: '#0b1021',
  cardBg: '#171c33',
  accent: '#5b8cff',
  accentText: '#ffffff',
  slateBg: '#2a3050',
  heading: '#e8ecff',
  muted: '#9aa4d2',
  body: '#c3cbf0',
}

const cardStyle = {
  backgroundColor: palette.cardBg,
  padding: 28,
  gap: 14,
  borderRadius: 20,
  alignItems: 'center',
  minWidth: 280,
} as const

const headingStyle = { fontSize: 24, fontWeight: 800, color: palette.heading } as const

const buttonBase = {
  color: palette.accentText,
  paddingTop: 12,
  paddingBottom: 12,
  paddingLeft: 20,
  paddingRight: 20,
  borderRadius: 12,
  fontWeight: 600,
} as const
const accentButton = { ...buttonBase, backgroundColor: palette.accent } as const
const slateButton = { ...buttonBase, backgroundColor: palette.slateBg } as const

/** App-level state survives navigation (module-scoped signal). */
const done = signal(0)

/** Home route — a counter + a link to the About route. */
function Home() {
  return h(
    Column,
    { style: cardStyle },
    h(Text, { style: headingStyle }, 'MindeesNative'),
    h(
      Text,
      { style: { fontSize: 15, color: palette.muted } },
      'Multi-screen · native · TypeScript',
    ),
    h(
      Text,
      { style: { fontSize: 36, fontWeight: 800, color: palette.accent, paddingTop: 6 } },
      () => `Done today: ${done()}`,
    ),
    h(
      Row,
      { style: { gap: 12, justifyContent: 'center', paddingTop: 8 } },
      h(Button, { title: 'Mark done', onPress: () => done.set(done() + 1), style: accentButton }),
      h(Button, { title: 'About →', onPress: () => router.navigate('/about'), style: slateButton }),
    ),
  )
}

/** About route — descriptive copy + a link back Home, proving real navigation. */
function About() {
  return h(
    Column,
    { style: cardStyle },
    h(Text, { style: headingStyle }, 'About'),
    h(
      Text,
      {
        style: { fontSize: 15, color: palette.body, textAlign: 'center', lineHeight: 22 },
      },
      'Real Atlas components, rendered as native Android views and navigated by the Quantum router — all TypeScript, running in an embedded engine.',
    ),
    h(Button, { title: '← Home', onPress: () => router.navigate('/'), style: accentButton }),
  )
}

const router = createRouter({
  routes: [
    { path: '/', component: Home },
    { path: '/about', component: About },
  ],
  history: createMemoryHistory({ initialEntries: ['/'] }),
})

/** Full-screen shell: dark background, centers the active route's card. */
function App() {
  return h(
    Column,
    {
      style: {
        flexGrow: 1,
        width: '100%',
        padding: 24,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: palette.screenBg,
      },
    },
    createRouterView(router),
  )
}

/** The contract the native runtime calls: `start()` once, then `dispatchEvent` per native event. */
const api = {
  start(): void {
    render(h(App, null), backend, backend.root)
    flush()
  },
  dispatchEvent(handlerId: string): void {
    // Runs the registered handler (mutates a signal or calls router.navigate); the
    // reconciler emits the resulting command batch synchronously, which we then flush.
    backend.dispatchEvent(handlerId)
    flush()
  },
}

;(globalThis as unknown as { MindeesApp: typeof api }).MindeesApp = api
