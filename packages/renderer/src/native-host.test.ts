import { createElement as h, signal } from '@mindees/core'
import { describe, expect, it } from 'vitest'
import { createNativeCommandBackend } from './native-command-backend'
import { createReferenceHost, NativeHostError } from './native-host'
import { render } from './render'

/** A backend wired to a fresh reference host that validates every emitted command. */
function wired() {
  const host = createReferenceHost()
  const backend = createNativeCommandBackend({
    rootId: host.rootId,
    onCommand: (c) => host.apply(c),
  })
  return { host, backend }
}

describe('reference host — reconstruct from the command stream', () => {
  it('reconstructs a static tree', () => {
    const { host, backend } = wired()
    render(h('view', null, h('text', null, 'Hello')), backend, backend.root)
    expect(host.serialize()).toBe('<view><text>Hello</text></view>')
    expect(host.liveNodeCount()).toBe(3) // view + <text> element + text node
  })

  it('preserves sibling order', () => {
    const { host, backend } = wired()
    render(h('view', null, 'A', 'B', 'C'), backend, backend.root)
    expect(host.serialize()).toBe('<view>ABC</view>')
  })

  it('applies reactive text updates', () => {
    const { host, backend } = wired()
    const t = signal('x')
    render(
      h('view', null, () => t()),
      backend,
      backend.root,
    )
    expect(host.serialize()).toBe('<view>x</view>')
    t.set('y')
    expect(host.serialize()).toBe('<view>y</view>')
  })

  it('keeps a conditional region in its slot among siblings', () => {
    const { host, backend } = wired()
    const show = signal(false)
    render(
      h('view', null, 'H', () => (show() ? h('b', null, 'X') : null), 'T'),
      backend,
      backend.root,
    )
    expect(host.serialize()).toBe('<view>HT</view>')
    show.set(true)
    expect(host.serialize()).toBe('<view>H<b>X</b>T</view>')
    show.set(false)
    expect(host.serialize()).toBe('<view>HT</view>')
  })

  it('reconstructs props and event wiring', () => {
    const { host, backend } = wired()
    render(h('button', { title: 'Tap', onPress: () => {} }, 'x'), backend, backend.root)
    const button = host.root.children[0]
    expect(button?.tag).toBe('button')
    expect(button?.props.title).toBe('Tap')
    expect(button?.events.get('press')).toBeTruthy() // a handler id was wired
  })

  it('leaves no orphans and frees every node on dispose()', () => {
    const { host, backend } = wired()
    const show = signal(true)
    const m = render(
      h('view', null, () => (show() ? h('b', null, 'X') : null), 'T'),
      backend,
      backend.root,
    )
    expect(host.liveNodeCount()).toBeGreaterThan(0)
    m.dispose()
    expect(host.root.children).toHaveLength(0)
    expect(host.liveNodeCount()).toBe(0) // every created node freed — no leak
  })

  it('accepts a full reactive app + dispose with no contract violation (conformance)', () => {
    // Because the host is strict, piping a real app through it end-to-end proves the
    // backend never emits an invalid or leaking command stream — exactly the class of
    // bug (double-dispose) a lenient host would silently hide.
    const { host, backend } = wired()
    const a = signal(true)
    const n = signal(0)
    const App = () => [
      h('view', { class: () => (a() ? 'on' : 'off') }, () =>
        a() ? h('text', null, () => `n${n()}`) : null,
      ),
      h('tail', null, 'T'),
    ]
    const m = render(App, {}, backend, backend.root)
    expect(() => {
      n.set(1)
      a.set(false)
      a.set(true)
      n.set(2)
      m.dispose()
    }).not.toThrow()
    expect(host.liveNodeCount()).toBe(0)
  })
})

describe('reference host — strict validation (the conformance contract)', () => {
  it('rejects a duplicate node id', () => {
    const host = createReferenceHost()
    host.apply({ type: 'createNode', id: 'a', tag: 'view' })
    expect(() => host.apply({ type: 'createNode', id: 'a', tag: 'view' })).toThrow(NativeHostError)
  })

  it('rejects commands referencing an unknown node', () => {
    const host = createReferenceHost()
    expect(() => host.apply({ type: 'setProp', id: 'ghost', name: 'x', value: 1 })).toThrow(
      NativeHostError,
    )
  })

  it('rejects removeChild of a non-child', () => {
    const host = createReferenceHost()
    host.apply({ type: 'createNode', id: 'p', tag: 'view' })
    host.apply({ type: 'createNode', id: 'c', tag: 'view' })
    host.apply({ type: 'insertChild', parentId: host.rootId, childId: 'p', index: 0 })
    expect(() => host.apply({ type: 'removeChild', parentId: 'p', childId: 'c' })).toThrow(
      NativeHostError,
    )
  })

  it('rejects a double dispose', () => {
    const host = createReferenceHost()
    host.apply({ type: 'createNode', id: 'a', tag: 'view' })
    host.apply({ type: 'disposeNode', id: 'a' })
    expect(() => host.apply({ type: 'disposeNode', id: 'a' })).toThrow(NativeHostError)
  })

  it('rejects an out-of-range insert index', () => {
    const host = createReferenceHost()
    host.apply({ type: 'createNode', id: 'c', tag: 'view' })
    expect(() =>
      host.apply({ type: 'insertChild', parentId: host.rootId, childId: 'c', index: 5 }),
    ).toThrow(NativeHostError)
  })

  it('rejects inserting an already-attached node (a move must detach first)', () => {
    const host = createReferenceHost()
    host.apply({ type: 'createNode', id: 'p1', tag: 'view' })
    host.apply({ type: 'createNode', id: 'p2', tag: 'view' })
    host.apply({ type: 'createNode', id: 'c', tag: 'view' })
    host.apply({ type: 'insertChild', parentId: host.rootId, childId: 'p1', index: 0 })
    host.apply({ type: 'insertChild', parentId: host.rootId, childId: 'p2', index: 1 })
    host.apply({ type: 'insertChild', parentId: 'p1', childId: 'c', index: 0 })
    expect(() =>
      host.apply({ type: 'insertChild', parentId: 'p2', childId: 'c', index: 0 }),
    ).toThrow(NativeHostError)
  })

  it('cannot dispose the root', () => {
    const host = createReferenceHost()
    expect(() => host.apply({ type: 'disposeNode', id: host.rootId })).toThrow(NativeHostError)
  })
})
