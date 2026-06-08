/**
 * `@mindees/atlas` (Atlas) — accessible, signals-native UI primitives. Function components
 * over `@mindees/core`'s `createElement` that return renderer-agnostic `MindeesNode` trees:
 * web rendering is real via the Helix DOM backend; native is a labeled 🔬 research track (the
 * same serializable tree, interpreted by a native host later). A curated cross-platform
 * `StyleObject`, typed accessibility, and design-token theming (`useTheme`/`tokens`, on the main entry).
 * The virtualized recycling `List` is on the `@mindees/atlas/list` subpath.
 *
 * @module
 */

import type { Maturity, PackageInfo } from '@mindees/core'
import { NotImplementedError, notImplemented } from '@mindees/core'

/** The npm package name. */
export const name = '@mindees/atlas'

/** The package version. All `@mindees/*` packages share one locked version line. */
export const VERSION = '0.36.0'

/** Current maturity of this package. See the repository `STATUS.md`. */
export const maturity: Maturity = 'experimental'

/**
 * Static identity + maturity metadata for this package. Frozen so the
 * self-reported identity tooling introspects cannot be mutated at runtime,
 * matching the `readonly` fields of {@link PackageInfo}.
 */
export const info: PackageInfo = Object.freeze({ name, version: VERSION, maturity })

export {
  type A11yProps,
  type A11yState,
  type Announce,
  announce,
  type Role,
  toA11yProps,
} from './a11y'
export {
  Accordion,
  type AccordionProps,
  type AccordionSection,
  ActivityIndicator,
  type ActivityIndicatorProps,
  Avatar,
  type AvatarProps,
  Badge,
  type BadgeProps,
  Card,
  type CardProps,
  Checkbox,
  type CheckboxProps,
  Chip,
  type ChipProps,
  Divider,
  type DividerProps,
  KeyboardAvoidingView,
  type KeyboardAvoidingViewProps,
  ProgressBar,
  type ProgressBarProps,
  RadioGroup,
  type RadioGroupProps,
  type RadioOption,
  SafeAreaView,
  type SafeAreaViewProps,
  type Segment,
  SegmentedControl,
  type SegmentedControlProps,
  Skeleton,
  type SkeletonProps,
  Stepper,
  type StepperProps,
  Switch,
  type SwitchProps,
  type TabItem,
  Tabs,
  type TabsProps,
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
  useReducedMotion,
  useSafeAreaInsets,
  useWindowDimensions,
  type WindowDimensions,
} from './environment'
export { ErrorBoundary, type ErrorBoundaryProps } from './error-boundary'
export { type Field, type FormApi, type UseFormOptions, useForm } from './form'
export { type AttachableGesture, GestureView, type GestureViewProps } from './gesture'
export {
  type AsyncState,
  type Counter,
  type PersistentSignalOptions,
  type SignalStorage,
  type Toggle,
  useAsync,
  useCounter,
  useDebounce,
  useInterval,
  usePersistentSignal,
  usePrevious,
  useReducer,
  useTimeout,
  useToggle,
} from './hooks'
export { type BaseProps, type Reactive, resolveStyle, toHostProps } from './host'
export { animateTo, motion } from './motion'
export {
  FocusScope,
  type FocusScopeProps,
  Modal,
  type ModalProps,
  Toast,
  type ToastProps,
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
export { Show, type ShowProps } from './show'
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
export { VisibilityScope } from './visibility'
export { connectWebEnvironment, type WebEnvWindow } from './web-environment'
export type { Maturity, PackageInfo }
export { NotImplementedError, notImplemented }
