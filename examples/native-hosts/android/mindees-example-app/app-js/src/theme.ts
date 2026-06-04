/** Token-based shape helpers for the example (colors come from `useTheme` per screen). */

import { fontWeight, radius, space } from '@mindees/atlas'

/** Shared button shape (background/foreground colors applied per screen from the theme). */
export const buttonShape = {
  paddingTop: space.sm,
  paddingBottom: space.sm,
  paddingLeft: space.lg,
  paddingRight: space.lg,
  borderRadius: radius.md,
  fontWeight: fontWeight.semibold,
} as const
