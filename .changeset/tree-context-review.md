---
"@mindees/core": patch
"@mindees/atlas": patch
---

Harden tree-scoped context + overlay visibility after an adversarial review (3 defects, scheduler/
transition interactions cleared):

- **core (low):** a disposed scope kept its `contexts` map, so re-entering a captured-then-disposed owner via
  `runWithOwner` (e.g. deferred work after unmount) read a STALE provided value instead of the default, and
  the map's referenced values stayed reachable. Disposal now releases `contexts` (in `disposeComputation` and
  `createRoot`'s disposer).
- **atlas (medium):** `Toast`'s auto-dismiss timer read only `visible`, not the tree-scoped visibility — so a
  toast opened in a tab fired `onDismiss` off-screen after you switched tabs (the panel is kept alive). The
  timer now also gates on `VisibilityScope`.
