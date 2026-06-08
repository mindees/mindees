/**
 * Atlas primitives — accessible, signals-native UI building blocks. Each is a
 * `Component<P>` over `@mindees/core`'s `createElement`, returning a renderer-agnostic
 * `MindeesNode`. Web rendering is real (via the Helix DOM backend); native is a labeled 🔬
 * research track (the same serializable tree, interpreted by a native host later). See
 * `docs/adr/0022-atlas-primitives.md`.
 *
 * @module
 */

import {
  type Accessor,
  type Component,
  createElement,
  type MindeesNode,
  signal,
} from '@mindees/core'
import { type BaseProps, type Reactive, resolveStyle, toHostProps } from './host'
import { flattenStyle, type StyleInput } from './style'

/** Merge a base layout style with a caller's (possibly reactive) style, staying reactive if it is. */
function withBaseStyle(
  base: StyleInput,
  style: Reactive<StyleInput> | undefined,
): Reactive<StyleInput> {
  if (typeof style === 'function') {
    const accessor = style as Accessor<StyleInput>
    return () => flattenStyle([base, accessor()])
  }
  return flattenStyle([base, style])
}

/** Dev-only warning (silent in production). Structural global access — no DOM/Node lib needed. */
function warnDev(message: string): void {
  const g = globalThis as {
    process?: { env?: Record<string, string | undefined> }
    console?: { warn?: (message: string) => void }
  }
  if (g.process?.env?.NODE_ENV === 'production') return
  g.console?.warn?.(`[atlas] ${message}`)
}

function eventValue(event: unknown): string {
  return (event as { target?: { value?: string } })?.target?.value ?? ''
}

/** A generic container (→ `view`/`div`). */
export interface ViewProps extends BaseProps {
  readonly children?: MindeesNode
}
export const View: Component<ViewProps> = (props) =>
  createElement('view', toHostProps(props), props.children)

/** Text content (→ `text`/`span`). No default `role` (a bare span is correct; pass `role` to opt in). */
export interface TextProps extends BaseProps {
  readonly children?: MindeesNode
}
export const Text: Component<TextProps> = (props) =>
  createElement('text', toHostProps(props), props.children)

/** Merge extra style keys into a host prop bag, preserving a reactive (accessor) style. */
function mergeHostStyle(host: Record<string, unknown>, extra: Record<string, unknown>): void {
  const cur = host.style
  if (cur === undefined) host.style = extra
  else if (typeof cur === 'function') {
    const acc = cur as () => Record<string, unknown>
    host.style = () => ({ ...acc(), ...extra })
  } else host.style = { ...(cur as Record<string, unknown>), ...extra }
}

/** An image (→ `image`/`img`). Requires `label` (alt) unless `decorative`. */
export interface ImageProps extends BaseProps {
  readonly src: string
  /** Mark purely-decorative images so screen readers skip them (alt="" + aria-hidden). */
  readonly decorative?: boolean
  /** How the image fills its box (→ CSS `object-fit`). */
  readonly resizeMode?: 'cover' | 'contain' | 'fill' | 'none' | 'scale-down'
  /** Native lazy-loading (→ `loading`). */
  readonly loading?: 'lazy' | 'eager'
  /** Decode hint (→ `decoding`). */
  readonly decoding?: 'async' | 'sync' | 'auto'
  /** Fetch-priority hint (→ `fetchpriority`). */
  readonly fetchPriority?: 'high' | 'low' | 'auto'
  /** Intrinsic width/height (px) — reserve layout space to avoid reflow on load. */
  readonly width?: number
  readonly height?: number
  /** Swapped in if `src` fails to load (sets the element's `src` on the `error` event). */
  readonly fallbackSrc?: string
  /** Fires when the image finishes loading. */
  readonly onLoad?: () => void
  /** Fires when the image fails to load (after any `fallbackSrc` swap). */
  readonly onError?: () => void
}
export const Image: Component<ImageProps> = (props) => {
  const host = toHostProps(props)
  host.src = props.src
  if (props.resizeMode) mergeHostStyle(host, { objectFit: props.resizeMode })
  if (props.loading) host.loading = props.loading
  if (props.decoding) host.decoding = props.decoding
  if (props.fetchPriority) host.fetchpriority = props.fetchPriority
  if (props.width !== undefined) host.width = props.width
  if (props.height !== undefined) host.height = props.height
  if (props.onLoad) host.onLoad = () => props.onLoad?.()
  const fallback = props.fallbackSrc
  if (fallback !== undefined || props.onError) {
    host.onError = (e: unknown): void => {
      const target = (e as { target?: { src?: string; dataset?: Record<string, string> } } | null)
        ?.target
      // Swap to the fallback exactly ONCE — guard with a marker, not `src !== fallback` (the live `src`
      // is an absolute URL that never equals the literal fallback, which would re-swap + re-fire forever).
      if (fallback !== undefined && target?.dataset && target.dataset.mindeesFellBack !== '1') {
        target.dataset.mindeesFellBack = '1'
        target.src = fallback
      }
      props.onError?.()
    }
  }
  if (props.decorative) {
    host.alt = ''
    host['aria-hidden'] = 'true'
    // A decorative image must expose NO accessible name; drop any label lowered by
    // toHostProps so we don't emit a contradictory aria-label on a hidden element.
    delete host['aria-label']
    delete host['aria-labelledby']
  } else {
    if (props.label === undefined) {
      warnDev('Image without a `label` (alt text); pass `label` or set `decorative`.')
    }
    host.alt = props.label ?? ''
  }
  return createElement('image', host)
}

