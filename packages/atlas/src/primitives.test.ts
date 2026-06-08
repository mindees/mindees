import { createElement, effect, isElement, type MindeesElement, signal } from '@mindees/core'
import { renderToString } from '@mindees/renderer'
import { describe, expect, it, vi } from 'vitest'
import {
  Button,
  Column,
  Image,
  Pressable,
  Row,
  ScrollView,
  Spacer,
  Stack,
  Text,
  TextInput,
  usePressable,
  View,
} from './primitives'

/** Narrow a node to an element for prop assertions. */
function el(node: unknown): MindeesElement {
  if (!isElement(node)) throw new Error('expected an element')
  return node
}

describe('View / Text', () => {
  it('View renders a `view` host with style + a11y lowered', () => {
    const node = el(View({ style: { width: 100, gap: 8 }, role: 'list', label: 'items' }))
    expect(node.type).toBe('view')
    expect(node.props.style).toEqual({ width: 100, gap: 8 })
    expect(node.props.role).toBe('list')
    expect(node.props['aria-label']).toBe('items')
  })

  it('Text renders a span with NO default role + carries children', () => {
    const node = el(Text({ children: 'hello' }))
    expect(node.type).toBe('text')
    expect(node.props.role).toBeUndefined() // a bare span; role="text" would harm SR navigation
    expect(node.children).toEqual(['hello'])
  })

  it('Text accepts an explicit role', () => {
    expect(el(Text({ role: 'heading', children: 'Title' })).props.role).toBe('heading')
  })
})

describe('Image', () => {
  it('maps label → alt', () => {
    const node = el(Image({ src: '/a.png', label: 'A cat' }))
    expect(node.type).toBe('image')
    expect(node.props.src).toBe('/a.png')
    expect(node.props.alt).toBe('A cat')
  })

  it('decorative → empty alt + aria-hidden', () => {
    const node = el(Image({ src: '/a.png', decorative: true }))
    expect(node.props.alt).toBe('')
    expect(node.props['aria-hidden']).toBe('true')
  })

  it('decorative drops a contradictory aria-label even when `label` is also passed', () => {
    const node = el(Image({ src: '/a.png', decorative: true, label: 'A cat' }))
    expect(node.props['aria-hidden']).toBe('true')
    expect(node.props['aria-label']).toBeUndefined() // no accessible name on a hidden image
  })
})

describe('TextInput', () => {
  it('renders an input with placeholder/type and a textbox role', () => {
    const node = el(TextInput({ placeholder: 'Name', type: 'email' }))
    expect(node.type).toBe('textinput')
    expect(node.props.role).toBe('textbox')
    expect(node.props.placeholder).toBe('Name')
    expect(node.props.type).toBe('email')
  })

  it('wires onInput to read the event value', () => {
    const onInput = vi.fn()
    const node = el(TextInput({ onInput }))
    ;(node.props.onInput as (e: unknown) => void)({ target: { value: 'abc' } })
    expect(onInput).toHaveBeenCalledWith('abc')
  })

  it('forwards a reactive value accessor verbatim (controlled)', () => {
    const value = () => 'live'
    expect(el(TextInput({ value })).props.value).toBe(value)
  })
})

