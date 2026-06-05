/**
 * Atlas `createStackNavigator` — animated stack navigation over the Quantum router, composing the
 * keyed reconciler + animation engine + gesture system. A drop-in superset of `createRouterView`:
 * pushing a route slides/fades the new screen in over the old; back reverses it; an edge swipe-back
 * gesture drives the pop interactively (release past a threshold completes it, else cancels).
 *
 * Mechanism (no new core/renderer/router surface): screens live in a {@link keyedRegion} keyed by a
 * per-entry key, so a surviving screen is reused (state/scroll preserved) and a departed one is
 * disposed exactly when its key leaves the rendered set. ONE progress {@link animate}d value drives
 * both cards' transforms via {@link interpolate} (one batch/frame → glitch-free). With no frame
 * source (SSR/headless) the transition jumps to its end, so output is the destination instantly.
 *
 * v1 limitation: a navigation that changes only params/search of the CURRENT screen (same route) is a
 * `snap` (instant) and remounts the screen — full in-screen param-state preservation is a follow-up.
 *
 * @module
 */

import {
  animate,
  type Component,
  createElement,
  createRoot,
  effect,
  getOwner,
  interpolate,
  keyedRegion,
  type MindeesNode,
  onCleanup,
  pan,
  type Signal,
  signal,
  spring,
  untrack,
} from '@mindees/core'
import { createHref, type RouteMatch, type Router } from '@mindees/router'
import { useWindowDimensions } from './environment'
import { GestureView } from './gesture'
import type { Reactive } from './host'
import { animateTo } from './motion'
import { View } from './primitives'
import type { StyleInput, StyleObject } from './style'

/** A frozen snapshot of one screen in the stack. */
interface StackEntry {
  readonly key: string
  readonly href: string
  readonly matches: readonly RouteMatch[]
}

/** Which role a card plays in the running transition. */
export type StackLayer = 'entering' | 'leaving'

/** A custom card-style interpolator (RN `cardStyleInterpolator` parity). */
export type StackInterpolator = (
  progress: () => number,
  layer: StackLayer,
  width: () => number,
) => () => StyleObject

/** Built-in transition presets. */
export type TransitionPreset = 'slide' | 'fade' | 'none'

/** Options for {@link createStackNavigator} (factory defaults) and the returned component (per-render). */
export interface StackNavigatorOptions {
  readonly notFound?: Component
  readonly transition?: TransitionPreset | StackInterpolator
  readonly gestureEnabled?: boolean
  readonly edgeWidth?: number
  readonly popThreshold?: number
  readonly flingVelocity?: number
  readonly width?: () => number
}

const PRESETS: Record<TransitionPreset, StackInterpolator> = {
  slide: (progress, layer, width) => {
    if (layer === 'entering') {
      const tx = interpolate(progress, [0, 1], [width(), 0], { extrapolate: 'clamp' })
      return () => ({ transform: `translateX(${tx()}px)` })
    }
    const tx = interpolate(progress, [0, 1], [0, -width() * 0.3], { extrapolate: 'clamp' })
    return () => ({ transform: `translateX(${tx()}px)` })
  },
  fade: (progress, layer) => {
    const o =
      layer === 'entering'
        ? interpolate(progress, [0, 1], [0, 1])
        : interpolate(progress, [0, 1], [1, 0])
    return () => ({ opacity: o() })
  },
  none: () => () => ({}),
}

const resolvePreset = (t: TransitionPreset | StackInterpolator | undefined): StackInterpolator =>
  typeof t === 'function' ? t : PRESETS[t ?? 'slide']

/** Render a route-match chain FROZEN to `matches` (the leaving card keeps its own content). */
function renderChain(
  matches: readonly RouteMatch[],
  router: Router,
  notFound?: Component,
): MindeesNode {
  const build = (depth: number): MindeesNode => {
    const m = matches[depth]
    if (!m) return depth === 0 && notFound ? createElement(notFound, {}) : null
    const child = build(depth + 1)
    const component = m.route.component
    if (component === undefined) return child
    return createElement(component, {
      router,
      params: () => m.params,
      search: () => m.search,
      data: () => router.loaderData(m),
      children: child,
    })
  }
  return build(0)
}

/**
 * Create a stack navigator bound to `router`. Render its result instead of `createRouterView(router)`.
 *
 * @example
 * const Stack = createStackNavigator(router, { transition: 'slide' })
 * render(Stack({ notFound: NotFound }), backend, root)
 */