/** Map a logical keyboard type to the HTML `inputmode` attribute. */
const KEYBOARD_INPUTMODE: Record<string, string> = {
  default: 'text',
  numeric: 'numeric',
  decimal: 'decimal',
  email: 'email',
  tel: 'tel',
  url: 'url',
  search: 'search',
}

/** A text field (→ `textinput`/`input`, or `textarea` when `multiline`). `value` may be reactive. */
export interface TextInputProps extends BaseProps {
  readonly value?: Reactive<string>
  readonly placeholder?: string
  readonly type?: 'text' | 'password' | 'email' | 'number' | 'search' | 'tel' | 'url'
  readonly disabled?: boolean
  /** Render a multi-line field (→ `textarea`). */
  readonly multiline?: boolean
  /** Visible rows when `multiline` (→ textarea `rows`). */
  readonly rows?: number
  /** Mask the input (→ `type="password"`); overrides `type`. */
  readonly secureTextEntry?: boolean
  /** On-screen keyboard hint (→ `inputmode`). */
  readonly keyboardType?: 'default' | 'numeric' | 'decimal' | 'email' | 'tel' | 'url' | 'search'
  /** Enter-key label hint (→ `enterkeyhint`). */
  readonly returnKeyType?: 'enter' | 'done' | 'go' | 'next' | 'search' | 'send'
  /** Auto-capitalization (→ `autocapitalize`). */
  readonly autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters'
  /** Autofill hint (→ `autocomplete`, e.g. `"email"`, `"current-password"`). */
  readonly autoComplete?: string
  /** Maximum length (→ `maxlength`). */
  readonly maxLength?: number
  /** Focus on mount (→ `autofocus`). */
  readonly autoFocus?: boolean
  /** Fires on every keystroke with the current value (`input` event). */
  readonly onInput?: (value: string) => void
  /** Fires on commit/blur with the current value (`change` event). */
  readonly onChange?: (value: string) => void
  readonly onFocus?: () => void
  readonly onBlur?: () => void
  /** Fires when the user presses Enter (single-line submit). */
  readonly onSubmitEditing?: (value: string) => void
}
export const TextInput: Component<TextInputProps> = (props) => {
  const host = toHostProps(props)
  if (!host.role) host.role = 'textbox'
  if (props.value !== undefined) host.value = props.value
  if (props.placeholder !== undefined) host.placeholder = props.placeholder
  const type = props.secureTextEntry ? 'password' : props.type
  if (type !== undefined) host.type = type
  if (props.disabled) host.disabled = true
  if (props.keyboardType) host.inputmode = KEYBOARD_INPUTMODE[props.keyboardType]
  if (props.returnKeyType) host.enterkeyhint = props.returnKeyType
  if (props.autoCapitalize) host.autocapitalize = props.autoCapitalize
  if (props.autoComplete !== undefined) host.autocomplete = props.autoComplete
  if (props.maxLength !== undefined) host.maxlength = props.maxLength
  if (props.autoFocus) host.autofocus = true
  if (props.onInput) host.onInput = (e: unknown) => props.onInput?.(eventValue(e))
  if (props.onChange) host.onChange = (e: unknown) => props.onChange?.(eventValue(e))
  if (props.onFocus) host.onFocus = () => props.onFocus?.()
  if (props.onBlur) host.onBlur = () => props.onBlur?.()
  if (props.onSubmitEditing) {
    host.onKeyDown = (e: unknown): void => {
      if ((e as { key?: string } | null)?.key === 'Enter') props.onSubmitEditing?.(eventValue(e))
    }
  }
  if (props.multiline) {
    delete host.type // a <textarea> has no `type` attribute (a multiline + secureTextEntry combo is moot)
    if (props.rows !== undefined) host.rows = props.rows
    return createElement('textarea', host) // multi-line → real <textarea>
  }
  return createElement('textinput', host)
}

