import { createElement, portal, signal } from '@mindees/core'
import { describe, expect, it } from 'vitest'
import { createHeadlessBackend, createHeadlessRoot } from './headless'
import { render } from './render'

describe('bindPortalChild', () => {
  it('mounts portal children into the overlay target, not the logical parent', () => {
    const overlay = createHeadlessRoot('overlay')
    const backend = createHeadlessBackend({ overlayRoot: overlay })
    const root = createHeadlessRoot()
    render(createElement('view', {}, portal(createElement('text', {}, 'modal'))), backend, root)

    // The logical parent (the view) holds only the empty slot marker — no modal markup.
    expect(backend.serialize(root)).not.toContain('modal')
    // The overlay holds the relocated content.
    expect(overlay.children.map((c) => backend.serialize(c)).join('')).toContain('modal')
  })

  it('keeps following siblings ordered around the portal slot marker', () => {
    const overlay = createHeadlessRoot('overlay')
    const backend = createHeadlessBackend({ overlayRoot: overlay })
    const root = createHeadlessRoot()
    render(
      createElement(
        'view',
        {},
        createElement('text', {}, 'before'),
        portal(createElement('text', {}, 'X')),
        createElement('text', {}, 'after'),
      ),
      backend,
      root,
    )
    const html = backend.serialize(root)
    expect(html.indexOf('before')).toBeLessThan(html.indexOf('after'))
    expect(html).not.toContain('X') // relocated
  })

  it('disposes portaled content from the overlay on unmount (no leak)', () => {
    const overlay = createHeadlessRoot('overlay')
    const backend = createHeadlessBackend({ overlayRoot: overlay })
    const root = createHeadlessRoot()
    const mounted = render(portal(createElement('text', {}, 'm')), backend, root)
    expect(overlay.children.length).toBeGreaterThan(0)
    mounted.dispose()
    expect(overlay.children.length).toBe(0) // content + content-marker removed
  })

  it('mounts/unmounts the portal as a gating region toggles', () => {
    const overlay = createHeadlessRoot('overlay')
    const backend = createHeadlessBackend({ overlayRoot: overlay })
    const root = createHeadlessRoot()
    const show = signal(false)
    render(() => (show() ? portal(createElement('text', {}, 'M')) : null), backend, root)
    expect(overlay.children.length).toBe(0)
    show.set(true)
    expect(overlay.children.map((c) => backend.serialize(c)).join('')).toContain('M')
    show.set(false)
    expect(overlay.children.length).toBe(0) // portal onCleanup fired on the region re-run
  })

  it('mounts reactive portal children, swapping content in the overlay', () => {
    const overlay = createHeadlessRoot('overlay')
    const backend = createHeadlessBackend({ overlayRoot: overlay })
    const root = createHeadlessRoot()
    const n = signal(1)
    render(
      portal(() => createElement('text', {}, `n${n()}`)),
      backend,
      root,
    )
    expect(overlay.children.map((c) => backend.serialize(c)).join('')).toContain('n1')
    n.set(2)
    const html = overlay.children.map((c) => backend.serialize(c)).join('')
    expect(html).toContain('n2')
    expect(html).not.toContain('n1')
  })

  it('falls back to in-place mount when the backend has no overlay (SSR-correct)', () => {
    const backend = createHeadlessBackend() // no overlayRoot configured
    const root = createHeadlessRoot()
    render(createElement('view', {}, portal(createElement('text', {}, 'inline'))), backend, root)
    expect(backend.serialize(root)).toContain('inline') // mounted in the logical parent
  })
})
