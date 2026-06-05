import { createElement, keyedRegion, type MindeesNode, onCleanup, signal } from '@mindees/core'
import { describe, expect, it } from 'vitest'
import { createHeadlessBackend, createHeadlessRoot, type HeadlessNode } from './headless'
import { render } from './render'

function mount(node: MindeesNode) {
  const backend = createHeadlessBackend()
  const root = createHeadlessRoot()
  const mounted = render(node, backend, root)
  return {
    root,
    mounted,
    // Row element nodes (skip the trailing empty-text marker).
    rows: () => root.children.filter((c) => c.type !== '#text'),
    html: () => root.children.map((c) => backend.serialize(c)).join(''),
  }
}

interface Row {
  id: number
  name: string
}
const rowsOf = (...rs: Row[]): Row[] => rs

/** A keyed list of `view`s whose text is the row name; counts mapFn calls (creations). */
function listRegion(items: () => readonly Row[], counter?: { calls: number; disposed: number[] }) {
  return keyedRegion<Row>({
    each: items,
    key: (r) => r.id,
    children: (item) => {
      if (counter) counter.calls++
      const id = item().id
      if (counter) onCleanup(() => counter.disposed.push(id))
      return createElement('view', { 'data-id': id }, () => item().name)
    },
  })
}

describe('bindKeyedChild — keyed reconciliation', () => {
  it('mounts the initial list in order', () => {
    const items = signal(rowsOf({ id: 1, name: 'a' }, { id: 2, name: 'b' }, { id: 3, name: 'c' }))
    const { html } = mount(listRegion(() => items()))
    expect(html()).toBe(
      '<view data-id="1">a</view><view data-id="2">b</view><view data-id="3">c</view>',
    )
  })

  it('preserves row identity across a reorder (moves, not rebuilds)', () => {
    const items = signal(rowsOf({ id: 1, name: 'a' }, { id: 2, name: 'b' }, { id: 3, name: 'c' }))
    const counter = { calls: 0, disposed: [] as number[] }
    const { rows } = mount(listRegion(() => items(), counter))
    const before = rows()
    const nodeById = new Map(before.map((n) => [n.props['data-id'], n]))
    expect(counter.calls).toBe(3)

    items.set(rowsOf({ id: 3, name: 'c' }, { id: 1, name: 'a' }, { id: 2, name: 'b' }))
    const after = rows()
    // Same node OBJECTS, just reordered — no creations, no disposals.
    expect(after.map((n) => n.props['data-id'])).toEqual([3, 1, 2])
    expect(after[0]).toBe(nodeById.get(3))
    expect(after[1]).toBe(nodeById.get(1))
    expect(counter.calls).toBe(3) // no new rows created
    expect(counter.disposed).toEqual([]) // none disposed
  })

  it('patches a changed row in place without re-running other rows', () => {
    const items = signal(rowsOf({ id: 1, name: 'a' }, { id: 2, name: 'b' }))
    const counter = { calls: 0, disposed: [] as number[] }
    const { html, rows } = mount(listRegion(() => items(), counter))
    const node1 = rows()[0]
    items.set(rowsOf({ id: 1, name: 'A!' }, { id: 2, name: 'b' })) // same keys, one name changed
    expect(html()).toBe('<view data-id="1">A!</view><view data-id="2">b</view>')
    expect(counter.calls).toBe(2) // reused — no new mapFn calls
    expect(rows()[0]).toBe(node1) // same node patched in place
  })

  it('appends without recreating existing rows', () => {
    const items = signal(rowsOf({ id: 1, name: 'a' }, { id: 2, name: 'b' }))
    const counter = { calls: 0, disposed: [] as number[] }
    const { rows } = mount(listRegion(() => items(), counter))
    const before = rows()
    items.set(rowsOf({ id: 1, name: 'a' }, { id: 2, name: 'b' }, { id: 3, name: 'c' }))
    const after = rows()
    expect(after[0]).toBe(before[0]) // existing identities kept
    expect(after[1]).toBe(before[1])
    expect(counter.calls).toBe(3) // only the new row created
  })

  it('disposes only the removed rows', () => {
    const items = signal(rowsOf({ id: 1, name: 'a' }, { id: 2, name: 'b' }, { id: 3, name: 'c' }))
    const counter = { calls: 0, disposed: [] as number[] }
    const { html } = mount(listRegion(() => items(), counter))
    items.set(rowsOf({ id: 1, name: 'a' }, { id: 3, name: 'c' })) // remove id 2
    expect(html()).toBe('<view data-id="1">a</view><view data-id="3">c</view>')
    expect(counter.disposed).toEqual([2]) // only the removed row's cleanup ran
  })

  it('reverses with identity preserved (no creations/disposals)', () => {
    const items = signal(rowsOf({ id: 1, name: 'a' }, { id: 2, name: 'b' }, { id: 3, name: 'c' }))
    const counter = { calls: 0, disposed: [] as number[] }
    const { rows, html } = mount(listRegion(() => items(), counter))
    const byId = new Map(rows().map((n) => [n.props['data-id'], n]))
    items.set(rowsOf({ id: 3, name: 'c' }, { id: 2, name: 'b' }, { id: 1, name: 'a' }))
    expect(html()).toBe(
      '<view data-id="3">c</view><view data-id="2">b</view><view data-id="1">a</view>',
    )
    expect(rows()[0]).toBe(byId.get(3))
    expect(rows()[2]).toBe(byId.get(1))
    expect(counter.calls).toBe(3)
    expect(counter.disposed).toEqual([])
  })

  it('throws on a duplicate key', () => {
    const items = signal(rowsOf({ id: 1, name: 'a' }, { id: 1, name: 'dup' }))
    expect(() => mount(listRegion(() => items()))).toThrow(/duplicate key/i)
  })

  it('throws on a null/undefined key', () => {
    const region = keyedRegion<Row>({
      each: () => [{ id: 1, name: 'a' }],
      key: () => undefined,
      children: (item) => createElement('view', null, () => item().name),
    })
    expect(() => mount(region)).toThrow(/null or undefined/i)
  })

  it('shows the fallback when empty and removes it on refill (in the slot)', () => {
    const items = signal<Row[]>([])
    const region = keyedRegion<Row>({
      each: () => items(),
      key: (r) => r.id,
      children: (item) => createElement('view', { 'data-id': item().id }, () => item().name),
      fallback: () => createElement('text', null, 'empty'),
    })
    const { html } = mount(region)
    expect(html()).toBe('<text>empty</text>')
    items.set(rowsOf({ id: 1, name: 'a' }))
    expect(html()).toBe('<view data-id="1">a</view>')
    items.set([])
    expect(html()).toBe('<text>empty</text>')
  })

  it('keys by item identity when no key fn is given', () => {
    const a = { id: 1, name: 'a' }
    const b = { id: 2, name: 'b' }
    const items = signal([a, b])
    const region = keyedRegion<Row>({
      each: () => items(),
      children: (item) => createElement('view', { 'data-id': item().id }, () => item().name),
    })
    const { rows } = mount(region)
    const before = rows()
    items.set([b, a]) // same object refs, reordered
    const after = rows()
    expect(after[0]).toBe(before[1]) // identity reused by object identity
    expect(after[1]).toBe(before[0])
  })
})
