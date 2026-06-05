---
"@mindees/core": minor
"@mindees/renderer": minor
"@mindees/atlas": minor
---

Add keyed list reconciliation — `For` (and the underlying `keyedRegion`/`bindKeyedChild`).

The idiomatic `() => items().map(...)` tears down and rebuilds every row on any change, destroying
host-node identity (focus, caret, scroll, input state) and, on native, emitting full dispose/create
churn. `For` reconciles **by key**: existing rows are reused (their item/index signals patched in
place), new keys created in their own reactive root, removed keys disposed, and host nodes moved with
a longest-increasing-subsequence pass so the minimum number move (append → 0, adjacent swap → 1, full
reverse → n−1). This delivers the spec's "O(what-changed), no diff storms, no FlatList cliff" promise.

- **`@mindees/core`**: `keyedRegion(options)` + `isKeyedRegion` + the `KeyedRegion` node type (added to
  `MindeesNode`). A serializable description — no rendering logic — so it's renderer-agnostic.
- **`@mindees/renderer`**: `bindKeyedChild` (the reconciler) + a `mountNode` branch ahead of the
  reactive-child path, so a `For` is never routed to the full-rebuild binding. `mountNode` is now exported.
- **`@mindees/atlas`**: `For` on the `@mindees/atlas/for` subpath — the ergonomic component
  (default key = item identity; optional `key`/`fallback`). Complements the virtualized `List`.

Covered by reconciler tests (identity across reorder/reverse/append, in-place patch with no sibling
re-runs, scoped disposal, duplicate/null-key guards, fallback, identity keying) and a happy-dom test
proving DOM focus survives a reorder.
