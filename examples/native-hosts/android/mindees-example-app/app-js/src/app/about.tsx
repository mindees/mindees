/**
 * About route — `app/about.tsx` maps to `/about`. Navigates back with `useRouter()`.
 *
 * @module
 */

import { Button, Column, Text } from '@mindees/atlas'
import { useRouter } from '@mindees/router'
import { accentButton, cardStyle, headingStyle, palette } from '../theme'

export default function About() {
  const router = useRouter()
  return (
    <Column style={cardStyle}>
      <Text style={headingStyle}>About</Text>
      <Text style={{ fontSize: 15, color: palette.body, textAlign: 'center', lineHeight: 22 }}>
        File-based routes (app/index.tsx, app/about.tsx) navigated by the Quantum router via the
        useRouter hook — all TypeScript, running native in an embedded engine.
      </Text>
      <Button title="← Home" onPress={() => router.navigate('/')} style={accentButton} />
    </Column>
  )
}