export function createStackNavigator(
  router: Router,
  defaults: StackNavigatorOptions = {},
): (props?: StackNavigatorOptions) => MindeesNode {
  return (props: StackNavigatorOptions = {}) => {
    const opts = { ...defaults, ...props }
    const interp = resolvePreset(opts.transition)
    const gestureEnabled = opts.gestureEnabled !== false
    const edgeWidth = opts.edgeWidth ?? 30
    const popThreshold = opts.popThreshold ?? 0.5
    const flingVelocity = opts.flingVelocity ?? 0.3
    const dims = useWindowDimensions()
    const width = opts.width ?? (() => dims().width || 360)

    // All state under one root so dispose() tears it down (animation driver, gesture, keyed region).
    return createRoot(() => {
      const progress = animate(1) // 1 = top settled in, 0 = top settled out
      const stack: Signal<StackEntry[]> = signal([])
      // The running transition's two cards, or null when settled. `lower` paints under `upper`.
      const anim = signal<{
        lower: StackEntry
        upper: StackEntry
        enteringIsUpper: boolean
      } | null>(null)
      let navCounter = 0
      let gen = 0 // interruption generation: a stale onComplete no-ops

      const hrefOf = (): string => createHref(router.location())
      const entryFor = (href: string, matches: readonly RouteMatch[]): StackEntry => ({
        key: `${href}#${++navCounter}`,
        href,
        matches,
      })

      const commitTo = (next: StackEntry[]): void => {
        anim.set(null)
        stack.set(next)
        progress.set(1)
      }

      const classify = (): void => {
        const matches = router.matches()
        const href = hrefOf()
        const cur = stack()
        if (cur.length === 0) {
          stack.set([entryFor(href, matches)]) // seed (first render / deep-link), no animation
          progress.set(1)
          return
        }
        const top = cur[cur.length - 1] as StackEntry
        if (top.href === href) return // same location (re-render) — nothing to do
        const below = cur[cur.length - 2]
        if (below && below.href === href) {
          // POP (programmatic back): animate top out, then drop it.
          const g = ++gen
          anim.set({ lower: below, upper: top, enteringIsUpper: false })
          progress.set(1)
          animateTo(progress, 0, {
            onComplete: (finished) => {
              if (g === gen && finished) commitTo(cur.slice(0, -1))
            },
          })
        } else if (!cur.some((e) => e.href === href)) {
          // PUSH: animate the new screen in over the old, then keep only the new on screen.
          const entering = entryFor(href, matches)
          const g = ++gen
          anim.set({ lower: top, upper: entering, enteringIsUpper: true })
          progress.set(0)
          animateTo(progress, 1, {
            onComplete: (finished) => {
              if (g === gen && finished) commitTo([...cur, entering])
            },
          })
        } else {
          // Replace / go(±n) / ambiguous → SNAP (instant), also the SSR / 'none' path.
          ++gen
          commitTo([entryFor(href, matches)])
        }
      }

      effect(() => {
        router.matches() // track location/matches
        router.location()
        untrack(classify)
      })

      const visibleEntries = (): StackEntry[] => {
        const a = anim()
        if (a) return [a.lower, a.upper] // lower painted first (under), upper on top
        const s = stack()
        const t = s[s.length - 1]
        return t ? [t] : []
      }

      const layerFor = (entry: StackEntry): StackLayer => {
        const a = anim()
        if (!a) return 'entering'
        const isUpper = entry.key === a.upper.key
        return isUpper === a.enteringIsUpper ? 'entering' : 'leaving'
      }

      // --- swipe-back (edge pan → drive progress → spring complete/cancel) ---
      const startSwipe = (): void => {
        const cur = stack()
        if (cur.length < 2) return
        const top = cur[cur.length - 1] as StackEntry
        const below = cur[cur.length - 2] as StackEntry
        ++gen // take over any running transition
        anim.set({ lower: below, upper: top, enteringIsUpper: false })
      }
      const swipeGesture = pan({
        axis: 'x',
        minDistance: 4,
        onBegin: (e) => {
          if (e.x - e.translationX > edgeWidth) return // not an edge swipe — ignore
          startSwipe()
        },
        onUpdate: (e) => {
          if (!anim()) return
          const p = 1 - e.translationX / Math.max(width(), 1)
          progress.set(p < 0 ? 0 : p > 1 ? 1 : p)
        },
        onEnd: (e) => {
          if (!anim()) return
          const cur = stack()
          const shouldPop = progress() < popThreshold || e.velocityX > flingVelocity
          const g = ++gen
          if (shouldPop) {
            spring(progress, {
              to: 0,
              velocity: (-e.velocityX * 1000) / Math.max(width(), 1),
              onComplete: (finished) => {
                if (g !== gen || !finished) return
                commitTo(cur.slice(0, -1)) // local commit first…
                router.history.back() // …then sync history (classify() then no-ops)
              },
            })
          } else {
            spring(progress, {
              to: 1,
              velocity: (-e.velocityX * 1000) / Math.max(width(), 1),
              onComplete: (finished) => {
                if (g === gen && finished) anim.set(null) // cancel: dispose the peeked card
              },
            })
          }
        },
      })
      if (getOwner() !== null) onCleanup(() => swipeGesture.reset())

      const ScreenCard = (entry: StackEntry): MindeesNode => {
        // A reused card flips entering↔leaving during a transition, so the layer (and thus the
        // interpolator) must be read REACTIVELY — both style accessors are built once and switched.
        const enteringStyle = interp(() => progress(), 'entering', width)
        const leavingStyle = interp(() => progress(), 'leaving', width)
        const cardStyle: Reactive<StyleInput> = () => ({
          position: 'absolute',
          top: 0,
          right: 0,
          bottom: 0,
          left: 0,
          ...(layerFor(entry) === 'entering' ? enteringStyle() : leavingStyle()),
        })
        return createElement(
          View,
          { style: cardStyle },
          renderChain(entry.matches, router, opts.notFound),
        )
      }

      // The container holds the layered cards; the keyed region mounts/disposes them by key. The
      // swipe-back gesture lives on the CONTAINER (pointer events from any card bubble up), so it is
      // independent of which card is on top.
      const region = keyedRegion({
        each: visibleEntries,
        key: (e: StackEntry) => e.key,
        children: (item: () => StackEntry) => ScreenCard(item()),
      })
      const containerStyle: Reactive<StyleInput> = () => ({
        position: 'relative',
        width: '100%',
        height: '100%',
        overflow: 'hidden',
      })
      if (gestureEnabled) {
        return GestureView({ gesture: swipeGesture, style: containerStyle, children: region })
      }
      return createElement(View, { style: containerStyle }, region)
    })
  }
}
