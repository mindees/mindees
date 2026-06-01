import { describe, expect, it, vi } from 'vitest'
import { effect } from '../reactive'
import {
  type Component,
  createElement,
  Fragment,
  createElement as h,
  isElement,
  renderComponent,
} from './component'

describe('createElement', () => {
  it('builds an element with type, props, and children', () => {
    const el = h('view', { id: 'root' }, 'hello')
    expect(isElement(el)).toBe(true)
    expect(el.type).toBe('view')
    expect(el.props).toEqual({ id: 'root' })
    expect(el.children).toEqual(['hello'])
  })

  it('extracts key out of props', () => {
    const el = h('item', { key: 7, label: 'x' })
    expect(el.key).toBe(7)
    expect(el.props).toEqual({ label: 'x' })
  })

  it('prefers variadic children over a children prop', () => {
    const el = h('view', { children: 'ignored' }, 'a', 'b')
    expect(el.children).toEqual(['a', 'b'])
  })

  it('falls back to the children prop when no variadic children', () => {
    const el = h('view', { children: 'kept' })
    expect(el.children).toEqual(['kept'])
  })

  it('accepts a component function as type and Fragment', () => {
    const Comp: Component<{ n: number }> = (p) => h('text', null, String(p.n))
    const el = h(Comp as unknown as string, { n: 1 } as Record<string, unknown>)
    expect(typeof el.type).toBe('function')
    const frag = h(Fragment as unknown as string, null, 'a', 'b')
    expect(frag.children).toEqual(['a', 'b'])
  })

  it('freezes props and children (immutable elements)', () => {
    const el = h('view', { a: 1 })
    expect(Object.isFrozen(el.props)).toBe(true)
    expect(Object.isFrozen(el.children)).toBe(true)
  })

  it('isElement rejects plain objects and primitives', () => {
    expect(isElement({ type: 'view' })).toBe(false)
    expect(isElement(null)).toBe(false)
    expect(isElement('view')).toBe(false)
  })
})

describe('renderComponent', () => {
  it('returns the produced node', () => {
    const Comp: Component<{ name: string }> = (p) => h('text', null, `hi ${p.name}`)
    const { node } = renderComponent(Comp, { name: 'mindees' })
    expect(isElement(node)).toBe(true)
  })

  it('disposes effects created during render', () => {
    const cleanup = vi.fn()
    const Comp: Component<Record<string, never>> = () => {
      effect(() => () => cleanup())
      return h('view', null)
    }
    const { dispose } = renderComponent(Comp, {})
    expect(cleanup).not.toHaveBeenCalled()
    dispose()
    expect(cleanup).toHaveBeenCalledTimes(1)
  })
})

// createElement is also exported as the default factory.
describe('exports', () => {
  it('createElement is available', () => {
    expect(typeof createElement).toBe('function')
  })
})
