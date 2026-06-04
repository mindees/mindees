import { createRoot, isElement } from '@mindees/core'
import { describe, expect, it } from 'vitest'
import { Badge } from './components'
import { setEnvironment } from './environment'
import { duration, fontSize, getTheme, radius, space, tokens, useTheme } from './tokens'

/** Resolve a component's (accessor) style to its object. */
function styleOf(node: unknown): Record<string, unknown> {
  if (!isElement(node)) throw new Error('expected an element')
  const s = node.props.style
  return (typeof s === 'function' ? (s as () => unknown)() : s) as Record<string, unknown>
}

describe('design tokens', () => {
  it('exposes the handbook scales', () => {
    expect(space.md).toBe(16)
    expect(space.xs).toBe(8)
    expect(radius.lg).toBe(16)
    expect(radius.full).toBe(9999)
    expect(fontSize.body).toBe(16)
    expect(duration.standard).toBe(250)
    expect(tokens.space).toBe(space)
  })

  it('getTheme resolves light/dark semantic colors', () => {
    expect(getTheme('light').color.surface).toBe('#ffffff')
    expect(getTheme('light').colorScheme).toBe('light')
    // Dark is not pure black (handbook §23) and surfaces are lighter than bg.
    expect(getTheme('dark').color.bg).toBe('#020617')
    expect(getTheme('dark').color.surface).not.toBe('#000000')
    expect(getTheme('dark').color.text).toBe('#f8fafc')
  })
})

describe('useTheme + dark-mode token swap', () => {
  it('flips reactively with the color scheme', () => {
    createRoot((dispose) => {
      setEnvironment({ colorScheme: 'light' })
      const theme = useTheme()
      expect(theme().colorScheme).toBe('light')
      expect(theme().color.primary).toBe('#2563eb') // blue-600 in light

      setEnvironment({ colorScheme: 'dark' })
      expect(theme().colorScheme).toBe('dark')
      expect(theme().color.primary).toBe('#3b82f6') // blue-500 in dark
      dispose()
    })
    setEnvironment({ colorScheme: 'light' })
  })

  it('components re-theme: a Badge swaps tone color light↔dark', () => {
    setEnvironment({ colorScheme: 'light' })
    const node = Badge({ tone: 'danger', children: '!' })
    expect(styleOf(node).backgroundColor).toBe('#b91c1c') // red-700 (light)

    setEnvironment({ colorScheme: 'dark' })
    expect(styleOf(node).backgroundColor).toBe('#f87171') // red-400 (dark)
    setEnvironment({ colorScheme: 'light' })
  })
})
