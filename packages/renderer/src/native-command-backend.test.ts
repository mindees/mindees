import { createElement as h, signal } from '@mindees/core'
import { describe, expect, it, vi } from 'vitest'
import { createNativeCommandBackend } from './native-command-backend'
import type { NativeCommand, NativeNodeId } from './native-protocol'
import { render } from './render'

/** Narrow a command list to a single command type. */
function commandsOfType<T extends NativeCommand['type']>(
  commands: readonly NativeCommand[],
  type: T,
): Extract<NativeCommand, { type: T }>[] {
  return commands.filter((c): c is Extract<NativeCommand, { type: T }> => c.type === type)
}

/** Collect every node id referenced by a command. */
function collectIds(command: NativeCommand, into: Set<NativeNodeId>): void {
  if ('id' in command) into.add(command.id)
  if ('parentId' in command) into.add(command.parentId)
  if ('childId' in command) into.add(command.childId)
}

describe('native command backend', () => {
  it('1. emits create + insert commands for a static tree', () => {
    const backend = createNativeCommandBackend()
    // <text> is an element node wrapping a text node, so the tree is
    // root > view > text(element) > "Hello"(text).
    render(h('view', null, h('text', null, 'Hello')), backend, backend.root)
    const cmds = backend.flushCommands()

    const view = commandsOfType(cmds, 'createNode').find((c) => c.tag === 'view')
    const textEl = commandsOfType(cmds, 'createNode').find((c) => c.tag === 'text')
    const textNode = commandsOfType(cmds, 'createText').find((c) => c.text === 'Hello')
    expect(view).toBeTruthy()
    expect(textEl).toBeTruthy()
    expect(textNode).toBeTruthy()

    expect(
      cmds.some(
        (c) => c.type === 'insertChild' && c.parentId === textEl?.id && c.childId === textNode?.id,
      ),
    ).toBe(true)
    expect(
      cmds.some(
        (c) => c.type === 'insertChild' && c.parentId === view?.id && c.childId === textEl?.id,
      ),
    ).toBe(true)
    expect(
      cmds.some(
        (c) =>
          c.type === 'insertChild' &&
          c.parentId === backend.rootId &&
          c.childId === view?.id &&
          c.index === 0,
      ),
    ).toBe(true)
  })

  it('2. preserves child insertion order with ascending indices', () => {
    const backend = createNativeCommandBackend()
    // Raw string children mount directly as text nodes under the view.
    render(h('view', null, 'A', 'B', 'C'), backend, backend.root)
    const cmds = backend.flushCommands()
    const view = commandsOfType(cmds, 'createNode').find((c) => c.tag === 'view')
    const ids = new Map(commandsOfType(cmds, 'createText').map((c) => [c.text, c.id]))

    const inserts = commandsOfType(cmds, 'insertChild').filter((c) => c.parentId === view?.id)
    expect(inserts.map((c) => c.childId)).toEqual([ids.get('A'), ids.get('B'), ids.get('C')])
    expect(inserts.map((c) => c.index)).toEqual([0, 1, 2])
  })

  it('3. emits only an updateText command when reactive text changes', () => {
    const backend = createNativeCommandBackend()
    const text = signal('x')
    render(
      h('view', null, () => text()),
      backend,
      backend.root,
    )
    backend.flushCommands() // drain the initial mount
    text.set('y')
    const batch = backend.flushCommands()
    expect(batch).toHaveLength(1)
    expect(batch[0]).toMatchObject({ type: 'updateText', text: 'y' })
  })

  it('4. emits setProp for new and changed props', () => {
    const backend = createNativeCommandBackend()
    const cls = signal('a')
    render(h('view', { class: () => cls() }), backend, backend.root)
    const init = backend.flushCommands()
    expect(init.some((c) => c.type === 'setProp' && c.name === 'class' && c.value === 'a')).toBe(
      true,
    )

    cls.set('b')
    const batch = backend.flushCommands()
    expect(batch).toEqual([expect.objectContaining({ type: 'setProp', name: 'class', value: 'b' })])
  })

  it('5. emits removeProp when a prop disappears', () => {
    const backend = createNativeCommandBackend()
    const title = signal<string | undefined>('a')
    render(h('view', { title: () => title() }), backend, backend.root)
    backend.flushCommands()

    title.set(undefined)
    const batch = backend.flushCommands()
    expect(batch).toEqual([expect.objectContaining({ type: 'removeProp', name: 'title' })])
  })

  it('6. never serializes an event function into the command stream', () => {
    const backend = createNativeCommandBackend()
    render(h('button', { onPress: () => {} }, 'Tap'), backend, backend.root)
    const cmds = backend.flushCommands()

    const carriesFunction = cmds.some((c) => Object.values(c).some((v) => typeof v === 'function'))
    expect(carriesFunction).toBe(false)
    expect(cmds.some((c) => c.type === 'setProp' && c.name === 'onPress')).toBe(false)

    const registrations = commandsOfType(cmds, 'registerEvent')
    expect(registrations).toHaveLength(1)
    expect(registrations[0]).toMatchObject({ eventName: 'press' })
    expect(typeof registrations[0]?.handlerId).toBe('string')
  })

  it('7. registers handlers under stable ids and dispatches by id', () => {
    const backend = createNativeCommandBackend()
    const onPress = vi.fn()
    render(h('button', { onPress }, 'x'), backend, backend.root)
    const registration = commandsOfType(backend.flushCommands(), 'registerEvent')[0]
    expect(registration).toBeTruthy()

    const dispatched = backend.dispatchEvent(registration?.handlerId ?? '', { kind: 'tap' })
    expect(dispatched).toBe(true)
    expect(onPress).toHaveBeenCalledTimes(1)
    expect(onPress).toHaveBeenCalledWith({ kind: 'tap' })
    expect(backend.dispatchEvent('does-not-exist')).toBe(false)
  })

  it('8. removes and disposes nodes when a reactive branch disappears', () => {
    const backend = createNativeCommandBackend()
    const show = signal(true)
    // A raw-string region: the content is the text node itself, so removeChild
    // and disposeNode both reference its id.
    render(
      h('view', null, () => (show() ? 'A' : null)),
      backend,
      backend.root,
    )
    const textId = commandsOfType(backend.flushCommands(), 'createText').find(
      (c) => c.text === 'A',
    )?.id
    expect(textId).toBeTruthy()

    show.set(false)
    const batch = backend.flushCommands()
    expect(batch.some((c) => c.type === 'removeChild' && c.childId === textId)).toBe(true)
    expect(batch.some((c) => c.type === 'disposeNode' && c.id === textId)).toBe(true)
  })

  it('9. flush returns the batch, clears the buffer, and fires onBatch', () => {
    const batches: NativeCommand[][] = []
    const backend = createNativeCommandBackend({ onBatch: (b) => batches.push([...b]) })
    render(h('view', null, 'hi'), backend, backend.root)

    expect(backend.getCommands().length).toBeGreaterThan(0)
    const first = backend.flushCommands()
    expect(first.length).toBeGreaterThan(0)
    expect(backend.getCommands()).toEqual([])
    expect(backend.flushCommands()).toEqual([])
    expect(batches[0]).toEqual([...first])
  })

  it('10. works with no DOM / browser globals', () => {
    expect(typeof (globalThis as { document?: unknown }).document).toBe('undefined')
    const backend = createNativeCommandBackend()
    render(h('view', null, h('text', null, 'x')), backend, backend.root)
    expect(backend.flushCommands().length).toBeGreaterThan(0)
  })

  it('11. does not collide ids across backend instances', () => {
    const a = createNativeCommandBackend()
    const b = createNativeCommandBackend()
    render(h('view', null, h('text', null, 'A')), a, a.root)
    render(h('view', null, h('text', null, 'B')), b, b.root)

    const idsA = new Set<NativeNodeId>()
    for (const c of a.flushCommands()) collectIds(c, idsA)
    const idsB = new Set<NativeNodeId>()
    for (const c of b.flushCommands()) collectIds(c, idsB)

    expect(idsA.size).toBeGreaterThan(0)
    for (const id of idsA) expect(idsB.has(id)).toBe(false)
    expect(a.rootId).not.toBe(b.rootId)
  })

  it('12. unregisters handlers on disposal (no handler leak)', () => {
    const backend = createNativeCommandBackend()
    const show = signal(true)
    const onPress = vi.fn()
    render(
      h('view', null, () => (show() ? h('button', { onPress }, 'x') : null)),
      backend,
      backend.root,
    )
    const handlerId = commandsOfType(backend.flushCommands(), 'registerEvent')[0]?.handlerId ?? ''
    expect(backend.dispatchEvent(handlerId)).toBe(true)

    show.set(false)
    const batch = backend.flushCommands()
    expect(batch.some((c) => c.type === 'unregisterEvent' && c.handlerId === handlerId)).toBe(true)
    expect(batch.some((c) => c.type === 'disposeNode')).toBe(true)
    expect(backend.dispatchEvent(handlerId)).toBe(false) // handler freed — no leak
  })

  it('13. disposes the entire tree on mount.dispose() with no orphans', () => {
    const backend = createNativeCommandBackend()
    const mounted = render(h('view', null, h('text', null, 'x')), backend, backend.root)
    backend.flushCommands()

    mounted.dispose()
    const batch = backend.flushCommands()
    expect(batch.some((c) => c.type === 'removeChild' && c.parentId === backend.rootId)).toBe(true)
    // both the view and its text child are disposed.
    expect(commandsOfType(batch, 'disposeNode').length).toBeGreaterThanOrEqual(2)
  })
})
