// @vitest-environment happy-dom
/// <reference lib="dom" />
import { createElement, signal } from '@mindees/core'
import { createDomBackend, render } from '@mindees/renderer'
import { describe, expect, it } from 'vitest'
import { ErrorBoundary } from './error-boundary'

const doc = () => document as never

describe('ErrorBoundary', () => {
  it('renders children when they do not throw', () => {
    const container = document.createElement('div')
    render(
      ErrorBoundary({
        fallback: () => createElement('text', {}, 'fallback'),
        children: () => createElement('text', {}, 'ok'),
      }),
      createDomBackend(doc()),
      container as never,
    )
    expect(container.textContent).toContain('ok')
    expect(container.textContent).not.toContain('fallback')
  })

  it('renders the fallback (with the error) when children throw', () => {
    const container = document.createElement('div')
    render(
      ErrorBoundary({
        fallback: (err) => createElement('text', {}, `caught: ${(err as Error).message}`),
        children: () => {
          throw new Error('boom')
        },
      }),
      createDomBackend(doc()),
      container as never,
    )
    expect(container.textContent).toContain('caught: boom')
  })

  it('reset() re-runs children (retry after the cause is fixed)', () => {
    const broken = signal(true)
    let resetFn: (() => void) | undefined
    const container = document.createElement('div')
    render(
      ErrorBoundary({
        fallback: (_err, reset) => {
          resetFn = reset
          return createElement('text', {}, 'fallback')
        },
        children: () => {
          if (broken()) throw new Error('still broken')
          return createElement('text', {}, 'recovered')
        },
      }),
      createDomBackend(doc()),
      container as never,
    )
    expect(container.textContent).toContain('fallback')
    broken.set(false) // fix the cause
    resetFn?.() // retry
    expect(container.textContent).toContain('recovered')
  })

  it('re-runs automatically when a signal read before the throw changes', () => {
    const broken = signal(true)
    const container = document.createElement('div')
    render(
      ErrorBoundary({
        fallback: () => createElement('text', {}, 'fallback'),
        children: () => {
          if (broken()) throw new Error('x') // reads `broken` before throwing → tracked
          return createElement('text', {}, 'live')
        },
      }),
      createDomBackend(doc()),
      container as never,
    )
    expect(container.textContent).toContain('fallback')
    broken.set(false) // the tracked dep changed → the region re-runs on its own
    expect(container.textContent).toContain('live')
  })
})
