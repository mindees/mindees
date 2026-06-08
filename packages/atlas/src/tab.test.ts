// @vitest-environment happy-dom
/// <reference lib="dom" />
import { createElement } from '@mindees/core'
import { createDomBackend, render } from '@mindees/renderer'
import { createMemoryHistory, createRouter } from '@mindees/router'
import { describe, expect, it } from 'vitest'
import { Text } from './primitives'
import { createTabNavigator } from './tab'

const Home = () => createElement(Text, {}, 'Home Screen')
const Settings = () => createElement(Text, {}, 'Settings Screen')

const setup = (initial = '/home') => {
  const router = createRouter({
    routes: [
      { path: '/home', component: Home },
      { path: '/settings', component: Settings },
    ],
    history: createMemoryHistory({ initialEntries: [initial] }),
  })
  const Tabs = createTabNavigator(router, {
    tabs: [
      { path: '/home', label: 'Home', component: Home },
      { path: '/settings', label: 'Settings', component: Settings },
    ],
  })
  const root = document.createElement('div')
  document.body.appendChild(root)
  render(createElement(Tabs, {}), createDomBackend(doc()), root as never)
  return { router, root }
}
const doc = () => document as never

describe('createTabNavigator', () => {
  it('derives the active tab from the URL and lazily mounts only the active screen', () => {
    const { root } = setup('/home')
    const tabs = root.querySelectorAll('[role="tab"]')
    expect(tabs.length).toBe(2)
    expect(tabs[0]?.getAttribute('aria-selected')).toBe('true') // Home active (deep-linked)
    expect(tabs[1]?.getAttribute('aria-selected')).toBe('false')
    // Lazy: only the active tab's screen is mounted; an unvisited tab's screen is NOT.
    expect(root.textContent).toContain('Home Screen')
    expect(root.textContent).not.toContain('Settings Screen')
    const panels = root.querySelectorAll('[role="tabpanel"]') as unknown as HTMLElement[]
    expect(panels[0]?.style.display).toBe('flex') // active shown
    expect(panels[1]?.style.display).toBe('none') // inactive hidden (also out of the a11y tree + tab order)
  })

  it('navigates, mounts the visited screen, and keeps prior screens alive', () => {
    const { router, root } = setup('/home')
    const tabs = root.querySelectorAll('[role="tab"]') as unknown as HTMLElement[]
    tabs[1]?.dispatchEvent(new Event('click', { bubbles: true })) // tap "Settings"
    expect(router.location().pathname).toBe('/settings')
    const after = root.querySelectorAll('[role="tab"]')
    expect(after[1]?.getAttribute('aria-selected')).toBe('true')
    expect(after[0]?.getAttribute('aria-selected')).toBe('false')
    // Settings now mounted; Home stays mounted (keep-alive → state preserved).
    expect(root.textContent).toContain('Settings Screen')
    expect(root.textContent).toContain('Home Screen')
    const panels = root.querySelectorAll('[role="tabpanel"]') as unknown as HTMLElement[]
    expect(panels[1]?.style.display).toBe('flex')
    expect(panels[0]?.style.display).toBe('none')
  })

  it('deep-links straight to a non-default tab', () => {
    const { root } = setup('/settings')
    const tabs = root.querySelectorAll('[role="tab"]')
    expect(tabs[1]?.getAttribute('aria-selected')).toBe('true')
  })
})
