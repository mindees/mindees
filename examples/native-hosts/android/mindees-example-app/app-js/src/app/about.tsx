/**
 * About route — `app/about.tsx` maps to `/about`. Showcases Atlas components
 * (Card, Badge, Divider, Switch, ProgressBar) + design-token theming: the Switch
 * toggles the device color scheme, so the whole UI re-themes light↔dark.
 *
 * @module
 */

import {
  ActivityIndicator,
  Badge,
  Button,
  Card,
  Divider,
  fontSize,
  ProgressBar,
  Row,
  Switch,
  setEnvironment,
  space,
  Text,
  useColorScheme,
  useTheme,
} from '@mindees/atlas'
import { useRouter } from '@mindees/router'
import { buttonShape } from '../theme'

export default function About() {
  const router = useRouter()
  const theme = useTheme()
  const colorScheme = useColorScheme()
  return (
    <Card variant="filled" style={{ minWidth: 300, gap: space.md, alignItems: 'stretch' }}>
      <Row style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <Text
          style={() => ({ fontSize: fontSize.title2, fontWeight: 800, color: theme().color.text })}
        >
          About
        </Text>
        <Badge tone="info">v0.1.0</Badge>
      </Row>
      <Divider />
      <Text
        style={() => ({ fontSize: fontSize.body, color: theme().color.textMuted, lineHeight: 22 })}
      >
        File-based routes navigated by the Quantum router via the useRouter hook — built from themed
        Atlas components, all TypeScript, running native in an embedded engine.
      </Text>
      <Row style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={() => ({ fontSize: fontSize.body, color: theme().color.text })}>
          Dark mode
        </Text>
        <Switch
          value={() => colorScheme() === 'dark'}
          onValueChange={(v) => setEnvironment({ colorScheme: v ? 'dark' : 'light' })}
          label="Dark mode"
        />
      </Row>
      <Row style={{ gap: space.sm, alignItems: 'center' }}>
        <ActivityIndicator size={20} />
        <Text style={() => ({ fontSize: fontSize.footnote, color: theme().color.textMuted })}>
          Syncing…
        </Text>
      </Row>
      <ProgressBar value={0.6} />
      <Button
        title="← Home"
        onPress={() => router.navigate('/')}
        style={() => ({
          ...buttonShape,
          backgroundColor: theme().color.primary,
          color: theme().color.onPrimary,
        })}
      />
    </Card>
  )
}
