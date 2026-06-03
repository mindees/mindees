import {
  createHeadlessBackend,
  createHeadlessRoot,
  type HeadlessNode,
  render,
} from '@mindees/renderer'
import { describe, expect, it, vi } from 'vitest'
import { computeWindow, createList } from './list'
import { Text } from './primitives'

describe('computeWindow', () => {
  it('returns an empty window for an empty list', () => {
    expect(computeWindow(0, 100, 10, 0, 3)).toEqual({ startIndex: 0, endIndex: 0, totalHeight: 0 })
  })

  it('windows the top with overscan + correct total height', () => {
    expect(computeWindow(0, 100, 10, 1000, 0)).toEqual({
      startIndex: 0,
      endIndex: 10,
      totalHeight: 10000,
    })
    expect(computeWindow(0, 100, 10, 1000, 3)).toEqual({
      startIndex: 0,
      endIndex: 13,
      totalHeight: 10000,
    })
  })

  it('windows the middle', () => {
    expect(computeWindow(500, 100, 10, 1000, 0)).toMatchObject({ startIndex: 50, endIndex: 60 })
    expect(computeWindow(500, 100, 10, 1000, 3)).toMatchObject({ startIndex: 47, endIndex: 63 })
  })

  it('clamps scroll beyond the end + clamps indices to itemCount', () => {
    expect(computeWindow(1e9, 100, 10, 1000, 3)).toMatchObject({ startIndex: 987, endIndex: 1000 })
  })

  it('handles a list shorter than the viewport (renders all)', () => {
    expect(computeWindow(0, 100, 10, 5, 3)).toMatchObject({ startIndex: 0, endIndex: 5 })
  })

  it('clamps a negative scroll offset to the top', () => {
    expect(computeWindow(-50, 100, 10, 1000, 0)).toMatchObject({ startIndex: 0, endIndex: 10 })
  })
})

function mount(node: ReturnType<typeof createList>) {
  const backend = createHeadlessBackend()
  const root = createHeadlessRoot()
  const mounted = render(node, backend, root)
  return {
    root,
    mounted,
    html: () => root.children.map((c) => backend.serialize(c)).join(''),
    onScroll: () => findByType(root, 'scrollview')?.props.onScroll as (e: unknown) => void,
  }
}

function findByType(node: HeadlessNode, type: string): HeadlessNode | undefined {
  if (node.type === type) return node
  for (const child of node.children) {
    const found = findByType(child, type)
    if (found) return found
  }
  return undefined
}

function listOf(n: number): number[] {
  return Array.from({ length: n }, (_, i) => i)
}

describe('createList — validation', () => {
  it('rejects a non-positive itemHeight/height', () => {
    const renderItem = () => Text({ children: 'x' })
    expect(() => createList({ items: [], renderItem, itemHeight: 0, height: 100 })).toThrow(
      RangeError,
    )
    expect(() => createList({ items: [], renderItem, itemHeight: 20, height: 0 })).toThrow(
      RangeError,
    )
  })
})

describe('createList — windowing', () => {
  it('renders only the visible window + overscan, not the whole list', () => {
    const calls: number[] = []
    const list = createList({
      items: listOf(1000),
      itemHeight: 20,
      height: 100,
      overscan: 2,
      renderItem: (_item, index) => {
        calls.push(index())
        return Text({ children: `row-${index()}` })
      },
    })
    const { html } = mount(list)
    // viewport 5 rows + 2 overscan → window [0, 7)
    expect(html()).toContain('row-0')
    expect(html()).toContain('row-6')
    expect(html()).not.toContain('row-7')
    expect(calls).toEqual([0, 1, 2, 3, 4, 5, 6])
  })

  it('renders an empty list as just the spacer (no rows)', () => {
    const list = createList({
      items: [],
      itemHeight: 20,
      height: 100,
      renderItem: () => Text({ children: 'row' }),
    })
    expect(mount(list).html()).not.toContain('row')
  })
})

