/**
 * `VisibilityScope` — a tree-scoped (ADR-0025) "is my subtree currently visible?" signal.
 *
 * Containers that keep a subtree MOUNTED but hidden (e.g. `createTabNavigator`'s inactive, kept-alive
 * panels via `display:none`) provide it; portal-based overlays (`Modal`/`Toast`) read it and stop rendering
 * their portal when their owning subtree is hidden — otherwise the overlay's portaled content (relocated to
 * the overlay layer on `document.body`) would float over whatever is now on screen, since `display:none` on
 * the panel never reaches it. Default: always visible (no enclosing scope ⇒ behave as before).
 *
 * @module
 */

import { createContext } from '@mindees/core'

/** Reactive "is the enclosing subtree visible?" accessor. Default `() => true`. */
export const VisibilityScope = createContext<() => boolean>(() => true)