describe('Pressable', () => {
  it('uses a real `onClick` (never a no-op `onPress` host prop) + role/button + tabindex', () => {
    const onPress = vi.fn()
    const node = el(Pressable({ onPress, children: 'Tap' }))
    expect(typeof node.props.onClick).toBe('function')
    expect(node.props.onPress).toBeUndefined() // no fake cross-platform 'press' host prop
    expect(node.props.role).toBe('button')
    expect(node.props.tabindex).toBe(0)
    ;(node.props.onClick as () => void)()
    expect(onPress).toHaveBeenCalledTimes(1)
  })

  it('fires onPress on Enter / Space but not other keys', () => {
    const onPress = vi.fn()
    const node = el(Pressable({ onPress }))
    const onKeyDown = node.props.onKeyDown as (e: unknown) => void
    onKeyDown({ key: 'Enter' })
    onKeyDown({ key: ' ' })
    onKeyDown({ key: 'a' })
    expect(onPress).toHaveBeenCalledTimes(2)
  })

  it('disabled blocks onPress, sets aria-disabled, drops tabindex', () => {
    const onPress = vi.fn()
    const node = el(Pressable({ onPress, disabled: true }))
    expect(node.props['aria-disabled']).toBe('true')
    expect(node.props.tabindex).toBeUndefined()
    ;(node.props.onClick as () => void)()
    expect(onPress).not.toHaveBeenCalled()
  })

  it('a style function is lowered to a reactive accessor of the interaction state', () => {
    const node = el(Pressable({ style: (s) => ({ opacity: s.pressed ? 0.5 : 1 }) }))
    expect(typeof node.props.style).toBe('function')
    expect((node.props.style as () => unknown)()).toEqual({ opacity: 1 })
  })

  it('a plain reactive (0-arg) style accessor is NOT subscribed to interaction state', () => {
    const color = signal('red')
    const node = el(Pressable({ style: () => ({ backgroundColor: color() }) }))
    const styleAccessor = node.props.style as () => unknown
    let runs = 0
    const stop = effect(() => {
      runs++
      styleAccessor()
    })
    expect(runs).toBe(1)
    // Toggling hover/press must NOT re-run a style that only depends on `color`.
    ;(node.props.onPointerEnter as (e: unknown) => void)(null)
    ;(node.props.onPointerDown as (e: unknown) => void)(null)
    expect(runs).toBe(1) // pre-fix: re-ran because the wrapper read state()
    color.set('blue') // ...but it still reacts to its own dependency
    expect(runs).toBe(2)
    expect(styleAccessor()).toEqual({ backgroundColor: 'blue' })
    stop()
  })

  it('calls preventDefault on Space activation (so a div[role=button] does not scroll)', () => {
    const node = el(Pressable({ onPress: () => {} }))
    const onKeyDown = node.props.onKeyDown as (e: unknown) => void
    const prevented = vi.fn()
    onKeyDown({ key: ' ', preventDefault: prevented })
    expect(prevented).toHaveBeenCalledTimes(1)
  })

  it('a disabled Pressable stays inert — interaction signals do not update', () => {
    const node = el(Pressable({ disabled: true, style: (s) => ({ opacity: s.pressed ? 0.5 : 1 }) }))
    const style = node.props.style as () => unknown
    ;(node.props.onPointerEnter as (e: unknown) => void)(null)
    ;(node.props.onPointerDown as (e: unknown) => void)(null)
    expect(style()).toEqual({ opacity: 1 }) // resting; no press/hover feedback while disabled
  })
})

describe('usePressable', () => {
  it('exposes interaction state that its handlers drive', () => {
    const { state, handlers } = usePressable()
    expect(state()).toEqual({ hovered: false, pressed: false, focused: false })
    handlers.onPointerEnter?.(null)
    handlers.onPointerDown?.(null)
    expect(state()).toEqual({ hovered: true, pressed: true, focused: false })
    handlers.onPointerLeave?.(null)
    expect(state()).toEqual({ hovered: false, pressed: false, focused: false })
  })
})

describe('Button', () => {
  it('wraps a Pressable around a title Text', () => {
    const node = el(Button({ title: 'Save', onPress: () => {} }))
    expect(node.type).toBe(Pressable)
  })

  it('renders the title through the real render path (empty children array → fallback)', () => {
    // The renderer invokes Button with children === [] (not undefined), so this exercises the
    // empty-array fallback that a direct call would miss.
    const html = renderToString(createElement(Button, { title: 'Save' }))
    expect(html).toContain('Save')
  })

  it('prefers explicit children over the title', () => {
    const html = renderToString(
      createElement(Button, { title: 'Save' }, createElement(Text, null, 'Custom')),
    )
    expect(html).toContain('Custom')
    expect(html).not.toContain('Save')
  })
})

