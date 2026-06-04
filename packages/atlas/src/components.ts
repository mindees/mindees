/**
 * Atlas components — higher-level building blocks composed purely from the primitives
 * (View/Text/Pressable/Image) + the device hooks. No new host concepts, so every one
 * renders on web *and* native today, and stays fine-grained: reactive bits are accessor
 * styles, so only the changed node re-runs (no component re-render).
 *
 * Defaults follow the 2026 UI/UX handbook — 8pt spacing, 12–16 radius, WCAG-AA tone
 * contrast, ≥24/44 targets. Colors are neutral/semantic literals for now; the design-token
 * layer (next) will make them themeable.
 *
 * @module
 */

import { type Accessor, type Component, createElement, type MindeesNode } from '@mindees/core'
import { useKeyboard, useSafeAreaInsets } from './environment'
import type { BaseProps, Reactive } from './host'
import { Image, Pressable, Text, View } from './primitives'
import { flattenStyle, type StyleInput } from './style'

/** A neutral hairline that reads on both light and dark surfaces. */
const HAIRLINE = 'rgba(127, 127, 127, 0.24)'

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
  const { variant = 'elevated', padding = 16, radius = 16, style, children, ...rest } = props
  const surface: StyleInput =
    variant === 'outlined'
      ? { borderWidth: 1, borderColor: HAIRLINE }
      : variant === 'filled'
        ? { backgroundColor: 'rgba(127, 127, 127, 0.08)' }
        : { backgroundColor: 'rgba(127, 127, 127, 0.06)', borderWidth: 1, borderColor: HAIRLINE }
  const base: StyleInput = { padding, borderRadius: radius, ...surface }
  return createElement(View, { ...rest, style: mergeStyle(base, style) }, children)
}

// ---------------------------------------------------------------------------
// Divider
// ---------------------------------------------------------------------------

/** A thin rule separating content. */
export interface DividerProps extends BaseProps {
  readonly orientation?: 'horizontal' | 'vertical'
  readonly thickness?: number
  readonly color?: string
}
export const Divider: Component<DividerProps> = (props) => {
  const { orientation = 'horizontal', thickness = 1, color = HAIRLINE, style, ...rest } = props
  const base: StyleInput =
    orientation === 'horizontal'
      ? { height: thickness, alignSelf: 'stretch', backgroundColor: color }
      : { width: thickness, alignSelf: 'stretch', backgroundColor: color }
  return createElement(View, {
    ...rest,
    role: rest.role ?? 'separator',
    style: mergeStyle(base, style),
  })
}

// ---------------------------------------------------------------------------
// Badge
// ---------------------------------------------------------------------------

/** Tone → AA-contrast {bg, fg} (white text on -700 shades, ≥4.5:1 for small text). */
const BADGE_TONES = {
  neutral: { bg: '#475569', fg: '#ffffff' },
  info: { bg: '#1d4ed8', fg: '#ffffff' },
  success: { bg: '#15803d', fg: '#ffffff' },
  warning: { bg: '#b45309', fg: '#ffffff' },
  danger: { bg: '#b91c1c', fg: '#ffffff' },
} as const

/** A compact status/count pill. */
export interface BadgeProps extends BaseProps {
  readonly children?: MindeesNode
  readonly tone?: keyof typeof BADGE_TONES
}
export const Badge: Component<BadgeProps> = (props) => {
  const { tone = 'neutral', style, children, ...rest } = props
  const { bg, fg } = BADGE_TONES[tone]
  const base: StyleInput = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 2,
    paddingBottom: 2,
    paddingLeft: 8,
    paddingRight: 8,
    borderRadius: 999,
    backgroundColor: bg,
  }
  return createElement(
    View,
    { ...rest, role: rest.role ?? 'status', style: mergeStyle(base, style) },
    createElement(Text, { style: { fontSize: 12, fontWeight: 600, color: fg } }, children),
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
  const { src, name, size = 40, style, ...rest } = props
  const base: StyleInput = {
    width: size,
    height: size,
    borderRadius: size / 2,
    overflow: 'hidden',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#475569',
  }
  const content = src
    ? createElement(Image, {
        src,
        label: name ?? '',
        ...(name ? {} : { decorative: true }),
        style: { width: size, height: size },
      })
    : createElement(
        Text,
        { style: { fontSize: Math.round(size * 0.4), fontWeight: 600, color: '#ffffff' } },
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
  const { label, selected = false, disabled, onPress, leading, trailing, style, ...rest } = props
  const isSelected = toAccessor(selected, false)
  const base: Accessor<StyleInput> = () => {
    const on = isSelected()
    return {
      display: 'flex',
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      minHeight: 32,
      paddingTop: 6,
      paddingBottom: 6,
      paddingLeft: 12,
      paddingRight: 12,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: on ? '#1d4ed8' : HAIRLINE,
      backgroundColor: on ? '#1d4ed8' : 'transparent',
      opacity: disabled ? 0.5 : 1,
    }
  }
  const text = () =>
    createElement(
      Text,
      {
        style: () => ({
          fontSize: 14,
          fontWeight: 500,
          color: isSelected() ? '#ffffff' : '#cbd5e1',
        }),
      },
      label,
    )
  const inner: MindeesNode = [leading, text(), trailing].filter((n) => n != null) as MindeesNode
  return createElement(
    Pressable,
    {
      ...rest,
      role: rest.role ?? 'button',
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
  const { value, onValueChange, disabled, style, ...rest } = props
  const isOn = toAccessor(value, false)
  const track: Accessor<StyleInput> = () => ({
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: isOn() ? 'flex-end' : 'flex-start',
    width: 52,
    height: 32,
    borderRadius: 999,
    padding: 3,
    backgroundColor: isOn() ? '#1d4ed8' : '#64748b',
    opacity: disabled ? 0.5 : 1,
  })
  const knob = createElement(View, {
    style: { width: 26, height: 26, borderRadius: 13, backgroundColor: '#ffffff' },
  })
  const handlePress = onValueChange && !disabled ? () => onValueChange(!isOn()) : undefined
  return createElement(
    Pressable,
    {
      ...rest,
      role: rest.role ?? 'switch',
      state: { ...(rest.state ?? {}), checked: isOn() },
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
  const { value = 0, trackColor = HAIRLINE, color = '#5b8cff', height = 6, style, ...rest } = props
  const progress = toAccessor(value, 0)
  const track: StyleInput = {
    width: '100%',
    height,
    borderRadius: height / 2,
    overflow: 'hidden',
    backgroundColor: trackColor,
  }
  const fill: Accessor<StyleInput> = () => ({
    height,
    borderRadius: height / 2,
    backgroundColor: color,
    width: `${Math.max(0, Math.min(1, progress())) * 100}%`,
  })
  return createElement(
    View,
    { ...rest, role: rest.role ?? 'progressbar', style: mergeStyle(track, style) },
    createElement(View, { style: fill }),
  )
}