/** Interaction state exposed to a Pressable style function. */
export interface InteractionState {
  readonly hovered: boolean
  readonly pressed: boolean
  readonly focused: boolean
}

/** A pressable surface with built-in hover/press/focus state. Web-real via DOM events. */
export interface PressableProps extends Omit<BaseProps, 'style'> {
  readonly children?: MindeesNode
  /** Called when activated (click / Enter / Space) — skipped while `disabled`. */
  readonly onPress?: () => void
  readonly disabled?: boolean
  /** Static/reactive style, or a function of the live interaction state. */
  readonly style?: Reactive<StyleInput> | ((state: InteractionState) => StyleInput)
}

/**
 * Create the interaction signals + host handlers a pressable surface needs. Reusable so other
 * primitives can compose interaction state. Web wires REAL DOM events (`click`, `pointer*`,
 * `focus`/`blur`, `keydown`) — never a fake cross-platform `press` event that no-ops on web.
 */
export function usePressable(options: { onPress?: () => void; disabled?: boolean } = {}): {
  state: () => InteractionState
  handlers: Record<string, (event: unknown) => void>
} {
  const hovered = signal(false)
  const pressed = signal(false)
  const focused = signal(false)
  const enabled = (): boolean => !options.disabled
  const fire = (): void => {
    if (enabled()) options.onPress?.()
  }
  // A disabled control is inert: its interaction signals don't update, so a state-driven style
  // shows no hover/press/focus feedback (and `fire` blocks onPress / keyboard activation).
  const handlers: Record<string, (event: unknown) => void> = {
    onClick: () => fire(),
    onPointerEnter: () => {
      if (enabled()) hovered.set(true)
    },
    onPointerLeave: () => {
      if (enabled()) {
        hovered.set(false)
        pressed.set(false)
      }
    },
    onPointerDown: () => {
      if (enabled()) pressed.set(true)
    },
    onPointerUp: () => {
      if (enabled()) pressed.set(false)
    },
    onFocus: () => {
      if (enabled()) focused.set(true)
    },
    onBlur: () => {
      if (enabled()) focused.set(false)
    },
    onKeyDown: (e: unknown) => {
      const ev = e as { key?: string; preventDefault?: () => void }
      if (ev.key === 'Enter' || ev.key === ' ') {
        ev.preventDefault?.() // stop Space from page-scrolling a div[role=button]
        fire()
      }
    },
  }
  return {
    state: () => ({ hovered: hovered(), pressed: pressed(), focused: focused() }),
    handlers,
  }
}

export const Pressable: Component<PressableProps> = (props) => {
  const { state, handlers } = usePressable({
    ...(props.onPress ? { onPress: props.onPress } : {}),
    ...(props.disabled ? { disabled: true } : {}),
  })
  // Base host props WITHOUT style (Pressable resolves style itself, supporting a state fn).
  const { style, ...rest } = props
  const host: Record<string, unknown> = { ...toHostProps(rest), ...handlers }
  if (!host.role) host.role = 'button'
  if (props.disabled) host['aria-disabled'] = 'true'
  else host.tabindex = 0
  if (style !== undefined) {
    // Distinguish a state-fn `(state) => StyleInput` from a plain reactive style accessor
    // `() => StyleInput` by ARITY: both are functions, but only the state-fn declares a
    // parameter. Treating every function as a state-fn would subscribe an ordinary
    // reactive style to hover/press/focus, re-running it on every interaction.
    const isStateFn = typeof style === 'function' && style.length >= 1
    host.style = isStateFn
      ? () => flattenStyle((style as (s: InteractionState) => StyleInput)(state()))
      : // Arity ruled the state-fn out, so the remainder is a plain `Reactive<StyleInput>`.
        // TS can't narrow on `.length`, so assert it (mirrors the state-fn cast above).
        resolveStyle(style as Reactive<StyleInput>)
  }
  return createElement('view', host, props.children)
}