describe('layout primitives', () => {
  it('Stack composes flex layout + merges caller style (caller wins)', () => {
    // Stack executes to a View element carrying the merged style.
    const view = el(Stack({ direction: 'row', gap: 8, align: 'center', style: { gap: 16 } }))
    expect(view.type).toBe(View)
    expect(view.props.style).toMatchObject({
      display: 'flex',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 16, // caller style overrides the base gap
    })
  })

  it('Row and Column pass the direction down to Stack', () => {
    expect(el(Row({})).props.direction).toBe('row')
    expect(el(Column({})).props.direction).toBe('column')
  })

  it('Spacer is flexible by default, fixed when sized', () => {
    expect(el(Spacer({})).props.style).toEqual({ flex: 1 })
    expect(el(Spacer({ size: 12 })).props.style).toEqual({ width: 12, height: 12 })
  })

  it('ScrollView sets overflow:auto and forwards onScroll', () => {
    const onScroll = vi.fn()
    const node = el(ScrollView({ onScroll }))
    expect(node.type).toBe('scrollview')
    expect((node.props.style as Record<string, unknown>).overflow).toBe('auto')
    expect(node.props.onScroll).toBe(onScroll)
  })

  it('ScrollView horizontal lays children in a row and scrolls (not a no-op)', () => {
    const node = el(ScrollView({ horizontal: true }))
    // Distinct tag at creation so a native host can pick HorizontalScrollView vs ScrollView.
    expect(node.type).toBe('horizontalscrollview')
    const style = node.props.style as Record<string, unknown>
    expect(style.display).toBe('flex') // without display:flex the flexDirection is inert
    expect(style.flexDirection).toBe('row') // real horizontal layout via the style channel
    expect(style.flexWrap).toBe('nowrap')
    expect(style.overflow).toBe('auto')
    const vertical = el(ScrollView({}))
    expect(vertical.type).toBe('scrollview') // vertical keeps the plain tag
    expect((vertical.props.style as Record<string, unknown>).flexDirection).toBeUndefined()
  })
})

describe('TextInput / Image — extended props', () => {
  it('TextInput lowers multiline → textarea with keyboard/secure/autofill attrs', () => {
    const node = TextInput({
      multiline: true,
      rows: 4,
      secureTextEntry: true,
      keyboardType: 'email',
      returnKeyType: 'send',
      autoCapitalize: 'none',
      autoComplete: 'email',
      maxLength: 50,
      autoFocus: true,
    }) as MindeesElement
    expect(node.type).toBe('textarea')
    expect(node.props.rows).toBe(4)
    expect(node.props.type).toBe('password') // secureTextEntry overrides type
    expect(node.props.inputmode).toBe('email')
    expect(node.props.enterkeyhint).toBe('send')
    expect(node.props.autocapitalize).toBe('none')
    expect(node.props.autocomplete).toBe('email')
    expect(node.props.maxlength).toBe(50)
    expect(node.props.autofocus).toBe(true)
  })

  it('TextInput onSubmitEditing fires only on Enter, with the value', () => {
    const onSubmit = vi.fn()
    const node = TextInput({ onSubmitEditing: onSubmit }) as MindeesElement
    const onKeyDown = node.props.onKeyDown as (e: unknown) => void
    onKeyDown({ key: 'a', target: { value: 'hi' } })
    expect(onSubmit).not.toHaveBeenCalled()
    onKeyDown({ key: 'Enter', target: { value: 'hi' } })
    expect(onSubmit).toHaveBeenCalledWith('hi')
  })

  it('Image lowers resizeMode → objectFit + loading/decoding/fetchPriority + fallback swap', () => {
    const node = Image({
      src: 'a.png',
      label: 'A',
      resizeMode: 'cover',
      loading: 'lazy',
      decoding: 'async',
      fetchPriority: 'high',
      width: 100,
      height: 80,
      fallbackSrc: 'fb.png',
    }) as MindeesElement
    expect((node.props.style as Record<string, unknown>).objectFit).toBe('cover')
    expect(node.props.loading).toBe('lazy')
    expect(node.props.decoding).toBe('async')
    expect(node.props.fetchpriority).toBe('high')
    expect(node.props.width).toBe(100)
    expect(node.props.height).toBe(80)
    const onError = node.props.onError as (e: unknown) => void
    const target = { src: 'a.png' }
    onError({ target }) // a load failure swaps in the fallback
    expect(target.src).toBe('fb.png')
  })
})
