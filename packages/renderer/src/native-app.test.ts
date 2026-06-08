import {
  animate,
  deferred,
  createElement as h,
  linear,
  setReactiveScheduler,
  signal,
  timing,
} from '@mindees/core'
import { _resetAnimation } from '@mindees/core/testing'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { _resetNativeAppEngines, createNativeApp } from './native-app'
import type { NativeCommand } from './native-protocol'

/** A spy `MindeesHostFrame` so the frame source installs + we can assert the battery signal. */
function installFrameSpy(): { setFrameLoopActive: ReturnType<typeof vi.fn> } {
  const spy = { setFrameLoopActive: vi.fn() }
  ;(globalThis as Record<string, unknown>).MindeesHostFrame = spy
  return spy
}

afterEach(() => {
  // The reactive scheduler + animation frame source are process singletons; reset between tests that
  // wire the engines so they don't leak across cases.
  _resetAnimation()
  setReactiveScheduler(null)
  _resetNativeAppEngines()
  const g = globalThis as Record<string, unknown>
  delete g.MindeesApp
  delete g.MindeesHost
  delete g.MindeesHostFrame
})

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

describe('createNativeApp — on-device engines (P2: smooth by default)', () => {
  /** A view whose `data-x` prop tracks an animated value (so each frame emits a setProp). */
  function makeAnimatedApp() {
    const App = () => {
      const x = animate(0)
      timing(x, { to: 100, duration: 100, easing: linear })
      return h('view', { 'data-x': () => Math.round(x()) })
    }
    return App
  }
  const dataX = (cmds: NativeCommand[]): number[] =>
    cmds
      .filter(
        (c): c is Extract<NativeCommand, { type: 'setProp' }> =>
          c.type === 'setProp' && c.name === 'data-x',
      )
      .map((c) => c.value as number)

  it('frameTick advances an animation frame-by-frame and flushes each frame', () => {
    installFrameSpy() // a driver must be present for the frame source to arm
    const emitted: string[] = []
    const app = createNativeApp(h(makeAnimatedApp(), null), {
      emit: (j) => emitted.push(j),
      expose: false,
      wireEngines: true,
    })
    app.start()
    emitted.length = 0
    app.frameTick(0) // baseline frame (dt=0, no movement)
    app.frameTick(50) // halfway
    const mid = dataX(commandsFrom(emitted))
    app.frameTick(100) // settle
    const all = dataX(commandsFrom(emitted))
    expect(mid.some((v) => v > 0 && v < 100)).toBe(true) // a real intermediate (not a jump)
    expect(all.some((v) => v === 100)).toBe(true) // reached the target
  })

  it('arms the frame loop only while animating (battery): setFrameLoopActive true on start, false on settle', () => {
    const spy = installFrameSpy()
    const app = createNativeApp(h(makeAnimatedApp(), null), {
      emit: () => {},
      expose: false,
      wireEngines: true,
    })
    app.start() // mounts → timing() arms the loop
    expect(spy.setFrameLoopActive).toHaveBeenCalledWith(true)
    expect(spy.setFrameLoopActive).toHaveBeenCalledTimes(1)
    for (let t = 0; t <= 200; t += 16) app.frameTick(t) // run to settle
    expect(spy.setFrameLoopActive).toHaveBeenLastCalledWith(false)
    expect(spy.setFrameLoopActive).toHaveBeenCalledTimes(2) // exactly one START + one STOP
  })

  it('does NOT arm a frame loop when no driver (MindeesHostFrame) is present — jumps to final instead of freezing', () => {
    // wireEngines forced true, but no MindeesHostFrame → no frame source → jump-to-final (safe).
    const emitted: string[] = []
    const app = createNativeApp(h(makeAnimatedApp(), null), {
      emit: (j) => emitted.push(j),
      expose: false,
      wireEngines: true,
    })
    app.start()
    expect(dataX(commandsFrom(emitted)).some((v) => v === 100)).toBe(true) // final, not frozen at 0
    app.frameTick(16) // no-op
  })

  it('a late frameTick after the loop stops is a harmless no-op', () => {
    installFrameSpy()
    const emitted: string[] = []
    const app = createNativeApp(h(makeAnimatedApp(), null), {
      emit: (j) => emitted.push(j),
      expose: false,
      wireEngines: true,
    })
    app.start()
    for (let t = 0; t <= 200; t += 16) app.frameTick(t) // settle (loop stops)
    emitted.length = 0
    expect(() => app.frameTick(9_999)).not.toThrow()
    expect(emitted).toHaveLength(0)
  })

  it('throws loudly if a second app tries to re-wire the process-global engines', () => {
    installFrameSpy()
    createNativeApp(h(makeAnimatedApp(), null), {
      emit: () => {},
      expose: false,
      wireEngines: true,
    })
    expect(() =>
      createNativeApp(h(makeAnimatedApp(), null), {
        emit: () => {},
        expose: false,
        wireEngines: true,
      }),
    ).toThrow(/already wired/)
  })

  it('with no host installs no frame source — the animation jumps to its final value', () => {
    const emitted: string[] = []
    // expose:false + no MindeesHost → wireEngines defaults false → no frame source.
    const app = createNativeApp(h(makeAnimatedApp(), null), {
      emit: (j) => emitted.push(j),
      expose: false,
    })
    app.start()
    expect(dataX(commandsFrom(emitted)).some((v) => v === 100)).toBe(true) // final, synchronously
    emitted.length = 0
    app.frameTick(16) // no frame source → no-op
    expect(emitted).toHaveLength(0)
  })

  it('emits a deferred/normal-lane update via the coalesced trailing flush', async () => {
    const emitted: string[] = []
    let bump!: (n: number) => void
    const App = () => {
      const src = signal(0)
      bump = (n) => src.set(n)
      const d = deferred(() => src())
      return h('view', { 'data-d': () => d() })
    }
    const app = createNativeApp(h(App, null), {
      emit: (j) => emitted.push(j),
      expose: false,
      wireEngines: true,
    })
    app.start()
    emitted.length = 0
    bump(7) // schedules the deferred (normal-lane) effect on a microtask — not emitted synchronously
    expect(emitted).toHaveLength(0)
    for (let i = 0; i < 6; i++) await Promise.resolve() // drain microtasks
    const cmds = commandsFrom(emitted)
    expect(cmds.some((c) => c.type === 'setProp' && c.name === 'data-d' && c.value === 7)).toBe(
      true,
    ) // reached the host, one tick late (not dropped)
  })
})

