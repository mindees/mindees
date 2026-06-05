/**
 * Portal reconciliation — the renderer side of core's {@link PortalRegion}.
 *
 * A portal's children render into an **overlay target** (`backend.overlayRoot()`, e.g. a layer on
 * `document.body`) instead of their position in the tree, so a modal/tooltip escapes parent
 * clipping and stacking. A marker in the LOGICAL parent pins the portal's slot (siblings stay
 * ordered); a content marker in the TARGET anchors the relocated content. Reactive ownership is
 * untouched — `onCleanup` binds to the current owner, not the host parent — so closing/unmounting
 * tears the overlay content down and (via Atlas) restores focus. With no overlay (headless/SSR),
 * the target falls back to the local parent: content mounts in place and stays crawlable.
 *
 * @module
 */

import { effect, onCleanup, type PortalRegion, untrack } from '@mindees/core'
import type { HostBackend } from './backend'
import { mountNode } from './render'

/**
 * Materialize a {@link PortalRegion}: mount its children into the overlay target, return only the
 * logical-tree slot marker. Must run inside an owner (it does, via `mountNode`) so its cleanup is
 * scoped — the portaled content is NOT in the returned array, so the owner's cleanup is the only
 * thing that unmounts it.
 */
export function bindPortalChild<N>(
  region: PortalRegion,
  backend: HostBackend<N>,
  parent: N,
  initialAnchor: N | null,
): N[] {
  // Target: explicit `mount` override → the backend's overlay root → the local parent (in-place
  // fallback, the SSR/no-layer default).
  const target: N = (region.mount as N | undefined) ?? backend.overlayRoot?.() ?? parent

  // A marker in the LOGICAL parent pins the portal's slot so following siblings stay ordered; the
  // portal itself occupies zero visible space here.
  const marker = backend.createText('')
  backend.insert(parent, marker, initialAnchor)

  // A marker in the TARGET anchors the relocated content (reactive swaps re-mount before it).
  const contentMarker = backend.createText('')
  backend.insert(target, contentMarker, null)

  let content: N[] = []
  const removeContent = (): void => {
    // Content lives in TARGET, not `parent`, so resolve each node's ACTUAL parent — passing the
    // logical `parent` would throw on DOM and silently leak (+ leave live listeners) on
    // headless/native. parentOf-guarded so an already-detached node is a safe no-op.
    for (const n of content) {
      const p = backend.parentOf(n)
      if (p) backend.remove(p, n)
    }
  }

  // Authoritative teardown, owned by the current reactive owner (orthogonal to host placement), so
  // it fires on the owner's dispose or a gating region's re-run (e.g. Modal `visible` → false).
  onCleanup(() => {
    removeContent()
    if (backend.parentOf(contentMarker)) backend.remove(target, contentMarker)
    if (backend.parentOf(marker)) backend.remove(parent, marker)
  })

  effect(() => {
    const value = region.children()
    untrack(() => {
      removeContent()
      content = mountNode(value, backend, target, contentMarker)
    })
  })

  return [marker]
}
