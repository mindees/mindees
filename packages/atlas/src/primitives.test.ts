import { createElement, isElement, type MindeesElement } from '@mindees/core'
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
})