describe('createList — scroll + recycling', () => {
  it('updates the window on scroll and recycles in-window rows (one renderItem per new row)', () => {
    const calls: number[] = []
    const list = createList({
      items: listOf(1000),
      itemHeight: 20,
      height: 100,
      overscan: 2,
      renderItem: (_item, index) => {
        calls.push(index())
        return Text({ children: `row-${index()}` })
      },
    })
    const { root, html } = mount(list)
    const initial = calls.length // 7 (indices 0..6)

    const scrollview = findByType(root, 'scrollview')
    const onScroll = scrollview?.props.onScroll as (e: unknown) => void
    onScroll({ target: { scrollTop: 20 } }) // down exactly one row

    // window [0, 8): only index 7 is newly visible; 0..6 stay mounted (recycled, not re-rendered).
    expect(html()).toContain('row-7')
    expect(calls.length).toBe(initial + 1)
    expect(new Set(calls).size).toBe(calls.length) // no index re-rendered
  })

  it('drops rows that scroll out of view', () => {
    const list = createList({
      items: listOf(1000),
      itemHeight: 20,
      height: 100,
      overscan: 0,
      renderItem: (_item, index) => Text({ children: `row-${index()}` }),
    })
    const { root, html } = mount(list)
    const onScroll = findByType(root, 'scrollview')?.props.onScroll as (e: unknown) => void
    onScroll({ target: { scrollTop: 400 } }) // window ~[20, 25)
    expect(html()).toContain('row-20')
    expect(html()).not.toContain('row-0')
  })

  it('fires onEndReached once when the end comes into view', () => {
    const onEndReached = vi.fn()
    const list = createList({
      items: listOf(8),
      itemHeight: 20,
      height: 100,
      overscan: 0,
      onEndReached,
      renderItem: (_item, index) => Text({ children: () => `row-${index()}` }),
    })
    const { root } = mount(list)
    expect(onEndReached).not.toHaveBeenCalled() // top: window [0,5), end not in view
    const onScroll = findByType(root, 'scrollview')?.props.onScroll as (e: unknown) => void
    onScroll({ target: { scrollTop: 60 } }) // window reaches index 8 (the end)
    onScroll({ target: { scrollTop: 60 } }) // idempotent — must not double-fire
    expect(onEndReached).toHaveBeenCalledTimes(1)
  })

  it('fires onEndReached at mount when the list already fits the viewport', () => {
    const onEndReached = vi.fn()
    const list = createList({
      items: listOf(5),
      itemHeight: 20,
      height: 100,
      overscan: 0,
      onEndReached,
      renderItem: (_item, index) => Text({ children: () => `r${index()}` }),
    })
    mount(list)
    expect(onEndReached).toHaveBeenCalledTimes(1) // window [0,5) reaches the end at mount
  })

  it('recycles across a multi-row window slide when accessors are consumed lazily', () => {
    let invocations = 0
    const list = createList({
      items: listOf(1000),
      itemHeight: 20,
      height: 100,
      overscan: 2,
      // LAZY: index() is read inside the child accessor, not in the renderItem body.
      renderItem: (_item, index) => {
        invocations++
        return Text({ children: () => `row-${index()}` })
      },
    })
    const { html, onScroll } = mount(list)
    const initial = invocations // window [0,7) → 7 slots
    onScroll()({ target: { scrollTop: 200 } }) // window slides to [8,17): slots 0..6 stay active

    expect(html()).toContain('row-16')
    expect(html()).not.toContain('row-0')
    // Only the two newly-activated slots run renderItem; the 7 still-active slots recycle in place.
    expect(invocations - initial).toBe(2)
  })

  it('disposes its windowing reactivity on unmount (no post-dispose side effects)', () => {
    const onEndReached = vi.fn()
    const list = createList({
      items: listOf(8),
      itemHeight: 20,
      height: 100,
      overscan: 0,
      onEndReached,
      renderItem: (_item, index) => Text({ children: () => `row-${index()}` }),
    })
    const { mounted, onScroll } = mount(list)
    const scroll = onScroll()
    expect(onEndReached).not.toHaveBeenCalled()
    mounted.dispose()
    scroll({ target: { scrollTop: 60 } }) // would reach the end — but the effect is disposed
    expect(onEndReached).not.toHaveBeenCalled() // no leaked observer firing after unmount
  })
})
