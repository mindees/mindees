// @vitest-environment happy-dom
/// <reference lib="dom" />
import { createElement, signal } from '@mindees/core'
import { createDomBackend, render } from '@mindees/renderer'
import { describe, expect, it } from 'vitest'
import { For } from './for'

describe('atlas For', () => {
  it('renders a keyed list and reconciles in place', () => {
    const items = signal([
      { id: 1, name: 'a' },
      { id: 2, name: 'b' },
    ])
    const region = For({
      each: () => items(),
      key: (r) => r.id,
      children: (item) => createElement('view', { 'data-id': item().id }, () => item().name),
    })
    const container = document.createElement('div')
    render(region, createDomBackend(document as never), container as never)
    expect(container.textContent).toBe('ab')
    items.set([
      { id: 2, name: 'b' },
      { id: 1, name: 'a' },
    ])
    expect(container.textContent).toBe('ba')
  })

  it('moves the SAME DOM node on reorder (what preserves focus/caret/scroll in a real browser)', () => {
    const items = signal([{ id: 1 }, { id: 2 }, { id: 3 }])
    const region = For({
      each: () => items(),
      key: (r) => r.id,
      children: (item) => createElement('input', { 'data-id': () => item().id }),
    })
    const container = document.createElement('div')
    render(region, createDomBackend(document as never), container as never)

    // The real DOM node for id=2. A naive items.map() would discard it on any change
    // (losing focus/caret/scroll); keyed reconciliation keeps + moves this exact node.
    const before = container.querySelector('input[data-id="2"]') as HTMLInputElement
    expect(before).toBeTruthy()

    items.set([{ id: 2 }, { id: 1 }, { id: 3 }]) // move id=2 to the front
    const after = container.querySelector('input[data-id="2"]')
    expect(after).toBe(before) // same node object — moved, not rebuilt
    expect(Array.from(container.querySelectorAll('input')).indexOf(before)).toBe(0) // now first
  })
})
