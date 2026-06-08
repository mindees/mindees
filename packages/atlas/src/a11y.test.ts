// @vitest-environment happy-dom
/// <reference lib="dom" />
import { describe, expect, it } from 'vitest'
import { announce } from './a11y'

const nextFrame = (): Promise<void> => new Promise((r) => requestAnimationFrame(() => r()))

describe('announce', () => {
  it('creates a visually-hidden live region and sets the message', async () => {
    announce('3 results found', 'polite')
    const region = document.querySelector('[aria-live="polite"]') as unknown as HTMLElement
    expect(region).not.toBeNull()
    expect(region.getAttribute('role')).toBe('status')
    expect(region.getAttribute('aria-atomic')).toBe('true')
    expect(region.style.position).toBe('absolute') // visually hidden
    await nextFrame()
    expect(region.textContent).toBe('3 results found')
  })

  it('uses role=alert for assertive and reuses ONE region per politeness', async () => {
    announce('Saved', 'assertive')
    const before = document.querySelectorAll('[aria-live="assertive"]').length
    expect(
      (document.querySelector('[aria-live="assertive"]') as unknown as HTMLElement).getAttribute(
        'role',
      ),
    ).toBe('alert')
    announce('Saved again', 'assertive')
    expect(document.querySelectorAll('[aria-live="assertive"]').length).toBe(before) // not duplicated
  })

  it('joins both same-frame messages (neither is lost)', async () => {
    announce('First note', 'polite')
    announce('Second note', 'polite')
    await nextFrame()
    const region = document.querySelector('[aria-live="polite"]') as unknown as HTMLElement
    expect(region.textContent).toContain('First note')
    expect(region.textContent).toContain('Second note')
  })
})
