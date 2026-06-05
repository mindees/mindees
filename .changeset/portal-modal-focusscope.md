---
"@mindees/core": minor
"@mindees/renderer": minor
"@mindees/atlas": minor
---

Add a portal primitive + `Modal`/`FocusScope` (the last core RN-parity gap).

- **`@mindees/core`**: `portal(children, { mount? })` + `isPortal` + the `PortalRegion` node type.
  A serializable description; children relocate to an overlay layer while staying owned by the
  logical tree (so reactive disposal still unmounts them).
- **`@mindees/renderer`**: `bindPortalChild` (a `mountNode` branch) mounts portal children into
  `HostBackend.overlayRoot()` — a new **optional** backend method (DOM lazily creates one
  `data-mindees-overlay` layer on `<body>`; the native command backend emits a dedicated `overlay`
  node; headless leaves it unset so portals mount in place — SSR-correct). Removal resolves each
  node's real parent (`parentOf`), since content lives in the overlay, not the logical parent. Also
  adds a minimal `ref: (hostNode) => void` prop (fired after insert) for host-node capture.
- **`@mindees/atlas`**: `Modal` (portal + dismissable scrim + Escape + a focus-scoped dialog gated
  by a reactive `visible`) and `FocusScope` (captures + restores focus on web, `role="dialog"` +
  `aria-modal`; declarative on native — true focus trap/back-button are a host follow-up).

Covered by portal reconciler tests (relocation, sibling ordering, dispose-no-leak, gating toggle,
reactive children, in-place fallback) and DOM Modal tests (overlay placement + a11y, scrim/Escape
close, focus restore).
