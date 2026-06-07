// @vitest-environment happy-dom
/// <reference lib="dom" />
import { createElement, signal } from '@mindees/core'
import { createDomBackend, render } from '@mindees/renderer'
import { describe, expect, it } from 'vitest'
import { Show } from './show'

const doc = () => document as never

describe('Show', () => {
  it('renders children when truthy and fallback when falsy, reactively', () => {
    const open = signal(false)
    const container = document.createElement('div')
    render(
      Show({
        when: () => open(),
        fallback: () => createElement('text', {}, 'closed'),
        children: createElement('text', {}, 'open'),
      }),
      createDomBackend(doc()),
      container as never,
    )
    expect(container.textContent).toContain('closed')
    open.set(true)
    expect(container.textContent).toContain('open')
    open.set(false)
    expect(container.textContent).toContain('closed')
  })

  it('passes the narrowed truthy value to a function child', () => {
    const user = signal<{ name: string } | null>(null)
    const container = document.createElement('div')
    render(
      Show({
        when: () => user(),
        fallback: () => createElement('text', {}, 'anon'),
        children: (u) => createElement('text', {}, `hi ${u.name}`),
      }),
      createDomBackend(doc()),
      container as never,
    )
    expect(container.textContent).toContain('anon')
    user.set({ name: 'Ada' })
    expect(container.textContent).toContain('hi Ada')
  })

  it('accepts a static (non-accessor) condition', () => {
    const container = document.createElement('div')
    render(
      Show({ when: true, children: createElement('text', {}, 'static') }),
      createDomBackend(doc()),
      container as never,
    )
    expect(container.textContent).toContain('static')
  })
})
