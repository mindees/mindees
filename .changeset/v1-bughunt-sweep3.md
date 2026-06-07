---
"@mindees/core": patch
"@mindees/ai": patch
"@mindees/renderer": patch
"@mindees/cli": patch
---

Fix eight correctness bugs from the third v1 bug-hunt (untouched surfaces), each with a regression test:

- **core (deferred):** `deferred()` no longer subscribes its **enclosing** effect/computed to the source
  (it seeded the mirror tracked) — which defeated deferral and leaked an effect per re-run. Seeded untracked.
- **core (thread-pool):** a late/duplicate `onerror` from an **already-replaced** worker no longer rejects
  the live replacement's jobs or evicts it (added a worker-identity guard).
- **ai (server SSE):** empty keep-alive events (`data:` with no payload) are skipped instead of crashing
  the stream with `JSON.parse('')`; and a **terminal finish event** is delivered even if the abort signal
  flips on that iteration (servers that omit `[DONE]` no longer drop the final chunk).
- **ai (mappers):** tool results containing a **bigint / cycle** serialize losslessly to the model instead
  of collapsing to `"[object Object]"`.
- **renderer (DOM):** a **string** `style` prop is applied via `cssText` (was silently dropped, breaking
  styling + hydration parity).
- **renderer (SSR):** the CSS serializer now runs only for the `style` attribute — a non-style object prop
  (e.g. `data-config={{…}}`) serializes like the DOM backend, restoring SSR/DOM hydration parity.
- **cli (build):** a `.jsx`/`.js` route is no longer added to the manifest when the build doesn't compile
  it — no more dangling route chunk in a green build.
