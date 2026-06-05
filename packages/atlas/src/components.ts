/**
 * Atlas components — higher-level building blocks composed purely from the primitives
 * (View/Text/Pressable/Image) + the device hooks. No new host concepts, so every one
 * renders on web *and* native today, and stays fine-grained: reactive bits are accessor
 * styles, so only the changed node re-runs (no component re-render).
 *
 * Colors come from the design tokens via {@link useTheme}, so components re-theme
 * automatically light↔dark (handbook §23/§31). Spacing/radius/type use the token scales.
 *
 * @module
 */

import { type Accessor, type Component, createElement, type MindeesNode } from '@mindees/core'
import { useKeyboard, useSafeAreaInsets } from './environment'
import { type BaseProps, type Reactive, toHostProps } from './host'
import { Image, Pressable, Text, View } from './primitives'
import { flattenStyle, type StyleInput } from './style'
import { fontWeight, radius as radiusScale, space, type Theme, useTheme } from './tokens'

/** Merge a base style with a caller's (possibly reactive) style, staying reactive if either is. */
function mergeStyle(
  base: StyleInput | Accessor<StyleInput>,
  style: Reactive<StyleInput> | undefined,
): Reactive<StyleInput> {
  const baseFn = typeof base === 'function' ? (base as Accessor<StyleInput>) : null
  const styleFn = typeof style === 'function' ? (style as Accessor<StyleInput>) : null
  if (baseFn || styleFn) {
    // In each branch the non-fn side isn't a function, so the StyleInput cast is sound.
    const baseVal = base as StyleInput
    const styleVal = style as StyleInput
    return () => flattenStyle([baseFn ? baseFn() : baseVal, styleFn ? styleFn() : styleVal])
  }
  return flattenStyle([base as StyleInput, style as StyleInput])
}

/** Normalize a `Reactive<T>` to an accessor. */
function toAccessor<T>(value: Reactive<T>, fallback: T): Accessor<T> {
  if (typeof value === 'function') return value as Accessor<T>
  return () => (value === undefined ? fallback : value)
}

// ---------------------------------------------------------------------------
// Card
// ---------------------------------------------------------------------------

/** A surface that groups one coherent unit of content. */
export interface CardProps extends BaseProps {
  readonly children?: MindeesNode
  /** Visual emphasis. `elevated` (default) lifts off the bg; `filled` is a soft tint; `outlined` is a hairline. */
  readonly variant?: 'elevated' | 'filled' | 'outlined'
  /** Internal padding (handbook default 16). */
  readonly padding?: number | string
  /** Corner radius (handbook 12–16 for app cards). */
  readonly radius?: number
}
export const Card: Component<CardProps> = (props) => {
  const theme = useTheme()
  const {
    variant = 'elevated',
    padding = space.md,
    radius = radiusScale.lg,
    style,
    children,
    ...rest
  } = props
  const base: Accessor<StyleInput> = () => {
    const c = theme().color
    const surface: StyleInput =
      variant === 'outlined'
        ? { borderWidth: 1, borderColor: c.border }
        : variant === 'filled'
          ? { backgroundColor: c.surfaceVariant }
          : { backgroundColor: c.surface, borderWidth: 1, borderColor: c.border }
    return { padding, borderRadius: radius, ...surface }
  }
  return createElement(View, { ...rest, style: mergeStyle(base, style) }, children)
}

// ---------------------------------------------------------------------------
// Divider
// ---------------------------------------------------------------------------

/** A thin rule separating content. */
export interface DividerProps extends BaseProps {
  readonly orientation?: 'horizontal' | 'vertical'
  readonly thickness?: number
  /** Override color (defaults to the theme border). */
  readonly color?: string
}
export const Divider: Component<DividerProps> = (props) => {
  const theme = useTheme()
  const { orientation = 'horizontal', thickness = 1, color, style, ...rest } = props
  const base: Accessor<StyleInput> = () => {
    const bg = color ?? theme().color.border
    return orientation === 'horizontal'
      ? { height: thickness, alignSelf: 'stretch', backgroundColor: bg }
      : { width: thickness, alignSelf: 'stretch', backgroundColor: bg }
  }
  return createElement(View, {
    ...rest,
    role: rest.role ?? 'separator',
    style: mergeStyle(base, style),
  })
}

// ---------------------------------------------------------------------------
// Badge
// ---------------------------------------------------------------------------

export type BadgeTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger'

/** Resolve a tone to its {bg, fg} in the active theme. */
function toneColors(tone: BadgeTone, theme: Theme): { bg: string; fg: string } {
  const c = theme.color
  if (tone === 'neutral') return { bg: c.surfaceVariant, fg: c.text }
  return { bg: c[tone], fg: c.onTone }
}

