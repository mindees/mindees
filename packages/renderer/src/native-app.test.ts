import { createElement as h, signal } from '@mindees/core'
import { describe, expect, it, vi } from 'vitest'
import { createNativeApp } from './native-app'
import type { NativeCommand } from './native-protocol'

/** A tiny counter component: a button whose press increments a reactive label. */
function makeCounter() {
  const count = signal(0)
  const Counter = () =>
    h(
      'view',
      null,
      h('button', { onPress: () => count.set(count() + 1) }, () => `n:${count()}`),
    )
  return { Counter, count }
}

/** Parse every emitted JSON batch into a flat command list. */
function commandsFrom(emitted: string[]): NativeCommand[] {
  return emitted.flatMap((json) => JSON.parse(json) as NativeCommand[])
}

describe('createNativeApp', () => {
  it('start() renders the root and flushes one command batch to emit', () => {
    const { Counter } = makeCounter()
    const emitted: string[] = []
    const app = createNativeApp(h(Counter, null), { emit: (j) => emitted.push(j), expose: false })

    expect(emitted).toHaveLength(0) // nothing until start()
    app.start()
    expect(emitted).toHaveLength(1)

    const cmds = commandsFrom(emitted)
    expect(cmds.some((c) => c.type === 'createNode' && c.tag === 'view')).toBe(true)
    expect(cmds.some((c) => c.type === 'registerEvent' && c.eventName === 'press')).toBe(true)
    // Top-level insert targets the default host root id.
    expect(cmds.some((c) => c.type === 'insertChild' && c.parentId === 'host-root')).toBe(true)
  })

  it('dispatchEvent runs the handler and flushes the resulting update', () => {
    const { Counter } = makeCounter()
    const emitted: string[] = []
    const app = createNativeApp(h(Counter, null), { emit: (j) => emitted.push(j), expose: false })
    app.start()
    const handlerId = commandsFrom(emitted).find(
      (c): c is Extract<NativeCommand, { type: 'registerEvent' }> => c.type === 'registerEvent',
    )?.handlerId
    expect(handlerId).toBeTruthy()

    emitted.length = 0
    const handled = app.dispatchEvent(handlerId as string)
    expect(handled).toBe(true)
    const batch = commandsFrom(emitted)
    expect(batch).toEqual([expect.objectContaining({ type: 'updateText', text: 'n:1' })])
  })

  it('honors a custom rootId', () => {
    const { Counter } = makeCounter()
    const emitted: string[] = []
    const app = createNativeApp(h(Counter, null), {
      rootId: 'my-root',
      emit: (j) => emitted.push(j),
      expose: false,
    })
    app.start()
    expect(
      commandsFrom(emitted).some((c) => c.type === 'insertChild' && c.parentId === 'my-root'),
    ).toBe(true)
  })

  it('exposes the app on a global by default, and not when expose:false', () => {
    const g = globalThis as Record<string, unknown>
    delete g.MindeesApp
    const { Counter } = makeCounter()

    createNativeApp(h(Counter, null), { emit: () => {}, expose: false })
    expect(g.MindeesApp).toBeUndefined()

    const app = createNativeApp(h(Counter, null), { emit: () => {} })
    expect(g.MindeesApp).toBe(app)
    delete g.MindeesApp
  })

  it('defaults emit to globalThis.MindeesHost.emit', () => {
    const g = globalThis as Record<string, unknown>
    const emit = vi.fn()
    g.MindeesHost = { emit }
    const { Counter } = makeCounter()
    const app = createNativeApp(h(Counter, null), { expose: false })
    app.start()
    expect(emit).toHaveBeenCalledTimes(1)
    delete g.MindeesHost
  })
})
