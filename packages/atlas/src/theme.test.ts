import { createRoot, effect } from '@mindees/core'
import { describe, expect, it } from 'vitest'
import { createTheme, defaultTokens } from './theme'

describe('createTheme', () => {
  it('uses defaults when nothing is passed', () => {
    const theme = createTheme()
    expect(theme.peek()).toEqual(defaultTokens)
  })

  it('deep-merges color overrides without dropping the rest', () => {
    const theme = createTheme({ colors: { primary: '#7c3aed' } })
    const tokens = theme.peek()
    expect(tokens.colors.primary).toBe('#7c3aed')
    expect(tokens.colors.background).toBe(defaultTokens.colors.background) // siblings preserved
    expect(tokens.space).toEqual(defaultTokens.space) // unrelated group preserved
  })

  it('replaces the space array wholesale when overridden', () => {
    const theme = createTheme({ space: [0, 2, 4] })
    expect(theme.peek().space).toEqual([0, 2, 4])
  })

  it('select() is isolated — an unrelated change does not re-run a different slice', () => {
    createRoot((dispose) => {
      const theme = createTheme()
      const primary = theme.select((t) => t.colors.primary)
      let runs = 0
      effect(() => {
        primary()
        runs++
      })
      expect(runs).toBe(1)
      // Change an unrelated slice (background); the primary selector must not re-run.
      theme.set({ ...defaultTokens, colors: { ...defaultTokens.colors, background: '#000000' } })
      expect(primary()).toBe(defaultTokens.colors.primary)
      expect(runs).toBe(1)
      dispose()
    })
  })
})
