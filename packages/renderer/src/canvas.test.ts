import { createElement as h, signal } from '@mindees/core'
import { describe, expect, it } from 'vitest'
import { createCanvas2DBackend, type Scene2DContext } from './canvas'
import { render } from './render'

/** A recording mock 2D context (no real canvas needed). */
function mockCtx() {
  const calls: string[] = []
  const ctx: Scene2DContext = {
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    globalAlpha: 1,
    font: '',
    textBaseline: '',
    save: () => calls.push('save'),
    restore: () => calls.push('restore'),
    clearRect: (...a) => calls.push(`clearRect(${a.join(',')})`),
    fillRect: (...a) => calls.push(`fillRect(${a.join(',')}) fill=${ctx.fillStyle}`),
    strokeRect: (...a) => calls.push(`strokeRect(${a.join(',')}) stroke=${ctx.strokeStyle}`),
    beginPath: () => calls.push('beginPath'),
    moveTo: (...a) => calls.push(`moveTo(${a.join(',')})`),
    lineTo: (...a) => calls.push(`lineTo(${a.join(',')})`),
    arc: (...a) => calls.push(`arc(${a.join(',')})`),
    closePath: () => calls.push('closePath'),
    fill: () => calls.push(`fill(${ctx.fillStyle})`),
    stroke: () => calls.push(`stroke(${ctx.strokeStyle})`),
    fillText: (t, x, y) => calls.push(`fillText(${t},${x},${y}) fill=${ctx.fillStyle}`),
  }
  return { ctx, calls }
}

describe('createCanvas2DBackend', () => {
  it('paints a filled + stroked rect', () => {
    const backend = createCanvas2DBackend()
    render(
      h('canvas-rect', {
        x: 1,
        y: 2,
        width: 10,
        height: 20,
        fill: 'red',
        stroke: 'blue',
        strokeWidth: 3,
      }),
      backend,
      backend.root,
    )
    const { ctx, calls } = mockCtx()
    backend.paint(ctx, 100, 100)
    expect(calls[0]).toBe('clearRect(0,0,100,100)')
    expect(calls.some((c) => c === 'fillRect(1,2,10,20) fill=red')).toBe(true)
    expect(calls.some((c) => c === 'strokeRect(1,2,10,20) stroke=blue')).toBe(true)
  })

  it('paints text content from a child text node', () => {
    const backend = createCanvas2DBackend()
    render(h('canvas-text', { x: 5, y: 6, fill: 'black' }, 'Hello'), backend, backend.root)
    const { ctx, calls } = mockCtx()
    backend.paint(ctx, 50, 50)
    expect(calls.some((c) => c === 'fillText(Hello,5,6) fill=black')).toBe(true)
  })

  it('paints a circle (arc + fill)', () => {
    const backend = createCanvas2DBackend()
    render(h('canvas-circle', { x: 10, y: 10, radius: 4, fill: 'green' }), backend, backend.root)
    const { ctx, calls } = mockCtx()
    backend.paint(ctx, 50, 50)
    expect(calls.some((c) => c.startsWith('arc(10,10,4,'))).toBe(true)
    expect(calls.some((c) => c === 'fill(green)')).toBe(true)
  })

  it('repaints reactively: a signal-driven prop updates the next paint + marks dirty', () => {
    const color = signal('red')
    let dirty = 0
    const backend = createCanvas2DBackend({ onDirty: () => dirty++ })
    render(
      h('canvas-rect', { x: 0, y: 0, width: 10, height: 10, fill: () => color() }),
      backend,
      backend.root,
    )
    const first = mockCtx()
    backend.paint(first.ctx, 100, 100)
    expect(first.calls.some((c) => c.includes('fillRect') && c.includes('red'))).toBe(true)

    const before = dirty
    color.set('blue') // reactive setProp → onDirty
    expect(dirty).toBeGreaterThan(before)

    const second = mockCtx()
    backend.paint(second.ctx, 100, 100)
    expect(second.calls.some((c) => c.includes('fillRect') && c.includes('blue'))).toBe(true)
    expect(second.calls.some((c) => c.includes('red'))).toBe(false)
  })

  it('composites group children and applies node opacity', () => {
    const backend = createCanvas2DBackend()
    render(
      h(
        'canvas-group',
        {},
        h('canvas-rect', { x: 0, y: 0, width: 5, height: 5, fill: 'a', opacity: 0.5 }),
        h('canvas-rect', { x: 5, y: 5, width: 5, height: 5, fill: 'b' }),
      ),
      backend,
      backend.root,
    )
    const { ctx, calls } = mockCtx()
    backend.paint(ctx, 50, 50)
    expect(calls.some((c) => c.includes('fill=a'))).toBe(true)
    expect(calls.some((c) => c.includes('fill=b'))).toBe(true)
    expect(calls).toContain('save') // opacity wrapped in save/restore
    expect(calls).toContain('restore')
  })
})