describe('dispatchEvent value delivery', () => {
  function makeInput() {
    const seen: Array<string | undefined> = []
    let calls = 0
    const App = () =>
      h('textinput', {
        onInput: (e: unknown) => {
          calls += 1
          seen.push((e as { target?: { value?: string } } | undefined)?.target?.value)
        },
      })
    return { App, seen, getCalls: () => calls }
  }
  const handlerIdOf = (emitted: string[]): string =>
    commandsFrom(emitted).find(
      (c): c is Extract<NativeCommand, { type: 'registerEvent' }> => c.type === 'registerEvent',
    )?.handlerId as string

  it('delivers a text value as { target: { value } }', () => {
    const { App, seen } = makeInput()
    const emitted: string[] = []
    const app = createNativeApp(h(App, null), { emit: (j) => emitted.push(j), expose: false })
    app.start()
    expect(app.dispatchEvent(handlerIdOf(emitted), 'hello')).toBe(true)
    expect(seen).toEqual(['hello'])
  })

  it('delivers an empty string (a cleared field), not swallowed', () => {
    const { App, seen, getCalls } = makeInput()
    const emitted: string[] = []
    const app = createNativeApp(h(App, null), { emit: (j) => emitted.push(j), expose: false })
    app.start()
    app.dispatchEvent(handlerIdOf(emitted), '')
    expect(getCalls()).toBe(1)
    expect(seen).toEqual([''])
  })

  it('a no-value (or null) dispatch yields an undefined event — notify-only behavior', () => {
    const { App, seen } = makeInput()
    const emitted: string[] = []
    const app = createNativeApp(h(App, null), { emit: (j) => emitted.push(j), expose: false })
    app.start()
    const id = handlerIdOf(emitted)
    app.dispatchEvent(id) // press-style: no value
    app.dispatchEvent(id, null) // host may pass null for notify-only
    expect(seen).toEqual([undefined, undefined])
  })

  it('returns false for an unknown handler id', () => {
    const { App } = makeInput()
    const emitted: string[] = []
    const app = createNativeApp(h(App, null), { emit: (j) => emitted.push(j), expose: false })
    app.start()
    expect(app.dispatchEvent('nope', 'x')).toBe(false)
  })
})
