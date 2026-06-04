/**
 * Ergonomic hooks + a bound `Link`, resolving the active router so components don't
 * prop-drill it — the familiar Expo Router surface (`useRouter`, `useLocalSearchParams`,
 * `<Link>`), on Quantum's fine-grained, validated core.
 *
 * The hooks return Quantum's reactive **accessors** (call them inside JSX/effects), so
 * reads stay fine-grained — only what changed re-runs (no whole-stack re-render).
 *
 * @module
 */

import { getActiveRouter } from './active'
import { createLink, type LinkComponent } from './components'
import type { Router } from './router'

/** The active router. Throws if none has been created (call `createRouter`/`createFileRouter`). */
export function useRouter(): Router {
  const router = getActiveRouter()
  if (!router) {
    throw new Error(
      'useRouter(): no active router. Create one with createRouter() or createFileRouter() first.',
    )
  }
  return router
}

/** Reactive accessor for the current path params (`{}` when unmatched). */
export function useParams(): () => Record<string, string> {
  return useRouter().params
}

/** Reactive accessor for the current (schema-validated) search params. */
export function useSearch(): () => Record<string, unknown> {
  return useRouter().search
}

/** Reactive accessor for the current pathname. */
export function usePathname(): () => string {
  const router = useRouter()
  return () => router.location().pathname
}

let cachedRouter: Router | null = null
let cachedLink: LinkComponent | null = null

/**
 * A typed `<Link>` bound to the active router — no need to thread the router through.
 * `params` are required iff the target pattern has dynamic segments (inferred, no codegen).
 *
 * @example
 * <Link to="/about">About</Link>
 * <Link to="/posts/:id" params={{ id: '42' }}>Open</Link>
 */
export const Link: LinkComponent = (props) => {
  const router = useRouter()
  if (router !== cachedRouter) {
    cachedRouter = router
    cachedLink = createLink(router)
  }
  return (cachedLink as LinkComponent)(props)
}
