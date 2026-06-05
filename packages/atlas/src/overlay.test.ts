// @vitest-environment happy-dom
/// <reference lib="dom" />
import { createElement, signal } from '@mindees/core'
import { createDomBackend, render } from '@mindees/renderer'
import { describe, expect, it, vi } from 'vitest'
import { Modal } from './overlay'

const doc = () => document as never

describe('Modal', () => {
  it('renders nothing when not visible, and portals into the overlay layer when opened', () => {
    const visible = signal(false)
    const container = document.createElement('div')
    render(
      Modal({ visible, label: 'Settings', children: createElement('text', {}, 'body') }),
      createDomBackend(doc()),
      container as never,
    )

    // Closed: nothing in the app container, and no overlay content.
    expect(container.textContent).toBe('')
    const overlay = () => document.querySelector('[data-mindees-overlay]')
    expect(overlay()?.textContent ?? '').not.toContain('body')

    visible.set(true)
    const dialog = document.querySelector('[role="dialog"]') as HTMLElement | null
    expect(dialog).toBeTruthy()
    expect(dialog?.getAttribute('aria-modal')).toBe('true')
    expect(dialog?.getAttribute('aria-label')).toBe('Settings')
    // The content lives in the overlay layer (on body), not the app container.
    expect(overlay()?.contains(dialog as Node)).toBe(true)
    expect(container.contains(dialog as Node)).toBe(false)

    visible.set(false)
    expect(document.querySelector('[role="dialog"]')).toBeNull() // unmounted on close
  })

  it('closes on scrim press and on Escape', () => {
    const visible = signal(true)
    const onRequestClose = vi.fn()
    const container = document.createElement('div')
    render(
      Modal({ visible, onRequestClose, children: createElement('text', {}, 'x') }),
      createDomBackend(doc()),
      container as never,
    )
    // Scrim press → close. The scrim is the focusable/pressable element with the "Close" label.
    const scrim = document.querySelector('[aria-label="Close"]') as HTMLElement | null
    expect(scrim).toBeTruthy()
    scrim?.dispatchEvent(new Event('click', { bubbles: true }))
    expect(onRequestClose).toHaveBeenCalledTimes(1)

    // Escape on the dialog → close.
    const dialog = document.querySelector('[role="dialog"]') as HTMLElement
    const ev = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
    dialog.dispatchEvent(ev)
    expect(onRequestClose).toHaveBeenCalledTimes(2)
  })

  it('restores focus to the trigger when closed', () => {
    const visible = signal(false)
    const trigger = document.createElement('button')
    const other = document.createElement('button')
    document.body.append(trigger, other)
    trigger.focus() // the element focused when the modal opens

    const container = document.createElement('div')
    render(
      Modal({ visible, children: createElement('text', {}, 'x') }),
      createDomBackend(doc()),
      container as never,
    )

    visible.set(true) // FocusScope captures `trigger` as the element to restore
    other.focus() // focus moves elsewhere while the modal is open
    expect(document.activeElement).toBe(other)

    visible.set(false) // on close, FocusScope restores focus to the captured trigger
    expect(document.activeElement).toBe(trigger)
    trigger.remove()
    other.remove()
  })
})

describe('FocusScope autofocus', () => {
  const doc2 = () => document as never
  it('auto-focuses the dialog once the subtree is connected', async () => {
    const visible = signal(false)
    const container = document.createElement('div')
    document.body.appendChild(container)
    render(
      Modal({ visible, label: 'S', children: createElement('text', {}, 'b') }),
      createDomBackend(doc2()),
      container as never,
    )
    visible.set(true)
    await Promise.resolve() // flush the deferred-focus microtask
    // Assert on the active element's own attributes (other tests' overlay layers persist on body,
    // so a bare [role=dialog] query could match a stale one).
    const active = document.activeElement as HTMLElement
    expect(active.getAttribute('role')).toBe('dialog')
    expect(active.getAttribute('aria-label')).toBe('S')
    container.remove()
  })
})
