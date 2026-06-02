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

  it('removes nodes on dispose', () => {
    const container = document.createElement('div')
    const backend = createDomBackend(document as never)
    const m = render(h('view', null, 'x'), backend, container as never)
    expect(container.childNodes.length).toBe(1)
    m.dispose()
    expect(container.childNodes.length).toBe(0)
  })
})
