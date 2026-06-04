/**
 * Design tokens + theming — the 2026-UI/UX-handbook token layer (§7–24, §31).
 *
 * Two tiers (the recommended default): **primitive** scales (raw `space`/`radius`/type/
 * motion/color values) and **semantic** tokens (a {@link Theme}: `bg`/`surface`/`text`/
 * `primary`/…) that carry intent. Dark mode is a **token-set swap** (§23/§31): the same
 * semantic names resolve to different primitives. {@link useTheme} returns a reactive theme
 * driven by {@link useColorScheme}, so themed UI re-themes light↔dark fine-grained — only
 * the color nodes update.
 *
 * @module
 */

import { type ColorScheme, useColorScheme } from './environment'

// --- Primitive scales --------------------------------------------------------

/** Spacing scale — 8pt system with 4 as the half-step (handbook §8). */
export const space = {
  none: 0,
  '3xs': 2,
  '2xs': 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 24,
  xl: 32,
  '2xl': 48,
  '3xl': 64,
} as const

/** Corner-radius scale (handbook §19). */
export const radius = {
  none: 0,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  '2xl': 28,
  full: 9999,
} as const

/** Type scale (≈1.25 ratio, base 16) — handbook §9. */
export const fontSize = {
  caption: 12,
  footnote: 13,
  body: 16,
  callout: 17,
  headline: 20,
  title3: 25,
  title2: 31,
  title1: 39,
  display: 49,
} as const

/** Line-height (leading) ratios (handbook §9). */
export const lineHeight = { tight: 1.2, snug: 1.3, normal: 1.5, relaxed: 1.6 } as const

/** Font weights (handbook §9 — regular + semibold/bold do most of the work). */
export const fontWeight = {
  regular: 400,
  medium: 500,
  semibold: 600,
  bold: 700,
  heavy: 800,
} as const

/** Motion durations in ms (handbook §21: micro/standard/large). */
export const duration = { micro: 150, standard: 250, large: 400 } as const

/** Easing curves (handbook §21: ease-out for enter, ease-in for exit). */
export const easing = {
  standard: 'cubic-bezier(0.2, 0, 0, 1)',
  decelerate: 'cubic-bezier(0, 0, 0, 1)',
  accelerate: 'cubic-bezier(0.3, 0, 1, 1)',
} as const

/** Raw color ramps (primitive tier — never apply directly; go through a {@link Theme}). */
export const palette = {
  white: '#ffffff',
  black: '#000000',
  neutral: {
    50: '#f8fafc',
    100: '#f1f5f9',
    200: '#e2e8f0',
    300: '#cbd5e1',
    400: '#94a3b8',
    500: '#64748b',
    600: '#475569',
    700: '#334155',
    800: '#1e293b',
    900: '#0f172a',
    950: '#020617',
  },
  blue: { 400: '#60a5fa', 500: '#3b82f6', 600: '#2563eb', 700: '#1d4ed8' },
  green: { 400: '#4ade80', 500: '#22c55e', 600: '#16a34a', 700: '#15803d' },
  amber: { 400: '#fbbf24', 500: '#f59e0b', 600: '#d97706', 700: '#b45309' },
  red: { 400: '#f87171', 500: '#ef4444', 600: '#dc2626', 700: '#b91c1c' },
} as const

/** Non-color scales, grouped for convenience. */
export const tokens = { space, radius, fontSize, lineHeight, fontWeight, duration, easing } as const

// --- Semantic tier (themes) --------------------------------------------------

/** Semantic color roles (handbook §10/§31) — the layer components and apps consume. */
export interface ThemeColors {
  /** App background. */
  readonly bg: string
  /** Default surface (cards, sheets). */
  readonly surface: string
  /** A raised/recessed surface variant. */
  readonly surfaceVariant: string
  /** High-emphasis text. */
  readonly text: string
  /** Secondary/muted text. */
  readonly textMuted: string
  /** Hairline borders/dividers. */
  readonly border: string
  /** Brand/primary action. */
  readonly primary: string
  /** Foreground on `primary`. */
  readonly onPrimary: string
  readonly success: string
  readonly warning: string
  readonly danger: string
  readonly info: string
  /** Foreground on the semantic tone colors. */
  readonly onTone: string
}

/** A resolved theme: a color scheme + its semantic colors. */
export interface Theme {
  readonly colorScheme: ColorScheme
  readonly color: ThemeColors
}

const lightTheme: Theme = {
  colorScheme: 'light',
  color: {
    bg: palette.neutral[50],
    surface: palette.white,
    surfaceVariant: palette.neutral[100],
    text: palette.neutral[900],
    textMuted: palette.neutral[500],
    border: palette.neutral[200],
    primary: palette.blue[600],
    onPrimary: palette.white,
    // -700 tones carry white at ≥4.5:1 (handbook §11).
    success: palette.green[700],
    warning: palette.amber[700],
    danger: palette.red[700],
    info: palette.blue[700],
    onTone: palette.white,
  },
}

const darkTheme: Theme = {
  colorScheme: 'dark',
  color: {
    // Not pure black (handbook §23); surfaces get lighter with elevation.
    bg: palette.neutral[950],
    surface: palette.neutral[900],
    surfaceVariant: palette.neutral[800],
    text: palette.neutral[50],
    textMuted: palette.neutral[400],
    border: palette.neutral[700],
    primary: palette.blue[500],
    onPrimary: palette.white,
    // Brighter tones in dark mode; dark text reads on them (handbook §23 desaturate/contrast).
    success: palette.green[400],
    warning: palette.amber[400],
    danger: palette.red[400],
    info: palette.blue[400],
    onTone: palette.neutral[950],
  },
}

/** The theme for a given color scheme (non-reactive). */
export function getTheme(colorScheme: ColorScheme): Theme {
  return colorScheme === 'dark' ? darkTheme : lightTheme
}

/**
 * The active theme as a reactive accessor — flips light↔dark with
 * {@link useColorScheme}. Use it in accessor styles so dark mode is an automatic,
 * fine-grained token swap (only color nodes re-run).
 *
 * @example
 * const theme = useTheme()
 * <View style={() => ({ backgroundColor: theme().color.surface })} />
 */
export function useTheme(): () => Theme {
  const colorScheme = useColorScheme()
  return () => getTheme(colorScheme())
}
