/**
 * Home route — `app/index.tsx` maps to `/` (file-based routing). Themed via design
 * tokens (`useTheme`), so it re-themes light↔dark with the device color scheme.
 *
 * @module
 */

import {
  Button,
  Card,
  fontSize,
  Row,
  space,
  Text,
  useColorScheme,
  useTheme,
  useWindowDimensions,
} from '@mindees/atlas'
import { signal } from '@mindees/core'
import { useRouter } from '@mindees/router'
import { buttonShape } from '../theme'

/** Module-scoped state survives navigation. */
const done = signal(0)

export default function Home() {
  const router = useRouter()
  const theme = useTheme()
  const dimensions = useWindowDimensions()
  const colorScheme = useColorScheme()
  return (
    <Card style={{ minWidth: 300, gap: space.md, alignItems: 'center' }}>
      <Text
        style={() => ({ fontSize: fontSize.title2, fontWeight: 800, color: theme().color.text })}
      >
        MindeesNative
      </Text>
      <Text style={() => ({ fontSize: fontSize.footnote, color: theme().color.textMuted })}>
        File-based routing · native · TypeScript
      </Text>
      <Text style={() => ({ fontSize: 36, fontWeight: 800, color: theme().color.primary })}>
        {() => `Done today: ${done()}`}
      </Text>
      <Row style={{ gap: space.sm, justifyContent: 'center' }}>
        <Button
          title="Mark done"
          onPress={() => done.set(done() + 1)}
          style={() => ({
            ...buttonShape,
            backgroundColor: theme().color.primary,
            color: theme().color.onPrimary,
          })}
        />
        <Button
          title="About →"
          onPress={() => router.navigate('/about')}
          style={() => ({
            ...buttonShape,
            backgroundColor: theme().color.surfaceVariant,
            color: theme().color.text,
          })}
        />
      </Row>
      <Text style={() => ({ fontSize: fontSize.footnote, color: theme().color.textMuted })}>
        {() =>
          `Screen ${Math.round(dimensions().width)}×${Math.round(dimensions().height)} · ${colorScheme()}`
        }
      </Text>
    </Card>
  )
}
