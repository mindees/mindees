---
"@mindees/renderer": patch
---

Audit hardening for `@mindees/renderer` (Helix reconciler, DOM/headless backends, SSR). Five defects found by an adversarial review and confirmed with regression tests:

- **SSR XSS (critical)** — `serialize()` interpolated attribute *names* into markup unescaped, so a prop key containing `>`/`<`/quotes could break out of the tag and inject `<script>` when props are built from user/server data. Attribute names are now validated against the HTML name grammar and unsafe names are dropped (matching what the DOM's `setAttribute` would accept).
- **Render-time leak (high)** — `render()` captured the scope disposer only as `createRoot`'s return value, so a component or `mountNode` that threw mid-render orphaned every effect/reactive binding already created (they stayed subscribed forever) and the caller got no disposer. The disposer is now captured eagerly and the partial scope is disposed before the error is rethrown.
- **Detached `serialize()` (high)** — the headless backend's `serialize` recursed via `this`, so destructuring it (`const { serialize } = backend` — legal per its `SerializableBackend` function-member type) threw. It now recurses through a binding-independent helper.
- **Event-listener leak (medium)** — DOM event listeners added on mount were never removed on unmount (only reclaimed by GC, and still live if the node was retained). The reconciler now registers an `onCleanup` that drives the backend's listener-removal path, restoring disposal symmetry.
- **SSR/DOM boolean divergence (low)** — a boolean `true` attribute serialized as `attr="true"` but the DOM backend writes `attr=""`; SSR now emits the valueless form so server and hydrated markup match.

Also freezes the exported `info` object to match its `readonly` contract (consistency with `@mindees/core`).
