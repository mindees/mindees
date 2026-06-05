import { createElement, isElement, type MindeesElement, signal } from '@mindees/core'
import {
  createHeadlessBackend,
  createHeadlessRoot,
  type HeadlessNode,
  render,
  renderToString,
} from '@mindees/renderer'
import { describe, expect, it, vi } from 'vitest'
import {
  ActivityIndicator,
  Avatar,
  Badge,
  Card,
  Chip,
  Divider,
  KeyboardAvoidingView,
  ProgressBar,
  SafeAreaView,
  Switch,
} from './components'
import { setEnvironment } from './environment'

function el(node: unknown): MindeesElement {
  if (!isElement(node)) throw new Error('expected an element')
  return node
}
const obj = (v: unknown) => v as Record<string, unknown>
/** Resolve a (possibly reactive) style prop to its object. */
const styleOf = (node: MindeesElement): Record<string, unknown> => {
  const s = node.props.style
  return obj(typeof s === 'function' ? (s as () => unknown)() : s)
}

describe('Card', () => {
  it('is a padded, rounded surface; variant controls border/bg', () => {
    expect(styleOf(el(Card({ children: 'x' })))).toMatchObject({ padding: 16, borderRadius: 16 })
    expect(styleOf(el(Card({ variant: 'outlined', children: 'x' }))).borderWidth).toBe(1)
    expect(styleOf(el(Card({ variant: 'filled', children: 'x' }))).backgroundColor).toBeTruthy()
  })
})

describe('Divider', () => {
  it('renders a separator-role hairline (orientation-aware)', () => {
    const h = el(Divider({}))
    expect(h.props.role).toBe('separator')
    expect(styleOf(h).height).toBe(1)
    expect(styleOf(el(Divider({ orientation: 'vertical', thickness: 2 }))).width).toBe(2)
  })
})

describe('Badge', () => {
  it('renders its content with an AA-contrast tone background', () => {
    expect(renderToString(createElement(Badge, { tone: 'success' }, '3'))).toContain('3')
    expect(styleOf(el(Badge({ tone: 'danger', children: '!' }))).backgroundColor).toBe('#b91c1c')
  })
})

describe('Avatar', () => {
  it('shows initials when there is no src', () => {
    expect(renderToString(createElement(Avatar, { name: 'Ada Lovelace' }))).toContain('AL')
  })
  it('renders an img when src is provided', () => {
    const html = renderToString(createElement(Avatar, { src: 'a.png', name: 'Ada' }))
    expect(html).toContain('<img')
    expect(html).toContain('a.png')
  })
})

describe('Chip', () => {
  it('is a button-role token carrying its label', () => {
    const html = renderToString(createElement(Chip, { label: 'Filter' }))
    expect(html).toContain('Filter')
    expect(html).toContain('role="button"')
  })
  it('fires onPress', () => {
    const onPress = vi.fn()
    ;(el(Chip({ label: 'Tap', onPress })).props.onPress as () => void)()
    expect(onPress).toHaveBeenCalledTimes(1)
  })
})

describe('Switch', () => {
  it('has switch role and toggles the controlled value on press', () => {
    const value = signal(false)
    const node = el(Switch({ value, onValueChange: (v) => value.set(v) }))
    expect(node.props.role).toBe('switch')
    ;(node.props.onPress as () => void)()
    expect(value()).toBe(true)
  })
  it('a disabled switch is inert (no onPress)', () => {
    expect(
      el(Switch({ value: true, disabled: true, onValueChange: () => {} })).props.onPress,
    ).toBeUndefined()
  })
})

describe('SafeAreaView', () => {
  it('pads by the live safe-area insets, honoring `edges`', () => {
    setEnvironment({ safeAreaInsets: { top: 24, right: 0, bottom: 48, left: 0 } })
    expect(styleOf(el(SafeAreaView({ children: 'x' })))).toMatchObject({
      paddingTop: 24,
      paddingBottom: 48,
    })
    const topOnly = styleOf(el(SafeAreaView({ edges: ['top'], children: 'x' })))
    expect(topOnly.paddingTop).toBe(24)
    expect(topOnly.paddingBottom).toBe(0)
  })
})

describe('KeyboardAvoidingView', () => {
  it('pads its bottom by the live keyboard height', () => {
    setEnvironment({ keyboard: { visible: true, height: 300 } })
    expect(styleOf(el(KeyboardAvoidingView({ children: 'x' }))).paddingBottom).toBe(300)
  })
})

describe('ProgressBar', () => {
  it('has progressbar role and a clamped percentage fill', () => {
    const node = el(ProgressBar({ value: 0.5 }))
    expect(node.props.role).toBe('progressbar')
    const fill = el((node.children as unknown[])[0])
    expect(styleOf(fill).width).toBe('50%')
  })
  it('clamps out-of-range progress', () => {
    const node = el(ProgressBar({ value: 2 }))
    expect(styleOf(el((node.children as unknown[])[0])).width).toBe('100%')
  })
})

describe('ActivityIndicator', () => {
  it('emits the activityindicator tag with size/color style + a11y', () => {
    const node = el(ActivityIndicator({ size: 32, color: '#ffffff' }))
    expect(node.type).toBe('activityindicator')
    expect(node.props.role).toBe('status')
    expect(node.props['aria-busy']).toBe('true')
    expect(styleOf(node)).toMatchObject({ width: 32, height: 32, color: '#ffffff' })
  })

  it('renders nothing when animating is false', () => {
    expect(ActivityIndicator({ animating: false })).toBeNull()
  })

  it('defaults the color to the theme primary', () => {
    setEnvironment({ colorScheme: 'light' })
    expect(styleOf(el(ActivityIndicator({}))).color).toBe('#2563eb') // blue-600 (light primary)
  })
})

describe('a11y reactivity', () => {
  const mount = (node: unknown) => {
    const backend = createHeadlessBackend()
    const root = createHeadlessRoot()
    render(node as MindeesElement, backend, root)
    return root
  }
  const findByRole = (n: HeadlessNode, role: string): HeadlessNode | undefined => {
    if ((n.props as Record<string, unknown> | undefined)?.role === role) return n
    for (const c of n.children) {
      const f = findByRole(c, role)
      if (f) return f
    }
    return undefined
  }

  it('Switch aria-checked tracks the value reactively', () => {
    const value = signal(false)
    const host = findByRole(mount(Switch({ value, onValueChange: (v) => value.set(v) })), 'switch')
    expect(host?.props['aria-checked']).toBe('false')
    value.set(true)
    expect(host?.props['aria-checked']).toBe('true')
  })

  it('ProgressBar exposes a reactive aria-valuenow within min/max', () => {
    const value = signal(0.25)
    const host = findByRole(mount(ProgressBar({ value })), 'progressbar')
    expect(host?.props['aria-valuemin']).toBe('0')
    expect(host?.props['aria-valuemax']).toBe('1')
    expect(host?.props['aria-valuenow']).toBe('0.25')
    value.set(0.9)
    expect(host?.props['aria-valuenow']).toBe('0.9')
  })

  it('Chip aria-pressed tracks selection reactively', () => {
    const selected = signal(false)
    const host = findByRole(mount(Chip({ label: 'F', selected })), 'button')
    expect(host?.props['aria-pressed']).toBe('false')
    selected.set(true)
    expect(host?.props['aria-pressed']).toBe('true')
  })
})
