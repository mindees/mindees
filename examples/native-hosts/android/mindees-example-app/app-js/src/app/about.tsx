/**
 * About route — `app/about.tsx` maps to `/about`. Showcases Atlas components
 * (Card, Badge, Divider, Switch, ProgressBar) and navigates back with `useRouter()`.
 *
 * @module
 */

import { Badge, Button, Card, Divider, ProgressBar, Row, Switch, Text } from '@mindees/atlas'
import { signal } from '@mindees/core'
import { useRouter } from '@mindees/router'
import { accentButton, headingStyle, palette } from '../theme'

const notifications = signal(true)

export default function About() {
  const router = useRouter()
  return (
    <Card variant="filled" style={{ minWidth: 300, gap: 14, alignItems: 'stretch' }}>
      <Row style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={headingStyle}>About</Text>
        <Badge tone="info">v0.1.0</Badge>
      </Row>
      <Divider />
      <Text style={{ fontSize: 15, color: palette.body, lineHeight: 22 }}>
        File-based routes navigated by the Quantum router via the useRouter hook — built from Atlas
        components, all TypeScript, running native in an embedded engine.
      </Text>
      <Row style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={{ fontSize: 15, color: palette.body }}>Notifications</Text>
        <Switch
          value={notifications}
          onValueChange={(v) => notifications.set(v)}
          label="Notifications"
        />
      </Row>
      <ProgressBar value={0.6} />
      <Button title="← Home" onPress={() => router.navigate('/')} style={accentButton} />
    </Card>
  )
}