/** A labelled button = {@link Pressable} wrapping a {@link Text}. */
export interface ButtonProps extends PressableProps {
  /** Convenience text label (alternative to `children`). */
  readonly title?: string
}
export const Button: Component<ButtonProps> = (props) => {
  const { title, children, ...rest } = props
  // The renderer always passes `children` as an array (`[]` when empty), so `??` wouldn't
  // trigger the title fallback — treat an empty array as "no children".
  const hasChildren = Array.isArray(children) ? children.length > 0 : children != null
  const content = hasChildren
    ? children
    : title !== undefined
      ? createElement(Text, null, title)
      : null
  return createElement(Pressable, rest, content)
}

// --- Layout composition (pure View + style, no new host concepts) ---

type FlexAlign = 'flex-start' | 'flex-end' | 'center' | 'stretch' | 'baseline'
type FlexJustify =
  | 'flex-start'
  | 'flex-end'
  | 'center'
  | 'space-between'
  | 'space-around'
  | 'space-evenly'

/** A flex container. `direction` defaults to `column`. */
export interface StackProps extends ViewProps {
  readonly direction?: 'row' | 'column'
  readonly gap?: number | string
  readonly align?: FlexAlign
  readonly justify?: FlexJustify
}
export const Stack: Component<StackProps> = (props) => {
  const { direction = 'column', gap, align, justify, style, children, ...rest } = props
  const layout: StyleInput = {
    display: 'flex',
    flexDirection: direction,
    ...(gap !== undefined ? { gap } : {}),
    ...(align !== undefined ? { alignItems: align } : {}),
    ...(justify !== undefined ? { justifyContent: justify } : {}),
  }
  return createElement(View, { ...rest, style: withBaseStyle(layout, style) }, children)
}

/** A horizontal {@link Stack}. */
export const Row: Component<Omit<StackProps, 'direction'>> = (props) =>
  createElement(Stack, { ...props, direction: 'row' }, props.children)

/** A vertical {@link Stack}. */
export const Column: Component<Omit<StackProps, 'direction'>> = (props) =>
  createElement(Stack, { ...props, direction: 'column' }, props.children)

/** Flexible (or fixed) empty space. */
export interface SpacerProps {
  /** Fixed size (px) instead of flexible fill. */
  readonly size?: number | string
}
export const Spacer: Component<SpacerProps> = (props) =>
  createElement(View, {
    style: props.size !== undefined ? { width: props.size, height: props.size } : { flex: 1 },
  })

/** A scrollable container (→ `scrollview`/`div` with `overflow:auto`). */
export interface ScrollViewProps extends ViewProps {
  readonly horizontal?: boolean
  /** Fires on scroll with the host scroll event. */
  readonly onScroll?: (event: unknown) => void
}
export const ScrollView: Component<ScrollViewProps> = (props) => {
  const { horizontal, onScroll, style, children, ...rest } = props
  // A horizontal scroller lays its children out in a row and scrolls along x; a vertical
  // one stacks and scrolls along y. Drive real layout through the curated cross-platform
  // style subset (flexDirection + overflow), not an inert `data-orientation` attribute that
  // no backend reads.
  const host = toHostProps({
    ...rest,
    style: withBaseStyle(
      horizontal
        ? // `display: 'flex'` is required for `flexDirection`/`flexWrap` to take effect —
          // without it the row layout is inert (the element keeps the default block flow).
          { display: 'flex', overflow: 'auto', flexDirection: 'row', flexWrap: 'nowrap' }
        : { overflow: 'auto' },
      style,
    ),
  })
  if (onScroll) host.onScroll = onScroll
  if (horizontal) host['data-orientation'] = 'horizontal' // extra hint for native hosts
  // Orientation is fixed at creation, so emit a distinct tag a native host can branch on in
  // makeElement (a vertical ScrollView and a HorizontalScrollView are different widgets). Web
  // maps both to <div> and derives orientation from the style above.
  return createElement(horizontal ? 'horizontalscrollview' : 'scrollview', host, children)
}
