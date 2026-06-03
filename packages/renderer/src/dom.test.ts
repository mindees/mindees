// @vitest-environment happy-dom
import { createElement as h, signal } from '@mindees/core'
import { describe, expect, it, vi } from 'vitest'
import { createDomBackend, domTagFor } from './dom'
import { render } from './render'

describe('domTagFor', () => {
  it('aliases semantic tags to HTML', () => {
    expect(domTagFor('view')).toBe('div')
    expect(domTagFor('text')).toBe('span')
    expect(domTagFor('button')).toBe('button')
  })
  it('passes unknown tags through', () => {
    expect(domTagFor('my-widget')).toBe('my-widget')
  })
})

describe('DOM backend (happy-dom)', () => {
  it('renders elements + text into real DOM', () => {
    const container = document.createElement('div')
    const backend = createDomBackend(document as never)
    render(h('view', { id: 'app' }, h('text', null, 'Hello')), backend, container as never)
    expect(container.innerHTML).toBe('<div id="app"><span>Hello</span></div>')
  })

  it('applies a reactive attribute fine-grainedly', () => {
    const container = document.createElement('div')
    const backend = createDomBackend(document as never)
    const cls = signal('one')
    render(h('view', { class: () => cls() }), backend, container as never)
    const div = container.firstElementChild as HTMLElement
    expect(div.getAttribute('class')).toBe('one')
    cls.set('two')
    expect(div.getAttribute('class')).toBe('two')
  })

  it('patches reactive text in place', () => {
    const container = document.createElement('div')
    const backend = createDomBackend(document as never)
    const n = signal(1)
    render(
      h('view', null, () => n()),
      backend,
      container as never,
    )
    expect(container.textContent).toBe('1')
    n.set(42)
    expect(container.textContent).toBe('42')
  })

  it('keeps a conditional region in its DOM slot among siblings', () => {
    const container = document.createElement('div')
    const backend = createDomBackend(document as never)
    const show = signal(false)
    render(
      h(
        'view',
        null,
        h('text', null, 'H'),
        () => (show() ? h('view', null, 'X') : null),
        h('text', null, 'T'),
      ),
      backend,
      container as never,
    )
    expect(container.innerHTML).toBe('<div><span>H</span><span>T</span></div>')
    show.set(true)
    expect(container.innerHTML).toBe('<div><span>H</span><div>X</div><span>T</span></div>')
    show.set(false)
    expect(container.innerHTML).toBe('<div><span>H</span><span>T</span></div>')
  })

  it('wires event listeners from onX props', () => {
    const container = document.createElement('div')
    const backend = createDomBackend(document as never)
    const onClick = vi.fn()
    render(h('button', { onClick }, 'Tap'), backend, container as never)
    const btn = container.firstElementChild as HTMLElement
    btn.dispatchEvent(new Event('click'))
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('applies a style object', () => {
    const container = document.createElement('div')
    const backend = createDomBackend(document as never)
    render(h('view', { style: { color: 'red' } }), backend, container as never)
    const div = container.firstElementChild as HTMLElement
    expect(div.style.color).toBe('red')
  })

  it('appends px to numeric dimensional style values, leaving unitless props raw', () => {
    const container = document.createElement('div')
    const backend = createDomBackend(document as never)
    render(
      h('view', { style: { width: 120, marginTop: 8, opacity: 0.5, flexGrow: 2, zIndex: 3 } }),
      backend,
      container as never,
    )
    const div = container.firstElementChild as HTMLElement
    expect(div.style.width).toBe('120px')
    expect(div.style.marginTop).toBe('8px')
    expect(div.style.opacity).toBe('0.5') // unitless
    expect(div.style.flexGrow).toBe('2') // unitless
    expect(div.style.zIndex).toBe('3') // unitless
  })

  it('skips nullish / non-finite style values instead of writing "undefined"/"NaN"', () => {
    const container = document.createElement('div')
    const backend = createDomBackend(document as never)
    render(
      h('view', { style: { width: undefined, height: null, opacity: Number.NaN, color: 'red' } }),
      backend,
      container as never,
    )
    const div = container.firstElementChild as HTMLElement
    expect(div.style.width).toBe('')
    expect(div.style.height).toBe('')
    expect(div.style.opacity).toBe('')
    expect(div.style.color).toBe('red')
  })

  it('writes form-control `value` as the live property so a controlled input updates after edit', () => {
    const container = document.createElement('div')
    const backend = createDomBackend(document as never)
    const value = signal('initial')
    render(h('textinput', { value: () => value() }), backend, container as never)
    const input = container.firstElementChild as HTMLInputElement
    expect(input.value).toBe('initial')
    // Simulate a user edit (diverges the property from the attribute), then a controlled push.
    input.value = 'typed by user'
    value.set('reset by code')
    expect(input.value).toBe('reset by code') // property updated — not a no-op
    expect(input.hasAttribute('value')).toBe(false) // written as property, not attribute
  })

  it('disposes the current content of a reactive region in a top-level array (no leak, no throw)', () => {
    const container = document.createElement('div')
    const backend = createDomBackend(document as never)
    const show = signal(true)
    // Exercises the real removeChild path: the region's cleanup must remove the
    // post-swap content, and must not double-remove (removeChild throws on a
    // non-child node).
    const m = render(
      [() => (show() ? h('a', null, '1') : h('b', null, '2'))],
      backend,
      container as never,
    )
    expect(container.innerHTML).toBe('<a>1</a>')
    show.set(false)
    expect(container.innerHTML).toBe('<b>2</b>')
    expect(() => m.dispose()).not.toThrow()
    expect(container.childNodes.length).toBe(0)
  })
})
