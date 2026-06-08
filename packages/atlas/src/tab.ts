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

import { type Component, createElement, effect, provideContext, signal } from '@mindees/core'
import type { LoaderData, RouteComponentProps, Router } from '@mindees/router'
import type { Reactive } from './host'
import { Pressable, Text, View } from './primitives'
import { flattenStyle, type StyleInput } from './style'
import { VisibilityScope } from './visibility'

const IDLE_LOADER: LoaderData = Object.freeze({ status: 'idle' })

/** One tab in a {@link createTabNavigator}. */
export interface TabDef {
  /** The route path this tab activates + navigates to (e.g. `/home`). */
  readonly path: string
  /** Tab-bar label (also the tab's accessible name). */
  readonly label: string
  /**
   * The screen component for this tab. Receives the full {@link RouteComponentProps} contract (`router`,
   * reactive `params`/`search`, and `data` for the active route's loader) — the same props
   * `createRouterView` passes — so a tab screen reads params + loader data the standard way. (A plain
   * `() => …` component that ignores props is fine.) NOTE: nested routes *under* a tab are not auto-rendered
   * into an outlet — a tab whose route has children should render its own `createRouterView` for them.
   */
  readonly component: Component<RouteComponentProps>
}

/** Per-render presentation overrides — mirror `createStackNavigator`'s per-render ergonomics. */
export interface TabNavigatorProps {
  /** Tab-bar edge (default `'bottom'`). Overrides the factory default for this render. */
  readonly tabBarPosition?: 'top' | 'bottom'
  /** Extra style merged into the tab bar. Overrides the factory default for this render. */
  readonly tabBarStyle?: Reactive<StyleInput>
}

/** Options for {@link createTabNavigator}. The `tabs` list is required at factory time. */
export interface TabNavigatorOptions extends TabNavigatorProps {
  readonly tabs: readonly TabDef[]
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
): Component<TabNavigatorProps> {
  const tabs = options.tabs

  return (props = {}) => {
    // Per-render overrides win over the factory defaults (parity with createStackNavigator).
    const position = props.tabBarPosition ?? options.tabBarPosition ?? 'bottom'
    const tabBarStyle = props.tabBarStyle ?? options.tabBarStyle
    // Active tab = the LONGEST tab path that prefixes the current pathname (deep-link + nested-route aware).
    // Returns -1 when the URL belongs to NO tab — better to select/show nothing than a misleading tab 0.
    const activeIndex = (): number => {
      const path = router.location().pathname
      let best = -1
      let bestLen = -1
      tabs.forEach((t, i) => {
        if ((path === t.path || path.startsWith(`${t.path}/`)) && t.path.length > bestLen) {
          best = i
          bestLen = t.path.length
        }
      })
      return best
    }

    // Lazy + keep-alive (RN parity): a tab's screen mounts on its FIRST activation and stays mounted
    // thereafter, so an unvisited tab's loaders/effects never run, and a visited tab keeps its state.
    const visited = tabs.map(() => signal(false))
    effect(() => {
      visited[activeIndex()]?.set(true)
    })

    // One panel per tab; only the active one is shown (`display:none` also drops inactive panels from the
    // a11y tree + tab order). The screen is mounted lazily (once visited) and never unmounted.
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
        // Thread the router screen contract so a tab screen reads params/search/loader-data the standard
        // way (mirrors createRouterView). `data` resolves the active leaf match; `children` is null (a tab
        // screen with nested routes renders its own createRouterView — see TabDef.component).
        () => {
          if (!visited[i]?.()) return null
          // Provide this panel's visibility to its subtree so an overlay (Modal/Toast) opened by the screen
          // hides with the tab instead of floating on the overlay layer when another tab is active (ADR-0025).
          provideContext(VisibilityScope, () => activeIndex() === i)
          return createElement(t.component, {
            router,
            params: router.params,
            search: router.search,
            data: () => {
              const m = router.match()
              return m ? router.loaderData(m) : IDLE_LOADER
            },
            children: null,
          })
        },
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
        style: styleFn(tabBarStyle, { display: 'flex', flexDirection: 'row' }),
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
