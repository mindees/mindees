/**
 * The example app — written the way an app author writes MindeesNative: plain TSX,
 * `@mindees/*` only, no `createElement` imports, no renderer/host plumbing.
 *
 * - JSX via the automatic runtime (`jsxImportSource: "@mindees/core"`, see tsconfig)
 * - @mindees/atlas primitives, @mindees/core signals
 * - @mindees/router (Quantum) for Home ⇄ About navigation
 *
 * The entry that mounts this (main.tsx) is three lines thanks to `createNativeApp`.
 *
 * @module
 */

import { Button, Column, Row, Text } from '@mindees/atlas'
import { signal } from '@mindees/core'
import { createMemoryHistory, createRouter, createRouterView } from '@mindees/router'

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
  return (
    <Column style={cardStyle}>
      <Text style={headingStyle}>MindeesNative</Text>
      <Text style={{ fontSize: 15, color: palette.muted }}>Multi-screen · native · TypeScript</Text>
      <Text style={{ fontSize: 36, fontWeight: 800, color: palette.accent, paddingTop: 6 }}>
        {() => `Done today: ${done()}`}
      </Text>
      <Row style={{ gap: 12, justifyContent: 'center', paddingTop: 8 }}>
        <Button title="Mark done" onPress={() => done.set(done() + 1)} style={accentButton} />
        <Button title="About →" onPress={() => router.navigate('/about')} style={slateButton} />
      </Row>
    </Column>
  )
}

/** About route — descriptive copy + a link back Home, proving real navigation. */
function About() {
  return (
    <Column style={cardStyle}>
      <Text style={headingStyle}>About</Text>
      <Text style={{ fontSize: 15, color: palette.body, textAlign: 'center', lineHeight: 22 }}>
        Real Atlas components, rendered as native Android views and navigated by the Quantum router
        — all TypeScript, running in an embedded engine.
      </Text>
      <Button title="← Home" onPress={() => router.navigate('/')} style={accentButton} />
    </Column>
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
export function App() {
  return (
    <Column
      style={{
        flexGrow: 1,
        width: '100%',
        padding: 24,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: palette.screenBg,
      }}
    >
      {createRouterView(router)}
    </Column>
  )
}
