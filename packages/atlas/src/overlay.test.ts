// @vitest-environment happy-dom
/// <reference lib="dom" />
import { createElement, provideContext, signal } from '@mindees/core'
import { createDomBackend, render } from '@mindees/renderer'
import { describe, expect, it, vi } from 'vitest'
import { FocusScope, Modal, Toast } from './overlay'
import { VisibilityScope } from './visibility'

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

describe('Toast', () => {
  it('renders the message when visible and nothing when hidden', () => {
    const visible = signal(false)
    const container = document.createElement('div')
    render(Toast({ visible, message: 'Saved' }), createDomBackend(doc()), container as never)
    expect(document.querySelector('[role="status"]')).toBeNull()
    visible.set(true)
    const status = document.querySelector('[role="status"]')
    expect(status?.textContent).toContain('Saved')
    visible.set(false)
    expect(document.querySelector('[role="status"]')).toBeNull() // unmounted on hide
  })

  it('auto-dismisses after the duration', () => {
    vi.useFakeTimers()
    try {
      const visible = signal(true)
      const onDismiss = vi.fn()
      const container = document.createElement('div')
      render(
        Toast({ visible, message: 'Bye', duration: 3000, onDismiss }),
        createDomBackend(doc()),
        container as never,
      )
      expect(onDismiss).not.toHaveBeenCalled()
      vi.advanceTimersByTime(3000)
      expect(onDismiss).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('FocusScope — focus trap', () => {
  it('wraps Tab from the last focusable back to the first (WCAG 2.4.3)', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    render(
      createElement(
        FocusScope,
        { label: 'dialog' },
        createElement('button', { id: 'b1' }, 'one'),
        createElement('button', { id: 'b2' }, 'two'),
      ),
      createDomBackend(doc()),
      container as never,
    )
    const dialog = container.querySelector('[role="dialog"]') as unknown as HTMLElement
    const b1 = container.querySelector('#b1') as unknown as HTMLElement
    const b2 = container.querySelector('#b2') as unknown as HTMLElement
    b2.focus()
    expect(document.activeElement).toBe(b2)
    // Tab on the last element wraps to the first.
    dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }))
    expect(document.activeElement).toBe(b1)
    // Shift+Tab on the first wraps to the last.
    dialog.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true }),
    )
    expect(document.activeElement).toBe(b2)
  })
})

describe('FocusScope — focus trap skips hidden focusables', () => {
  it('does not treat a display:none focusable as a Tab boundary', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    render(
      createElement(
        FocusScope,
        { label: 'd' },
        createElement('button', { id: 'v1' }, 'one'),
        // a kept-alive-but-hidden subtree (mirrors a tab navigator's inactive panel)
        createElement(
          'view',
          { style: { display: 'none' } },
          createElement('button', { id: 'hid' }, 'hidden'),
        ),
        createElement('button', { id: 'v2' }, 'two'),
      ),
      createDomBackend(doc()),
      container as never,
    )
    const dialog = container.querySelector('[role="dialog"]') as unknown as HTMLElement
    const v1 = container.querySelector('#v1') as unknown as HTMLElement
    const v2 = container.querySelector('#v2') as unknown as HTMLElement
    v2.focus() // last VISIBLE focusable
    dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }))
    // Without the visibility filter, the hidden button was the "last" → no wrap → focus would escape.
    expect(document.activeElement).toBe(v1)
  })
})

describe('Modal — VisibilityScope', () => {
  it('hides when its enclosing subtree is not visible, even while visible=true', () => {
    const active = signal(true)
    const container = document.createElement('div')
    document.body.appendChild(container)
    const Wrapper = () => {
      provideContext(VisibilityScope, () => active())
      return Modal({
        visible: true,
        label: 'ScopeTest',
        children: createElement('text', {}, 'scope-body'),
      })
    }
    const mounted = render(createElement(Wrapper, {}), createDomBackend(doc()), container as never)
    const dialog = () => document.querySelector('[aria-label="ScopeTest"]')
    expect(dialog()).toBeTruthy() // visible + in-scope
    active.set(false) // owning subtree hidden → overlay removed despite visible=true
    expect(dialog()).toBeNull()
    active.set(true) // back in scope → re-rendered
    expect(dialog()).toBeTruthy()
    mounted.dispose() // clean up so the overlay doesn't linger on the shared body layer
    container.remove()
  })

  it('does not auto-dismiss a Toast while it is hidden by VisibilityScope (off-screen)', () => {
    vi.useFakeTimers()
    try {
      const active = signal(true)
      const onDismiss = vi.fn()
      const container = document.createElement('div')
      document.body.appendChild(container)
      const Wrapper = () => {
        provideContext(VisibilityScope, () => active())
        return Toast({ visible: true, message: 'hi', duration: 3000, onDismiss })
      }
      const mounted = render(
        createElement(Wrapper, {}),
        createDomBackend(doc()),
        container as never,
      )
      active.set(false) // tab left before the timer elapses → toast scope-hidden (panel kept alive)
      vi.advanceTimersByTime(3000)
      expect(onDismiss).not.toHaveBeenCalled() // must NOT fire off-screen
      mounted.dispose()
      container.remove()
    } finally {
      vi.useRealTimers()
    }
  })
})
