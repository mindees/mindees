/**
 * Platform environment + device hooks — the signal-backed equivalents of React
 * Native's `useWindowDimensions`, `useColorScheme`, `useSafeAreaInsets`, `Keyboard`.
 *
 * The environment is a small set of signals the host/runtime feeds via
 * {@link setEnvironment} (e.g. the native host on launch/rotation/theme change, or a
 * web adapter wired to `window`/`matchMedia`). The hooks return Quantum-style reactive
 * **accessors**, so reads are fine-grained — only the nodes that use a value re-run
 * when it changes (e.g. rotating the device updates exactly the layout that reads
 * window size), with no whole-tree re-render.
 *
 * @module
 */

import { signal } from '@mindees/core'

/** Logical window size + density (RN's `useWindowDimensions`). */
export interface WindowDimensions {
  /** Logical width (dp/pt). */
  readonly width: number
  /** Logical height (dp/pt). */
  readonly height: number
  /** Device pixel ratio. */
  readonly scale: number
  /** User font-scaling factor (Dynamic Type / font size setting). */
  readonly fontScale: number
}

/** Safe-area insets in dp/pt (notch, status bar, home indicator, gesture areas). */
export interface SafeAreaInsets {
  readonly top: number
  readonly right: number
  readonly bottom: number
  readonly left: number
}

/** Soft-keyboard state. */
export interface KeyboardState {
  readonly visible: boolean
  /** Keyboard height in dp/pt when visible, else 0. */
  readonly height: number
}

/** The active color scheme (RN's `useColorScheme`). */
export type ColorScheme = 'light' | 'dark'

/** The full platform environment. */
export interface PlatformEnvironment {
  readonly window: WindowDimensions
  readonly colorScheme: ColorScheme
  readonly safeAreaInsets: SafeAreaInsets
  readonly keyboard: KeyboardState
  /** Whether the user prefers reduced motion (OS accessibility setting / `prefers-reduced-motion`). */
  readonly reducedMotion: boolean
}

const windowSignal = signal<WindowDimensions>({ width: 0, height: 0, scale: 1, fontScale: 1 })
const colorSchemeSignal = signal<ColorScheme>('light')
const safeAreaSignal = signal<SafeAreaInsets>({ top: 0, right: 0, bottom: 0, left: 0 })
const keyboardSignal = signal<KeyboardState>({ visible: false, height: 0 })
const reducedMotionSignal = signal<boolean>(false)

/**
 * Update the platform environment. The host/runtime calls this — once on launch and
 * again on changes (rotation, theme switch, keyboard show/hide). Only provided fields
 * change; each is a fine-grained signal write, so only the readers of that field re-run.
 */
export function setEnvironment(env: Partial<PlatformEnvironment>): void {
  if (env.window) windowSignal.set(env.window)
  if (env.colorScheme) colorSchemeSignal.set(env.colorScheme)
  if (env.safeAreaInsets) safeAreaSignal.set(env.safeAreaInsets)
  if (env.keyboard) keyboardSignal.set(env.keyboard)
  if (env.reducedMotion !== undefined) reducedMotionSignal.set(env.reducedMotion)
}

/** A snapshot of the current environment (non-reactive; for one-off reads). */
export function getEnvironment(): PlatformEnvironment {
  return {
    window: windowSignal(),
    colorScheme: colorSchemeSignal(),
    safeAreaInsets: safeAreaSignal(),
    keyboard: keyboardSignal(),
    reducedMotion: reducedMotionSignal(),
  }
}

/** Reactive accessor for the window dimensions (updates on resize/rotation). */
export function useWindowDimensions(): () => WindowDimensions {
  return windowSignal
}

/** Reactive accessor for the active color scheme (updates on theme change). */
export function useColorScheme(): () => ColorScheme {
  return colorSchemeSignal
}

/** Reactive accessor for the safe-area insets. */
export function useSafeAreaInsets(): () => SafeAreaInsets {
  return safeAreaSignal
}

/** Reactive accessor for the soft-keyboard state. */
export function useKeyboard(): () => KeyboardState {
  return keyboardSignal
}

/**
 * Reactive accessor for the user's reduced-motion preference (a11y). Honor it by skipping/shortening
 * animations — e.g. `timing(x, { to, duration: useReducedMotion()() ? 0 : 250 })`.
 */
export function useReducedMotion(): () => boolean {
  return reducedMotionSignal
}
