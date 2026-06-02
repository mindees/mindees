import { computed, createElement as h, signal } from '@mindees/core'
import { describe, expect, it, vi } from 'vitest'
import { createHeadlessBackend, createHeadlessRoot, type HeadlessNode } from './headless'
import { render } from './render'

function setup() {
  const backend = createHeadlessBackend()
  const root = createHeadlessRoot()
  return { backend, root, html: () => root.children.map((c) => backend.serialize(c)).join('') }
}

describe('render — static trees', () => {
  it('mounts an element with text', () => {
    const { backend, root, html } = setup()
    render(h('view', null, 'hello'), backend, root)
    expect(html()).toBe('<view>hello</view>')
  })

  it('mounts nested elements and static props', () => {
    const { backend, root, html } = setup()
    render(h('view', { id: 'root' }, h('text', { role: 'heading' }, 'Hi')), backend, root)
    expect(html()).toBe('<view id="root"><text role="heading">Hi</text></view>')
  })

  it('mounts arrays / fragments', () => {
    const { backend, root, html } = setup()
    render(h('list', null, h('item', null, 'a'), h('item', null, 'b')), backend, root)
    expect(html()).toBe('<list><item>a</item><item>b</item></list>')
  })

  it('skips null/boolean children', () => {
    const { backend, root, html } = setup()
    render(h('view', null, null, false, 'x', true), backend, root)
    expect(html()).toBe('<view>x</view>')
  })
})

describe('render — components', () => {
  it('renders a function component with props', () => {
    const { backend, root, html } = setup()
    const Greeting = (p: { name: string }) => h('text', null, `hi ${p.name}`)
    render(Greeting, { name: 'mindees' }, backend, root)
    expect(html()).toBe('<text>hi mindees</text>')
  })

  it('passes children through to components', () => {
    const { backend, root, html } = setup()
    const Box = (p: { children?: unknown }) => h('box', null, p.children as never)
    render(h(Box as never, null, 'inner'), backend, root)
    expect(html()).toBe('<box>inner</box>')
  })
})

