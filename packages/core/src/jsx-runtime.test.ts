import { describe, expect, it } from 'vitest'
import { Fragment as ComponentFragment, createElement, isElement } from './component'
import { Fragment, jsx, jsxs } from './jsx-runtime'

describe('automatic JSX runtime', () => {
  it('re-exports the same Fragment marker as the component module', () => {
    expect(Fragment).toBe(ComponentFragment)
  })

  it('jsx builds an element with props and no children', () => {
    const el = jsx('view', { id: 'root' })
    expect(isElement(el)).toBe(true)
    expect(el.type).toBe('view')
    expect(el.props).toEqual({ id: 'root' })
    expect(el.children).toEqual([])
  })

  it('jsx unwraps a single child from props.children', () => {
    const child = createElement('text', null, 'hi')
    const el = jsx('view', { id: 'a', children: child })
    expect(el.props).toEqual({ id: 'a' }) // children is not left on props
    expect(el.children).toEqual([child])
  })

  it('jsxs spreads an array of children (no nesting)', () => {
    const el = jsxs('view', { children: ['a', 'b', 'c'] })
    // Children land as positional children, not a single nested array.
    expect(el.children).toEqual(['a', 'b', 'c'])
  })

  it('passes the JSX key through to the element', () => {
    const el = jsx('view', { id: 'a' }, 'k1')
    expect(el.key).toBe('k1')
  })

  it('keeps a reactive function child intact (fine-grained region)', () => {
    const fn = () => 'live'
    const el = jsx('text', { children: fn })
    expect(el.children).toEqual([fn])
  })

  it('builds component elements (capitalized tag → function type)', () => {
    const Box = (props: { children?: unknown }) =>
      createElement('view', null, props.children as never)
    const el = jsx(Box, { children: 'x' })
    expect(el.type).toBe(Box)
  })
})
