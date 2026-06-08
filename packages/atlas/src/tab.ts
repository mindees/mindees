/**
 * Atlas `createTabNavigator` — tab navigation over the Quantum router.
 *
 * Each tab owns a route path. The active tab is DERIVED from the current URL (longest matching tab path),
 * so deep-links and back/forward Just Work; tapping a tab navigates. Every tab's screen stays MOUNTED, so
 * its state (scroll position, form input, in-flight data) is preserved across switches — only visibility
 * toggles. Full ARIA `tablist`/`tab`/`tabpanel` semantics (an inactive panel is `display:none`, which also
 * removes it from the a11y tree and tab order). No new core/router surface.
 *
 * v1 scope: web is real; screens mount eagerly and keep state (lazy mounting is a follow-up). Native
 * carries the same markup (interpretation is a host concern).
 *
 * @module
 */

import { type Component, createElement } from '@mindees/core'
import type { Router } from '@mindees/router'
import type { Reactive } from './host'
import { Pressable, Text, View } from './primitives'
import { flattenStyle, type StyleInput } from './style'

/** One tab in a {@link createTabNavigator}. */
export interface TabDef {
  /** The route path this tab activates + navigates to (e.g. `/home`). */
  readonly path: string
  /** Tab-bar label (also the tab's accessible name). */
  readonly label: string
  /** The screen component shown when this tab is active. */
  readonly component: Component
}

/** Options for {@link createTabNavigator}. */
export interface TabNavigatorOptions {
  readonly tabs: readonly TabDef[]
  /** Tab-bar edge (default `'bottom'`). */
  readonly tabBarPosition?: 'top' | 'bottom'
  /** Extra style merged into the tab bar. */
  readonly tabBarStyle?: Reactive<StyleInput>
}

const styleFn = (extra: Reactive<StyleInput> | undefined, base: StyleInput): (() => StyleInput) => {
  return () => flattenStyle([base, typeof extra === 'function' ? extra() : (extra ?? {})])
}

/**
 * Create a tab navigator {@link Component} bound to `router`. Render it via `createElement` (so the
 * renderer owns its reactive scope and disposes it on unmount).
 *
 * @example
 * const Tabs = createTabNavigator(router, {
 *   tabs: [
 *     { path: '/home', label: 'Home', component: Home },
 *     { path: '/settings', label: 'Settings', component: Settings },
 *   ],
 * })
 */
export function createTabNavigator(
  router: Router,
  options: TabNavigatorOptions,
): Component<Record<string, never>> {
  const tabs = options.tabs
  const position = options.tabBarPosition ?? 'bottom'

  return () => {
    // Active tab = the LONGEST tab path that prefixes the current pathname (deep-link + nested-route aware).
    const activeIndex = (): number => {
      const path = router.location().pathname
      let best = 0
      let bestLen = -1
      tabs.forEach((t, i) => {
        if ((path === t.path || path.startsWith(`${t.path}/`)) && t.path.length > bestLen) {
          best = i
          bestLen = t.path.length
        }
      })
      return best
    }

    // One panel per tab — ALL mounted (state preserved); only the active one is shown. `display:none`
    // also removes inactive panels from the a11y tree + tab order, so no extra aria-hidden is needed.
    const panels = tabs.map((t, i) =>
      createElement(
        View,
        {
          role: 'tabpanel',
          style: () => ({
            display: activeIndex() === i ? 'flex' : 'none',
            flexDirection: 'column',
            flex: 1,
            minHeight: 0,
          }),
        },
        createElement(t.component, {}),
      ),
    )
    const panelArea = createElement(
      View,
      { style: () => ({ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }) },
      ...panels,
    )

    const bar = createElement(
      View,
      {
        role: 'tablist',
        style: styleFn(options.tabBarStyle, { display: 'flex', flexDirection: 'row' }),
      },
      ...tabs.map((t, i) =>
        createElement(
          Pressable,
          {
            role: 'tab',
            label: t.label,
            state: () => ({ selected: activeIndex() === i }),
            style: () => ({
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 12,
            }),
            onPress: () => {
              if (activeIndex() !== i) router.navigate(t.path)
            },
          },
          createElement(Text, {}, t.label),
        ),
      ),
    )

    return createElement(
      View,
      { style: () => ({ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }) },
      ...(position === 'top' ? [bar, panelArea] : [panelArea, bar]),
    )
  }
}
