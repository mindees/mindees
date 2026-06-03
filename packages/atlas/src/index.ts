/**
 * `@mindees/atlas` (Atlas) — accessible, signals-native UI primitives. Function components
 * over `@mindees/core`'s `createElement` that return renderer-agnostic `MindeesNode` trees:
 * web rendering is real via the Helix DOM backend; native is a labeled 🔬 research track (the
 * same serializable tree, interpreted by a native host later). A curated cross-platform
 * `StyleObject`, typed accessibility, and a structural theme (on the `@mindees/atlas/theme`
 * subpath). A virtualized recycling `List` (`@mindees/atlas/list`) follows in Phase 12B.
 *
 * @module
 */

import type { Maturity, PackageInfo } from '@mindees/core'
import { NotImplementedError, notImplemented } from '@mindees/core'

/** The npm package name. */
export const name = '@mindees/atlas'

/** The package version. All `@mindees/*` packages share one locked version line. */
export const VERSION = '0.0.0'

/** Current maturity of this package. See the repository `STATUS.md`. */
export const maturity: Maturity = 'experimental'

/** Static identity + maturity metadata for this package. */
export const info: PackageInfo = { name, version: VERSION, maturity }

export { type A11yProps, type A11yState, type Role, toA11yProps } from './a11y'
export { type BaseProps, type Reactive, resolveStyle, toHostProps } from './host'
export {
  Button,
  type ButtonProps,
  Column,
  Image,
  type ImageProps,
  type InteractionState,
  Pressable,
  type PressableProps,
  Row,
  ScrollView,
  type ScrollViewProps,
  Spacer,
  type SpacerProps,
  Stack,
  type StackProps,
  Text,
  TextInput,
  type TextInputProps,
  type TextProps,
  usePressable,
  View,
  type ViewProps,
} from './primitives'
export { flattenStyle, type StyleInput, type StyleObject, type StyleValue } from './style'
export type { Maturity, PackageInfo }
export { NotImplementedError, notImplemented }
