/**
 * The active-router registry. Hooks (`useRouter`, `useParams`, …) and the bound
 * `Link` need the current router without prop-drilling — Expo Router solves this
 * with a single global root router, and so do we: {@link createRouter} registers
 * itself as active, and the hooks read it here.
 *
 * Apps almost always have one root router; if you create several, the most recently
 * created is "active" (pass the router explicitly via `createLink(router)` /
 * `RouteComponentProps.router` when you need a specific one).
 *
 * @module
 */

import type { Router } from './router'

let active: Router | null = null

/** Register `router` as the active router (called by {@link createRouter}). */
export function setActiveRouter(router: Router): void {
  active = router
}

/** The active router, or `null` if none has been created yet. */
export function getActiveRouter(): Router | null {
  return active
}

/**
 * Clear the active router IF it is `router` (called by `dispose()`), so a disposed router
 * no longer leaks through `useRouter()`/`<Link>`. Guarded by identity so disposing an old
 * router doesn't clobber a newer active one.
 */
export function clearActiveRouter(router: Router): void {
  if (active === router) active = null
}
