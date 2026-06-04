# @mindees/renderer

## 0.1.0

### Minor Changes

- bf948be: First public release — **v0.1.0**.

  MindeesNative's foundation is complete and audited: fine-grained reactivity, the
  component model + selector-isolated context, the priority scheduler and thread-pool
  abstraction (`@mindees/core`); the Helix renderer with web/DOM + headless backends,
  SSR/hydration, and a CI-verified native strand on iOS (JavaScriptCore) and Android
  (QuickJS) (`@mindees/renderer` + `examples/native-hosts`); the build-time optimizer
  (`@mindees/compiler`); the Forge CLI + `create-mindees` scaffolder; the Quantum typed
  router with data loaders, guards, and view transitions (`@mindees/router`); the Pulse
  signed-OTA + SDUI system (`@mindees/updates`); the Continuum local-first CRDT store +
  sync engine (`@mindees/data`); the Synapse AI gateway (`@mindees/ai`); and the Atlas
  accessible primitives + virtualized list (`@mindees/atlas`).

  APIs are 🧪 experimental (pre-1.0); see `STATUS.md`. This `minor` bump versions the
  whole locked `@mindees/*` line at `0.1.0`.

### Patch Changes

- 17ebf9c: Audit hardening for `@mindees/renderer` (Helix reconciler, DOM/headless backends, SSR). Five defects found by an adversarial review and confirmed with regression tests:

  - **SSR XSS (critical)** — `serialize()` interpolated attribute _names_ into markup unescaped, so a prop key containing `>`/`<`/quotes could break out of the tag and inject `<script>` when props are built from user/server data. Attribute names are now validated against the HTML name grammar and unsafe names are dropped (matching what the DOM's `setAttribute` would accept).
  - **Render-time leak (high)** — `render()` captured the scope disposer only as `createRoot`'s return value, so a component or `mountNode` that threw mid-render orphaned every effect/reactive binding already created (they stayed subscribed forever) and the caller got no disposer. The disposer is now captured eagerly and the partial scope is disposed before the error is rethrown.
  - **Detached `serialize()` (high)** — the headless backend's `serialize` recursed via `this`, so destructuring it (`const { serialize } = backend` — legal per its `SerializableBackend` function-member type) threw. It now recurses through a binding-independent helper.
  - **Event-listener leak (medium)** — DOM event listeners added on mount were never removed on unmount (only reclaimed by GC, and still live if the node was retained). The reconciler now registers an `onCleanup` that drives the backend's listener-removal path, restoring disposal symmetry.
  - **SSR/DOM boolean divergence (low)** — a boolean `true` attribute serialized as `attr="true"` but the DOM backend writes `attr=""`; SSR now emits the valueless form so server and hydrated markup match.

  Also freezes the exported `info` object to match its `readonly` contract (consistency with `@mindees/core`).

- 86e5b94: Post-review hardening pass over the audit fixes (follow-ups confirmed with regression tests), plus a cross-package typecheck repair:

  - **`@mindees/renderer` — SSR element-tag injection (security)** — `serializeHeadless` interpolated the (possibly `mapTag`-mapped) tag into `<tag>`/`</tag>` unescaped, so a tag containing `>`/whitespace could break out and inject markup. The tag is now validated against the attribute-name grammar and rejected (fail closed) if unsafe.
  - **`@mindees/atlas` — `Pressable` style typecheck regression** — tightening `Accessor<T>` to a strict `() => T` left the 1-arg interaction-state style fn leaking into the `resolveStyle` branch. The arity-narrowed branch now asserts `Reactive<StyleInput>`, mirroring the state-fn cast, so the package typechecks again.
  - **`@mindees/atlas` — horizontal `ScrollView` layout was inert** — the row layout set `flexDirection`/`flexWrap` without `display: 'flex'`, so the element stayed in default block flow. `display: 'flex'` is now included.
  - **`@mindees/ai` — Anthropic streaming dropped `input_tokens`** — prompt tokens arrive on `message_start` while output tokens arrive on `message_delta`; the parser now carries `input_tokens` through to the finish chunk instead of reporting only output tokens.
  - **`@mindees/data` — HLC drift ceiling could ratchet** — the clamp ceiling is anchored to `physical + maxDriftMs` (not `max(localWall, physical) + maxDriftMs` re-added per merge), so repeated far-future merges can't walk the clock forward. The LWW same-stamp tie-break also tags `-0` distinctly from `+0` so a `-0`-vs-`+0` tie still converges.
  - **`@mindees/updates` — non-idempotent re-apply** — re-applying the already-current generation fell through and rewrote state, resetting `pendingVerification`/`bootAttempts` and un-confirming a generation that had already passed its readiness handshake. It now short-circuits to a true no-op.
  - **`@mindees/compiler` — marker collision missed destructuring** — the `_static` top-level collision check ignored destructuring bindings (`const { _static } = x`); it now recurses object/array binding patterns so flattening still bails on a real collision.
  - **`@mindees/cli` — overly specific scaffold error** — the unreadable-target message asserted "not a directory" for every `readDir` failure even though it could be a permission/I/O error; the message no longer claims a cause it didn't verify.

- Updated dependencies [43c3d33]
- Updated dependencies [bf948be]
  - @mindees/core@0.1.0