/** A compact status/count pill. */
export interface BadgeProps extends BaseProps {
  readonly children?: MindeesNode
  readonly tone?: BadgeTone
}
export const Badge: Component<BadgeProps> = (props) => {
  const theme = useTheme()
  const { tone = 'neutral', style, children, ...rest } = props
  const base: Accessor<StyleInput> = () => ({
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: space['3xs'],
    paddingBottom: space['3xs'],
    paddingLeft: space.xs,
    paddingRight: space.xs,
    borderRadius: radiusScale.full,
    backgroundColor: toneColors(tone, theme()).bg,
  })
  const textStyle: Accessor<StyleInput> = () => ({
    fontSize: 12,
    fontWeight: fontWeight.semibold,
    color: toneColors(tone, theme()).fg,
  })
  return createElement(
    View,
    { ...rest, role: rest.role ?? 'status', style: mergeStyle(base, style) },
    createElement(Text, { style: textStyle }, children),
  )
}

// ---------------------------------------------------------------------------
// Avatar
// ---------------------------------------------------------------------------

/** Up-to-two-letter initials from a name. */
function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  const first = parts[0]?.[0] ?? ''
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : ''
  return (first + last).toUpperCase()
}

/** A circular user image, falling back to initials. */
export interface AvatarProps extends BaseProps {
  readonly src?: string
  readonly name?: string
  /** Diameter in px (default 40). */
  readonly size?: number
}
export const Avatar: Component<AvatarProps> = (props) => {
  const theme = useTheme()
  const { src, name, size = 40, style, ...rest } = props
  const base: Accessor<StyleInput> = () => ({
    width: size,
    height: size,
    borderRadius: size / 2,
    overflow: 'hidden',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme().color.surfaceVariant,
  })
  const content = src
    ? createElement(Image, {
        src,
        label: name ?? '',
        ...(name ? {} : { decorative: true }),
        style: { width: size, height: size },
      })
    : createElement(
        Text,
        {
          style: () => ({
            fontSize: Math.round(size * 0.4),
            fontWeight: fontWeight.semibold,
            color: theme().color.text,
          }),
        },
        name ? initialsOf(name) : '?',
      )
  return createElement(
    View,
    { ...rest, label: rest.label ?? name, style: mergeStyle(base, style) },
    content,
  )
}

// ---------------------------------------------------------------------------
// Chip
// ---------------------------------------------------------------------------

/** A compact, optionally-selectable token (filter/choice/input). */
export interface ChipProps extends Omit<BaseProps, 'style'> {
  readonly label: string
  readonly selected?: Reactive<boolean>
  readonly disabled?: boolean
  readonly onPress?: () => void
  readonly leading?: MindeesNode
  readonly trailing?: MindeesNode
  readonly style?: Reactive<StyleInput>
}
export const Chip: Component<ChipProps> = (props) => {
  const theme = useTheme()
  const { label, selected = false, disabled, onPress, leading, trailing, style, ...rest } = props
  const isSelected = toAccessor(selected, false)
  const base: Accessor<StyleInput> = () => {
    const c = theme().color
    const on = isSelected()
    return {
      display: 'flex',
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: space['2xs'],
      minHeight: 32,
      paddingTop: space['2xs'],
      paddingBottom: space['2xs'],
      paddingLeft: space.sm,
      paddingRight: space.sm,
      borderRadius: radiusScale.full,
      borderWidth: 1,
      borderColor: on ? c.primary : c.border,
      backgroundColor: on ? c.primary : 'transparent',
      opacity: disabled ? 0.5 : 1,
    }
  }
  const text = createElement(
    Text,
    {
      style: () => ({
        fontSize: 14,
        fontWeight: fontWeight.medium,
        color: isSelected() ? theme().color.onPrimary : theme().color.text,
      }),
    },
    label,
  )
  const inner: MindeesNode = [leading, text, trailing].filter((n) => n != null) as MindeesNode
  return createElement(
    Pressable,
    {
      ...rest,
      role: rest.role ?? 'button',
      // Reactive `aria-pressed` so a toggle chip announces its selected state as it changes.
      state: () => ({
        ...(typeof rest.state === 'function' ? rest.state() : (rest.state ?? {})),
        pressed: isSelected(),
      }),
      ...(onPress ? { onPress } : {}),
      ...(disabled ? { disabled: true } : {}),
      style: mergeStyle(base, style),
    },
    inner,
  )
}

// ---------------------------------------------------------------------------
// Switch
// ---------------------------------------------------------------------------

/** A binary on/off toggle (composed track + knob; flips instantly on press). */
export interface SwitchProps extends Omit<BaseProps, 'style'> {
  /** Controlled state (static or reactive). */
  readonly value: Reactive<boolean>
  readonly onValueChange?: (value: boolean) => void
  readonly disabled?: boolean
  readonly style?: Reactive<StyleInput>
}
export const Switch: Component<SwitchProps> = (props) => {
  const theme = useTheme()
  const { value, onValueChange, disabled, style, ...rest } = props
  const isOn = toAccessor(value, false)
  const track: Accessor<StyleInput> = () => ({
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: isOn() ? 'flex-end' : 'flex-start',
    width: 52,
    height: 32,
    borderRadius: radiusScale.full,
    padding: 3,
    backgroundColor: isOn() ? theme().color.primary : theme().color.textMuted,
    opacity: disabled ? 0.5 : 1,
  })
  const knob = createElement(View, {
    style: () => ({
      width: 26,
      height: 26,
      borderRadius: 13,
      backgroundColor: theme().color.onPrimary,
    }),
  })
  const handlePress = onValueChange && !disabled ? () => onValueChange(!isOn()) : undefined
  return createElement(
    Pressable,
    {
      ...rest,
      role: rest.role ?? 'switch',
      // Reactive state → `aria-checked` tracks the toggle (a static object would bake it once).
      state: () => ({
        ...(typeof rest.state === 'function' ? rest.state() : (rest.state ?? {})),
        checked: isOn(),
      }),
      ...(disabled ? { disabled: true } : {}),
      ...(handlePress ? { onPress: handlePress } : {}),
      style: mergeStyle(track, style),
    },
    knob,
  )
}

