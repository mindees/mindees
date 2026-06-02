/**
 * Render integration — `createRouterView` (renders the matched route chain) and
 * `createLink` (typed navigation links). Built on `@mindees/core`'s
 * `createElement` + signals; the renderer turns the returned function nodes into
 * fine-grained reactive regions. See ADR-0004.
 *
 * Nesting uses **explicit composition** (no ambient context): each matched route
 * component receives the next route in the chain as `children` (the outlet), and
 * the router exposes the chain as the reactive `matches` array. Each depth is a
 * reactive region keyed on that depth's route identity, so navigating a leaf
 * re-mounts only the leaf — parent layouts (and their state) are preserved.
 *
 * @module
 */

import { type Component, createElement, type MindeesElement, type MindeesNode } from '@mindees/core'
import type { LoaderData } from './data'
import { buildPath } from './pattern'
import type { NavTarget, Router } from './router'
import { type QueryValue, stringifyQuery } from './search'

/** Shared idle loader state for routes without a loader. */
const IDLE_LOADER_DATA: LoaderData = Object.freeze({ status: 'idle' })

// ---------------------------------------------------------------------------
// RouterView — render the matched route chain
// ---------------------------------------------------------------------------

/** Options for {@link createRouterView}. */
export interface RouterViewOptions {
  /** Rendered when no route matches the current location. */
  notFound?: Component
}

/**
 * Create the router's view: a node that renders the matched route **chain**
 * top-down, nesting each child into its parent's `children` (the outlet). Render
 * it with the Helix renderer (`render(createRouterView(router), backend, root)`);
 * it re-renders fine-grainedly as navigation changes the matched routes.
 *
 * @example
 * const view = createRouterView(router, { notFound: NotFound })
 * render(view, backend, root)
 */
export function createRouterView(router: Router, options: RouterViewOptions = {}): MindeesNode {
  // Each depth is its own reactive region (a function node). A region depends
  // only on a memo of its depth's matched route identity (`Object.is`), so a
  // navigation that doesn't change a given depth's route does NOT re-run that
  // region — parent layouts (and their state) stay mounted.
  //
  // The route memo is created FRESH on every region run, on purpose: a memo
  // cached across runs would be owned by — and disposed with — this region's
  // effect when it re-runs, leaving a dead source (the region would react once
  // and then freeze). A fresh memo each run is always live; the `Object.is`
  // equality on the memo is what still gates re-runs (the memo only re-runs the
  // region when the route at this depth actually changes).
  const outletAt =
    (depth: number): (() => MindeesNode) =>
    (): MindeesNode => {
      const route = router.select((s) => s.matches[depth]?.route ?? null)()
      if (route === null) {
        return depth === 0 && options.notFound ? createElement(options.notFound, {}) : null
      }
      const child = outletAt(depth + 1)
      const component = route.component
      // A component-less (layout/pathless) route passes its child through.
      if (component === undefined) return child
      return createElement(component, {
        router,
        params: router.params,
        search: router.search,
        data: () => {
          const match = router.matches()[depth]
          return match ? router.loaderData(match) : IDLE_LOADER_DATA
        },
        children: child,
      })
    }

  return outletAt(0)
}

// ---------------------------------------------------------------------------
// Link — typed navigation links
// ---------------------------------------------------------------------------

/** Extra (non-target) props accepted by a {@link LinkComponent}. */
export interface LinkOptions {
  /** Replace the current history entry instead of pushing. */
  replace?: boolean
  /** Host tag to render. Defaults to `'a'` (web). Use e.g. `'view'` on native. */
  as?: string
  /** Class applied (in addition to `class`) when the link's path is the current pathname. */
  activeClass?: string
  /** Static class. */
  class?: string
  /** Link content. */
  children?: MindeesNode
}

/** Props for a typed link: a {@link NavTarget} plus {@link LinkOptions}. */
export type LinkProps<P extends string> = NavTarget<P> & LinkOptions

/** A typed link component — params are required iff the pattern has them. */
export type LinkComponent = <P extends string>(props: LinkProps<P>) => MindeesElement

/** The broad runtime shape the Link impl accepts (typed surface is {@link LinkProps}). */
interface LinkInput {
  to: string
  params?: Record<string, string | number>
  search?: Record<string, QueryValue>
  hash?: string
  replace?: boolean
  as?: string
  activeClass?: string
  class?: string
  children?: MindeesNode
}

/** A minimal click-event shape (DOM `MouseEvent` satisfies it; tests can omit it). */
interface ClickEventLike {
  preventDefault?: () => void
  defaultPrevented?: boolean
  button?: number
  metaKey?: boolean
  ctrlKey?: boolean
  shiftKey?: boolean
  altKey?: boolean
}

/** Should a click be left for the browser (modifier/middle-click, already handled)? */
function isModifiedClick(event: ClickEventLike): boolean {
  return (
    event.defaultPrevented === true ||
    (event.button !== undefined && event.button !== 0) ||
    event.metaKey === true ||
    event.ctrlKey === true ||
    event.shiftKey === true ||
    event.altKey === true
  )
}

/** Assemble an href (path + query + hash) from a link target. */
function hrefFor(props: LinkInput): string {
  const path = buildPath(props.to, props.params ?? {})
  const query = props.search ? stringifyQuery(props.search) : ''
  let hash = props.hash ?? ''
  if (hash.length > 0 && !hash.startsWith('#')) hash = `#${hash}`
  return `${path}${query ? `?${query}` : ''}${hash}`
}

/**
 * Create a typed `Link` bound to `router`. Calling it returns an element that
 * navigates on activation (default tag `'a'` with `href` + an `onClick` that
 * honors modifier/middle clicks). Params are required iff the pattern has them.
 *
 * @example
 * const Link = createLink(router)
 * Link({ to: '/posts/:postId', params: { postId: '42' }, children: 'Open' })
 */
export function createLink(router: Router): LinkComponent {
  const Link = (props: LinkInput): MindeesElement => {
    const tag = props.as ?? 'a'
    const href = hrefFor(props)
    const onClick = (event?: ClickEventLike): void => {
      if (event && isModifiedClick(event)) return
      event?.preventDefault?.()
      // `href` is an absolute path; navigate by string (resolveHref no-ops on absolutes).
      router.navigate(href, { replace: props.replace === true })
    }

    const elementProps: Record<string, unknown> = { onClick }
    if (tag === 'a') elementProps.href = href

    if (props.activeClass !== undefined) {
      const here = buildPath(props.to, props.params ?? {})
      elementProps.class = (): string =>
        [props.class, router.location().pathname === here ? props.activeClass : undefined]
          .filter((c): c is string => typeof c === 'string' && c.length > 0)
          .join(' ')
    } else if (props.class !== undefined) {
      elementProps.class = props.class
    }

    return createElement(tag, elementProps, props.children)
  }
  return Link as LinkComponent
}
