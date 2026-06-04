import { createRoot, effect } from '@mindees/core'
import { describe, expect, it } from 'vitest'
import {
  getEnvironment,
  setEnvironment,
  useColorScheme,
  useKeyboard,
  useSafeAreaInsets,
  useWindowDimensions,
} from './environment'

describe('platform environment + device hooks', () => {
  it('starts with sane defaults', () => {
    const env = getEnvironment()
    expect(env.colorScheme).toBe('light')
    expect(env.window).toEqual({ width: 0, height: 0, scale: 1, fontScale: 1 })
    expect(env.safeAreaInsets).toEqual({ top: 0, right: 0, bottom: 0, left: 0 })
    expect(env.keyboard).toEqual({ visible: false, height: 0 })
  })

  it('useWindowDimensions / useColorScheme reflect setEnvironment', () => {
    setEnvironment({
      window: { width: 412, height: 915, scale: 2.625, fontScale: 1 },
      colorScheme: 'dark',
    })
    expect(useWindowDimensions()()).toEqual({ width: 412, height: 915, scale: 2.625, fontScale: 1 })
    expect(useColorScheme()()).toBe('dark')
  })

  it('updates are partial — unset fields are preserved', () => {
    setEnvironment({ safeAreaInsets: { top: 24, right: 0, bottom: 48, left: 0 } })
    expect(useSafeAreaInsets()()).toEqual({ top: 24, right: 0, bottom: 48, left: 0 })
    // colorScheme set 'dark' previously stays 'dark'
    expect(useColorScheme()()).toBe('dark')
  })

  it('hooks are fine-grained: only readers of a changed field re-run', () => {
    createRoot((dispose) => {
      const colorScheme = useColorScheme()
      const keyboard = useKeyboard()
      let colorRuns = 0
      let keyboardRuns = 0
      effect(() => {
        colorScheme()
        colorRuns++
      })
      effect(() => {
        keyboard()
        keyboardRuns++
      })
      expect(colorRuns).toBe(1)
      expect(keyboardRuns).toBe(1)

      // Change only the keyboard: the colorScheme effect must NOT re-run.
      setEnvironment({ keyboard: { visible: true, height: 320 } })
      expect(keyboardRuns).toBe(2)
      expect(colorRuns).toBe(1)

      // Change only colorScheme: the keyboard effect must NOT re-run.
      setEnvironment({ colorScheme: 'light' })
      expect(colorRuns).toBe(2)
      expect(keyboardRuns).toBe(2)
      dispose()
    })
  })
})
