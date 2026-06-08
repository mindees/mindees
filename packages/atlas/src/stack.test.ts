import { createElement, manualFrameSource, setFrameSource } from '@mindees/core'
import { _resetAnimation } from '@mindees/core/testing'
import {
  createHeadlessBackend,
  createHeadlessRoot,
  type HeadlessNode,
  render,
} from '@mindees/renderer'
import { createMemoryHistory, createRouter } from '@mindees/router'
import { afterEach, describe, expect, it } from 'vitest'
import { Text } from './primitives'
import { createStackNavigator } from './stack'

afterEach(() => _resetAnimation())

const ScreenA = () => createElement(Text, {}, 'screen-A')
const ScreenB = () => createElement(Text, {}, 'screen-B')

const allText = (node: HeadlessNode): string => {
  let s = node.type === '#text' ? node.text : ''
  for (const c of node.children) s += allText(c)
  return s
}

const makeRouter = () =>
  createRouter({
    routes: [
      { path: '/a', component: ScreenA },
      { path: '/b', component: ScreenB },
    ],
    history: createMemoryHistory({ initialEntries: ['/a'] }),
  })

const mountStack = (router: ReturnType<typeof makeRouter>, props = {}) => {
  const backend = createHeadlessBackend()
  const root = createHeadlessRoot()
  const Stack = createStackNavigator(router)
  render(createElement(Stack, props), backend, root)
  return root
}

describe('createStackNavigator', () => {
  it('shows the destination instantly with no frame source (SSR/headless)', () => {
    const router = makeRouter()
    const root = mountStack(router)
    expect(allText(root)).toContain('screen-A')
    router.navigate('/b') // no frame source → jump-to-final → instant
    const t = allText(root)
    expect(t).toContain('screen-B')
    expect(t).not.toContain('screen-A')
  })

  it('PUSH mounts both screens during the transition, then only the destination', () => {
    const m = manualFrameSource()
    setFrameSource(m.source)
    const router = makeRouter()
    const root = mountStack(router)
    router.navigate('/b')
    // mid-transition: both cards mounted
    m.tick(0)
    m.tick(50)
    const mid = allText(root)
    expect(mid).toContain('screen-A')
    expect(mid).toContain('screen-B')
    // run to completion
    for (let t = 0; t <= 2000; t += 16) m.tick(t)
    const end = allText(root)
    expect(end).toContain('screen-B')
    expect(end).not.toContain('screen-A')
  })

  it('POP animates back and ends on the lower screen', () => {
    const m = manualFrameSource()
    setFrameSource(m.source)
    const router = makeRouter()
    const root = mountStack(router)
    router.navigate('/b')
    for (let t = 0; t <= 2000; t += 16) m.tick(t) // settle on B (stack = [A, B])
    expect(allText(root)).toContain('screen-B')
    router.navigate('/a') // /a is below → POP
    const mid = allText(root)
    expect(mid).toContain('screen-A')
    expect(mid).toContain('screen-B') // both during the pop
    for (let t = 2000; t <= 4000; t += 16) m.tick(t)
    const end = allText(root)
    expect(end).toContain('screen-A')
    expect(end).not.toContain('screen-B')
  })

  it("transition 'none' swaps instantly even with a frame source", () => {
    const m = manualFrameSource()
    setFrameSource(m.source)
    const router = makeRouter()
    const root = mountStack(router, { transition: 'none' })
    router.navigate('/b')
    m.tick(0)
    // 'none' has no movement; one tick settles it to the destination
    for (let t = 0; t <= 600; t += 16) m.tick(t)
    expect(allText(root)).toContain('screen-B')
  })
})

describe('createStackNavigator — interrupt safety (adversarial fixes)', () => {
  it('navigating back to the origin mid-push ends on the origin (no url/screen desync)', () => {
    const m = manualFrameSource()
    setFrameSource(m.source)
    const router = makeRouter()
    const root = mountStack(router)
    router.navigate('/b') // PUSH starts
    m.tick(0)
    m.tick(30) // mid-transition, not settled
    router.navigate('/a') // back to origin mid-push → must reconcile to A, not finish on B
    for (let t = 30; t <= 2000; t += 16) m.tick(t)
    const end = allText(root)
    expect(end).toContain('screen-A')
    expect(end).not.toContain('screen-B')
  })
})