describe('render — fine-grained reactivity', () => {
  it('patches a reactive text child in place (no element re-create)', () => {
    const { backend, root, html } = setup()
    const count = signal(0)
    render(
      h('view', null, () => count()),
      backend,
      root,
    )
    expect(html()).toBe('<view>0</view>')

    // Capture the text node identity to prove it is patched, not replaced.
    const viewNode = root.children[0] as HeadlessNode
    const textNodeBefore = viewNode.children[0]
    count.set(5)
    expect(html()).toBe('<view>5</view>')
    expect(viewNode.children[0]).toBe(textNodeBefore) // same node, patched
  })

  it('updates a reactive prop without touching siblings', () => {
    const { backend, root } = setup()
    const cls = signal('a')
    render(h('view', { class: () => cls() }, 'x'), backend, root)
    const view = root.children[0] as HeadlessNode
    expect(view.props.class).toBe('a')
    cls.set('b')
    expect(view.props.class).toBe('b')
  })

  it('only re-runs the binding whose signal changed', () => {
    const { backend, root } = setup()
    const a = signal('a')
    const b = signal('b')
    const aCompute = vi.fn(() => a())
    const bCompute = vi.fn(() => b())
    render(h('view', { 'data-a': aCompute, 'data-b': bCompute }), backend, root)
    expect(aCompute).toHaveBeenCalledTimes(1)
    expect(bCompute).toHaveBeenCalledTimes(1)

    a.set('a2')
    expect(aCompute).toHaveBeenCalledTimes(2)
    expect(bCompute).toHaveBeenCalledTimes(1) // untouched
  })

  it('swaps a reactive child region when the shape changes', () => {
    const { backend, root, html } = setup()
    const show = signal(true)
    render(
      h('view', null, () => (show() ? h('a', null, '1') : h('b', null, '2'))),
      backend,
      root,
    )
    expect(html()).toBe('<view><a>1</a></view>')
    show.set(false)
    expect(html()).toBe('<view><b>2</b></view>')
  })

  it('reacts to a computed child', () => {
    const { backend, root, html } = setup()
    const n = signal(2)
    const label = computed(() => (n() % 2 === 0 ? 'even' : 'odd'))
    render(
      h('view', null, () => label()),
      backend,
      root,
    )
    expect(html()).toBe('<view>even</view>')
    n.set(3)
    expect(html()).toBe('<view>odd</view>')
  })

  it('keeps a conditional region in its slot among siblings (empty↔content)', () => {
    const { backend, root, html } = setup()
    const show = signal(false)
    render(
      h(
        'view',
        null,
        h('head', null, 'H'),
        () => (show() ? h('x', null, 'X') : null),
        h('tail', null, 'T'),
      ),
      backend,
      root,
    )
    // Empty region must not collapse to the parent's end.
    expect(html()).toBe('<view><head>H</head><tail>T</tail></view>')
    show.set(true)
    expect(html()).toBe('<view><head>H</head><x>X</x><tail>T</tail></view>')
    show.set(false) // content→empty keeps the slot
    expect(html()).toBe('<view><head>H</head><tail>T</tail></view>')
    show.set(true) // empty→content re-expands in the SAME slot
    expect(html()).toBe('<view><head>H</head><x>X</x><tail>T</tail></view>')
  })

  it('keeps two adjacent regions in order even when filled out of order', () => {
    const { backend, root, html } = setup()
    const a = signal(false)
    const b = signal(false)
    render(
      h(
        'view',
        null,
        () => (a() ? h('a', null, 'A') : null),
        () => (b() ? h('b', null, 'B') : null),
        h('tail', null, 'T'),
      ),
      backend,
      root,
    )
    expect(html()).toBe('<view><tail>T</tail></view>')
    b.set(true) // fill the SECOND region first
    expect(html()).toBe('<view><b>B</b><tail>T</tail></view>')
    a.set(true) // first region fills into its own (earlier) slot
    expect(html()).toBe('<view><a>A</a><b>B</b><tail>T</tail></view>')
  })
})

describe('render — disposal', () => {
  it('removes nodes and disposes bindings on dispose()', () => {
    const { backend, root, html } = setup()
    const count = signal(0)
    const m = render(
      h('view', null, () => count()),
      backend,
      root,
    )
    expect(html()).toBe('<view>0</view>')
    m.dispose()
    expect(html()).toBe('') // removed from the tree
    // Binding is disposed: further writes must not throw or resurrect anything.
    expect(() => count.set(9)).not.toThrow()
    expect(html()).toBe('')
  })

  it('disposes the CURRENT content of a reactive root (not a stale first-run snapshot)', () => {
    const { backend, root, html } = setup()
    const show = signal(true)
    // A reactive ROOT: render()'s disposer captures the region's node list once.
    const m = render(() => (show() ? h('a', null, '1') : h('b', null, '2')), backend, root)
    expect(html()).toBe('<a>1</a>')
    show.set(false) // content swapped after the initial mount
    expect(html()).toBe('<b>2</b>')
    m.dispose()
    expect(html()).toBe('') // the CURRENT content (and marker) are removed — no leak
    expect(root.children.length).toBe(0)
  })

  it('disposes bindings created inside a component (they stop re-running)', () => {
    const { backend, root } = setup()
    const s = signal(0)
    const read = vi.fn(() => s())
    const Comp = () => h('view', { 'data-v': () => read() }, '')

    const m = render(Comp, {}, backend, root)
    expect(read).toHaveBeenCalledTimes(1) // initial binding run
    s.set(1)
    expect(read).toHaveBeenCalledTimes(2) // reactive while mounted

    m.dispose()
    s.set(2)
    expect(read).toHaveBeenCalledTimes(2) // binding disposed → no further runs (no leak)
  })
})