// ---------------------------------------------------------------------------
// SafeAreaView
// ---------------------------------------------------------------------------

/** A container that pads itself by the live safe-area insets (notch, home indicator, …). */
export interface SafeAreaViewProps extends BaseProps {
  readonly children?: MindeesNode
  /** Which edges to inset (default: all four). */
  readonly edges?: ReadonlyArray<'top' | 'right' | 'bottom' | 'left'>
}
export const SafeAreaView: Component<SafeAreaViewProps> = (props) => {
  const insets = useSafeAreaInsets()
  const { edges, style, children, ...rest } = props
  const wants = (edge: 'top' | 'right' | 'bottom' | 'left'): boolean =>
    !edges || edges.includes(edge)
  const base: Accessor<StyleInput> = () => {
    const i = insets()
    return {
      paddingTop: wants('top') ? i.top : 0,
      paddingRight: wants('right') ? i.right : 0,
      paddingBottom: wants('bottom') ? i.bottom : 0,
      paddingLeft: wants('left') ? i.left : 0,
    }
  }
  return createElement(View, { ...rest, style: mergeStyle(base, style) }, children)
}

// ---------------------------------------------------------------------------
// KeyboardAvoidingView
// ---------------------------------------------------------------------------

/** A container that pads its bottom by the live keyboard height so content stays visible. */
export interface KeyboardAvoidingViewProps extends BaseProps {
  readonly children?: MindeesNode
}
export const KeyboardAvoidingView: Component<KeyboardAvoidingViewProps> = (props) => {
  const keyboard = useKeyboard()
  const { style, children, ...rest } = props
  const base: Accessor<StyleInput> = () => ({ paddingBottom: keyboard().height })
  return createElement(View, { ...rest, style: mergeStyle(base, style) }, children)
}

// ---------------------------------------------------------------------------
// ProgressBar (determinate)
// ---------------------------------------------------------------------------

/** A determinate progress bar (track + reactive fill). */
export interface ProgressBarProps extends BaseProps {
  /** Progress 0..1 (static or reactive). Values outside the range are clamped. */
  readonly value?: Reactive<number>
  readonly trackColor?: string
  readonly color?: string
  readonly height?: number
}
export const ProgressBar: Component<ProgressBarProps> = (props) => {
  const theme = useTheme()
  const { value = 0, trackColor, color, height = 6, style, ...rest } = props
  const progress = toAccessor(value, 0)
  const track: Accessor<StyleInput> = () => ({
    width: '100%',
    height,
    borderRadius: height / 2,
    overflow: 'hidden',
    backgroundColor: trackColor ?? theme().color.surfaceVariant,
  })
  const fill: Accessor<StyleInput> = () => ({
    height,
    borderRadius: height / 2,
    backgroundColor: color ?? theme().color.primary,
    width: `${Math.max(0, Math.min(1, progress())) * 100}%`,
  })
  return createElement(
    View,
    {
      ...rest,
      role: rest.role ?? 'progressbar',
      // A progressbar with no value is inaccessible — emit a reactive aria-valuenow (0..1 range).
      valueMin: 0,
      valueMax: 1,
      valueNow: () => Math.max(0, Math.min(1, progress())),
      style: mergeStyle(track, style),
    },
    createElement(View, { style: fill }),
  )
}

// ---------------------------------------------------------------------------
// ActivityIndicator
// ---------------------------------------------------------------------------

/**
 * A spinning loading indicator. Emits the `activityindicator` host tag, which each backend
 * renders natively: web → a CSS keyframe spinner (size from `width`/`height`, arc from `color`),
 * Android → an indeterminate `ProgressBar`. Size/color flow through ordinary style keys.
 */
export interface ActivityIndicatorProps extends BaseProps {
  /** Diameter in px (default 24). */
  readonly size?: number
  /** Spinner color (defaults to the theme primary). */
  readonly color?: string
  /** When false, renders nothing (so callers can gate it without a conditional). */
  readonly animating?: boolean
}
export const ActivityIndicator: Component<ActivityIndicatorProps> = (props) => {
  const theme = useTheme()
  const { size = 24, color, animating = true, style, ...rest } = props
  if (animating === false) return null
  const base: Accessor<StyleInput> = () => ({
    width: size,
    height: size,
    color: color ?? theme().color.primary,
  })
  const host = toHostProps({ ...rest, style: mergeStyle(base, style) })
  if (!host.role) host.role = 'status'
  host['aria-busy'] = 'true'
  return createElement('activityindicator', host)
}
