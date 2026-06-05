---
"@mindees/core": minor
---

Add `startTransition` and `deferred` — the ergonomic concurrent layer over the scheduler primitive.

- **`startTransition(fn)`** applies the writes in `fn` immediately (reads see the latest) but defers
  the effects they invalidate onto the scheduler's low-priority lane — so a heavy re-render from a
  keystroke doesn't block the interaction (the `useTransition` pattern). Coalesces the transition's
  writes into one deferred flush.
- **`deferred(source)`** returns a low-priority view of an accessor that lags under sustained updates
  (the `useDeferredValue` pattern — show stale results while the latest compute).

Both degrade to **synchronous** when no scheduler is injected (every existing call site, SSR, tests),
so the synchronous default is unchanged. The deferred lane also gained a runaway-loop cap and
guaranteed-unique per-effect scheduler keys (from the primitive's adversarial review).
