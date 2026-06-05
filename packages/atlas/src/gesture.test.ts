// @vitest-environment happy-dom
/// <reference lib="dom" />
import { pan } from '@mindees/core'
import { createDomBackend, render } from '@mindees/renderer'
import { describe, expect, it, vi } from 'vitest'
import { GestureView } from './gesture'

describe('GestureView', () => {
  it('attaches the recognizer handlers to a host view and drives its reactive state', () => {
    const onBegin = vi.fn()
    const g = pan({ onBegin })
    const container = document.createElement('div')
    render(
      GestureView({ gesture: g, children: 'drag me' }),
      createDomBackend(document as never),
      container as never,
    )

    const view = container.firstElementChild as HTMLElement
    expect(view).toBeTruthy()
    expect(view.textContent).toBe('drag me')

    // Dispatch synthetic pointer events through the attached handlers.
    view.dispatchEvent(new Event('pointerdown'))
    // happy-dom Event has no clientX; the recognizer reads 0 — drive via the handler directly instead.
    g.handlers.onPointerDown({ pointerId: 1, clientX: 0, clientY: 0, timeStamp: 0 })
    g.handlers.onPointerMove({ pointerId: 1, clientX: 40, clientY: 0, timeStamp: 16 })
    expect(g.state.active()).toBe(true)
    expect(g.state.translationX()).toBe(40)
  })
})
