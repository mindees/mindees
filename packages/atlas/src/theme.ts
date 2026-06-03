/**
 * Atlas theming — a structural `ThemeTokens` interface + a minimal `defaultTokens`, consumed
 * through a `@mindees/core` selector-isolated context. Atlas takes **no dependency** on any
 * tokens package (the user's published `@mindees/tokens` can satisfy `ThemeTokens` and be
 * injected by the app); a component that selects one slice (`t => t.colors.primary`) only
 * re-runs when that slice changes. See `docs/adr/0022-atlas-primitives.md`.
 *
 * @module
 */

import { type Context, type ContextProvider, createContext, createProvider } from '@mindees/core'

/** A design-token theme. External token packages can satisfy this shape. */
export interface ThemeTokens {
  readonly colors: {
    readonly background: string
    readonly surface: string
    readonly text: string
    readonly textMuted: string
    readonly primary: string
    readonly onPrimary: string
    readonly border: string
    readonly danger: string
  }
  /** Spacing scale (px), index 0 = none. */
  readonly space: readonly number[]
  readonly radii: {
    readonly sm: number
    readonly md: number
    readonly lg: number
    readonly full: number
  }
  readonly fontSizes: {
    readonly sm: number
    readonly md: number
    readonly lg: number
    readonly xl: number
  }
  readonly fontWeights: { readonly regular: number; readonly medium: number; readonly bold: number }
}

/** A sensible, neutral default theme so Atlas works standalone. */
export const defaultTokens: ThemeTokens = {
  colors: {
    background: '#ffffff',
    surface: '#f5f5f5',
    text: '#111827',
    textMuted: '#6b7280',
    primary: '#2563eb',
    onPrimary: '#ffffff',
    border: '#e5e7eb',
    danger: '#dc2626',
  },
  space: [0, 4, 8, 12, 16, 24, 32, 48, 64],
  radii: { sm: 4, md: 8, lg: 16, full: 9999 },
  fontSizes: { sm: 12, md: 14, lg: 18, xl: 24 },
  fontWeights: { regular: 400, medium: 500, bold: 700 },
}

/** The Atlas theme context (defaults to {@link defaultTokens}). */
export const ThemeContext: Context<ThemeTokens> = createContext(defaultTokens)

/** Deep-merge (one level) token overrides onto the defaults. */
function mergeTokens(overrides: DeepPartial<ThemeTokens>): ThemeTokens {
  return {
    colors: { ...defaultTokens.colors, ...overrides.colors },
    space: overrides.space ?? defaultTokens.space,
    radii: { ...defaultTokens.radii, ...overrides.radii },
    fontSizes: { ...defaultTokens.fontSizes, ...overrides.fontSizes },
    fontWeights: { ...defaultTokens.fontWeights, ...overrides.fontWeights },
  }
}

/** One-level-deep partial of the token groups (arrays are replaced wholesale, not deep-partialed). */
type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends ReadonlyArray<unknown>
    ? T[K]
    : T[K] extends object
      ? Partial<T[K]>
      : T[K]
}

/**
 * Create a theme provider. Pass partial overrides (deep-merged one level onto the defaults) or
 * nothing for the defaults. Use `.select(t => …)` for a reactive, isolated token accessor that
 * a primitive consumes as a `Reactive<StyleObject>`.
 *
 * @example
 * const theme = createTheme({ colors: { primary: '#7c3aed' } })
 * const accent = theme.select((t) => t.colors.primary)
 */
export function createTheme(
  overrides: DeepPartial<ThemeTokens> = {},
): ContextProvider<ThemeTokens> {
  return createProvider(ThemeContext, mergeTokens(overrides))
}
