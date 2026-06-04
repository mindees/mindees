/**
 * Home route — `app/index.tsx` maps to `/` (file-based routing). The default export
 * is the screen; `useRouter()` resolves the active router with no prop-drilling.
 *
 * @module
 */

import { Button, Column, Row, Text } from '@mindees/atlas'
import { signal } from '@mindees/core'
import { useRouter } from '@mindees/router'
import { accentButton, cardStyle, headingStyle, palette, slateButton } from '../theme'

/** Module-scoped state survives navigation. */
const done = signal(0)

export default function Home() {
  const router = useRouter()
  return (
    <Column style={cardStyle}>
      <Text style={headingStyle}>MindeesNative</Text>
      <Text style={{ fontSize: 15, color: palette.muted }}>
        File-based routing · native · TypeScript
      </Text>
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
