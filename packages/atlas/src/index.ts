/**
 * `@mindees/atlas` (Atlas) — accessible, signals-native UI primitives. Function components
 * over `@mindees/core`'s `createElement` that return renderer-agnostic `MindeesNode` trees:
 * web rendering is real via the Helix DOM backend; native is a labeled 🔬 research track (the
 * same serializable tree, interpreted by a native host later). A curated cross-platform
 * `StyleObject`, typed accessibility, and a structural theme (on the `@mindees/atlas/theme`
 * subpath). The virtualized recycling `List` is on the `@mindees/atlas/list` subpath.
 *
 * @module
 */

import type { Maturity, PackageInfo } from '@mindees/core'
import { NotImplementedError, notImplemented } from '@mindees/core'

/** The npm package name. */
export const name = '@mindees/atlas'

/** The package version. All `@mindees/*` packages share one locked version line. */
export const VERSION = '0.7.0'

/** Current maturity of this package. See the repository `STATUS.md`. */
export const maturity: Maturity = 'experimental'

/**
 * Static identity + maturity metadata for this package. Frozen so the
 * self-reported identity tooling introspects cannot be mutated at runtime,
 * matching the `readonly` fields of {@link PackageInfo}.
 */
export const info: PackageInfo = Object.freeze({ name, version: VERSION, maturity })

export { type A11yProps, type A11yState, type Role, toA11yProps } from './a11y'
export {
  ActivityIndicator,
  type ActivityIndicatorProps,
  Avatar,
  type AvatarProps,
  Badge,
  type BadgeProps,
  Card,
  type CardProps,
  Chip,
  type ChipProps,
  Divider,
  type DividerProps,
  KeyboardAvoidingView,
  type KeyboardAvoidingViewProps,
  ProgressBar,
  type ProgressBarProps,
  SafeAreaView,
  type SafeAreaViewProps,
  Switch,
  type SwitchProps,
} from './components'
export {
  type ColorScheme,
  getEnvironment,
  type KeyboardState,
  type PlatformEnvironment,
  type SafeAreaInsets,
  setEnvironment,
  useColorScheme,
  useKeyboard,
  useSafeAreaInsets,
  useWindowDimensions,
  type WindowDimensions,
} from './environment'
export { type AttachableGesture, GestureView, type GestureViewProps } from './gesture'
export { type BaseProps, type Reactive, resolveStyle, toHostProps } from './host'
export { animateTo, motion } from './motion'
export {
  FocusScope,
  type FocusScopeProps,
  Modal,
  type ModalProps,
} from './overlay'
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
export {
  duration,
  easing,
  fontSize,
  fontWeight,
  getTheme,
  lineHeight,
  palette,
  radius,
  space,
  type Theme,
  type ThemeColors,
  tokens,
  useTheme,
} from './tokens'
export type { Maturity, PackageInfo }
export { NotImplementedError, notImplemented }
