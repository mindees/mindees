# @mindees/renderer

## 0.30.3

### Patch Changes

- @mindees/core@0.30.3

## 0.30.2

### Patch Changes

- @mindees/core@0.30.2

## 0.30.1

### Patch Changes

- @mindees/core@0.30.1

## 0.30.0

### Patch Changes

- @mindees/core@0.30.0

## 0.29.0

### Patch Changes

- @mindees/core@0.29.0

## 0.28.0

### Patch Changes

- @mindees/core@0.28.0

## 0.27.2

### Patch Changes

- Updated dependencies [9040462]
  - @mindees/core@0.27.2

## 0.27.1

### Patch Changes

- @mindees/core@0.27.1

## 0.27.0

### Patch Changes

- @mindees/core@0.27.0

## 0.26.0

### Patch Changes

- @mindees/core@0.26.0

## 0.25.0

### Patch Changes

- @mindees/core@0.25.0

## 0.24.0

### Patch Changes

- @mindees/core@0.24.0

## 0.23.0

### Patch Changes

- @mindees/core@0.23.0

## 0.22.8

### Patch Changes

- Updated dependencies [8de302d]
  - @mindees/core@0.22.8

## 0.22.7

### Patch Changes

- Updated dependencies [3a3bcae]
  - @mindees/core@0.22.7

## 0.22.6

### Patch Changes

- Updated dependencies [34605e2]
  - @mindees/core@0.22.6

## 0.22.5

### Patch Changes

- bed575f: Fix eight correctness bugs from the third v1 bug-hunt (untouched surfaces), each with a regression test:

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

- Updated dependencies [bed575f]
  - @mindees/core@0.22.5

## 0.22.4

### Patch Changes

- Updated dependencies [6782bee]
  - @mindees/core@0.22.4

## 0.22.3

### Patch Changes

- Updated dependencies [7a7d7b7]
  - @mindees/core@0.22.3

## 0.22.2

### Patch Changes

- 9282b43: Fix seven correctness bugs found by a second adversarial bug-hunt (toward stable v1), each with a regression test:

  - **router (file routes):** a dynamic/catch-all **directory** name (`posts/[id]/…`) was left literal `[id]`, so
    every Expo-style nested dynamic route was dead — now mapped to `:id`/`:x*` like file names.
  - **compiler (transform):** the auto JSX-runtime import no longer **duplicates** a `createElement`/`Fragment`
    already bound by another import or a local declaration (which produced a module that crashes on load).
  - **compiler (route codegen):** `generateRouteModule` now JSON-escapes the import specifier — a filename with a
    quote no longer emits a non-parsing module.
  - **core (animation):** a throwing `onComplete` can no longer **freeze every animation** — the completion
    callback is isolated and the rAF chain always re-arms.
  - **cli (create):** drive-relative / versioned paths (`C:foo`, `app:1.0`) are rejected up front instead of
    crashing `mkdir` (the CLI's "never throws" contract).
  - **renderer (SSR):** HTML **void elements** (`img`/`input`) serialize without a closing tag/children, so
    crawlable markup round-trips to the same tree the reconciler builds.
  - **atlas (Accordion):** `defaultOpen` now respects single-open mode from the first frame.

- Updated dependencies [9282b43]
  - @mindees/core@0.22.2

## 0.22.1

### Patch Changes

- 57a45ee: Fix six correctness bugs found by an adversarial bug-hunt (toward stable v1), each with a regression test:

  - **renderer (Canvas2D):** `insert` now has move-semantics (detach before insert) — reordering a keyed
    list no longer **duplicates** the moved node in the scene graph (matched the headless/native/DOM backends).
  - **data (Continuum sync):** a migrated whole-value (primitive/array) record is now resolved by HLC — a
    strictly-newer per-field set **supersedes** it instead of being silently masked, fixing data loss and a
    CvRDT **divergence** between a migrated and a fresh replica.
  - **data (IndexedDB persistence):** a transient `open` failure is no longer cached forever — the next
    `load`/`save` **retries** instead of the handle being bricked for the session.
  - **atlas (useForm):** `handleSubmit` guards against **double submission** while a submit is in flight;
    `isValid()` is now derived from the schema against current values (correct before the first validate()).
  - **core (createElement):** an array passed via the `children` prop is used as-is (no **double-wrap**), so
    `element.children` has one consistent shape regardless of how children were supplied.

- Updated dependencies [57a45ee]
  - @mindees/core@0.22.1

## 0.22.0

### Patch Changes

- @mindees/core@0.22.0

## 0.21.0

### Patch Changes

- @mindees/core@0.21.0

## 0.20.0

### Patch Changes

- @mindees/core@0.20.0

## 0.19.0

### Patch Changes

- Updated dependencies [e8622ed]
  - @mindees/core@0.19.0

## 0.18.0

### Patch Changes

- @mindees/core@0.18.0

## 0.17.0

### Patch Changes

- @mindees/core@0.17.0

## 0.16.0

### Patch Changes

- @mindees/core@0.16.0

## 0.15.0

### Patch Changes

- @mindees/core@0.15.0

## 0.14.0

### Patch Changes

- @mindees/core@0.14.0

## 0.13.0

### Patch Changes

- @mindees/core@0.13.0

## 0.12.0

### Patch Changes

- @mindees/core@0.12.0

## 0.11.0

### Minor Changes

- 0c22052: `NativeApp.dispatchEvent` now carries an optional text value: `dispatchEvent(handlerId, value?)`. When a
  value is present it's wrapped as `{ target: { value } }` so input/change handlers read the typed text via
  the standard event shape (`eventValue`); an absent/null value preserves notify-only behavior for
  press/click. This unblocks value-carrying native events (e.g. `onChangeText`) — the native hosts pass the
  raw string and JS owns the event-object wrapping. Empty-string clears are delivered (not swallowed).

### Patch Changes

- @mindees/core@0.11.0

## 0.10.0

### Minor Changes

- 951d72f: Add the **Helix Canvas strand** (spec §6.2) — `createCanvas2DBackend()`, a retained-mode 2D scene
  graph driven by the SAME reconciler as the native/DOM strands. Build a `canvas-rect`/`canvas-circle`/
  `canvas-line`/`canvas-text`/`canvas-group` subtree with fine-grained reactivity, then `paint(ctx, w, h)`
  rasterizes it to any `Scene2DContext` (a real `CanvasRenderingContext2D` satisfies it on web; a WebGPU
  rasterizer can drive the same scene graph later). This is the Flutter-grade pixel-control advantage —
  opt-in, per-subtree — without bolting on Skia (RN) or losing native components (Flutter).

### Patch Changes

- @mindees/core@0.10.0

## 0.9.0

### Patch Changes

- @mindees/core@0.9.0

## 0.8.0

### Patch Changes

- @mindees/core@0.8.0

## 0.7.0

### Patch Changes

- @mindees/core@0.7.0

## 0.6.0

### Minor Changes

- 4535c24: **`createNativeApp` now makes animations + concurrency work by default on a native host** (P2 toward
  RN/Flutter parity). On a host it installs a reactive scheduler (so `startTransition`/`deferred`/
  normal-lane effects run) and a vsync-driven frame source (so `timing`/`spring`/gesture animations and
  stack-navigator transitions actually advance). The host drives frames by calling the new
  `MindeesApp.frameTick(nowMs)` each vsync; the engine signals when to run/stop that loop via a
  `MindeesHostFrame.setFrameLoopActive(boolean)` global — so the loop runs **only while something is
  animating** (battery-friendly), tied to the animation engine's own arm/sleep. Deferred/normal-lane
  tree mutations reach the host via a coalesced trailing flush (one frame late, never dropped).

  Opt-out + safe by default: with no host (SSR / Node / tests) nothing is installed and animations jump
  to their final value exactly as before — the existing behavior and tests are unchanged. New
  `scheduler` / `wireEngines` options on `createNativeApp` for full control.

### Patch Changes

- @mindees/core@0.6.0

## 0.5.0

### Patch Changes

- Updated dependencies [503be19]
- Updated dependencies [4d1707d]
- Updated dependencies [4591937]
- Updated dependencies [f8318f9]
  - @mindees/core@0.5.0

## 0.4.0

### Minor Changes

- ea9915f: Add a portal primitive + `Modal`/`FocusScope` (the last core RN-parity gap).

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

### Patch Changes

- Updated dependencies [ea9915f]
  - @mindees/core@0.4.0

## 0.3.0

### Minor Changes

- 0cf8168: Add `ActivityIndicator` — a spinning loading indicator. It emits a dedicated
  `activityindicator` host element that each backend renders natively: the **DOM backend**
  builds a CSS keyframe spinner (keyframes injected once per document; size from
  `width`/`height`, the arc from `color`), and the Android host renderer maps it to an
  indeterminate `ProgressBar` (with `color` → tint). Size/color flow through ordinary style
  keys; defaults to the theme primary; `animating={false}` renders nothing.
- 2eba52a: Add keyed list reconciliation — `For` (and the underlying `keyedRegion`/`bindKeyedChild`).

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

### Patch Changes

- 25832b1: Fix SSR style serialization: the headless/server backend emitted style objects with
  camelCase CSS names and no units (`backgroundColor:red;marginTop:8`), so server-rendered
  markup was invalid and never matched the hydrated DOM. The DOM and headless backends now
  share one canonical serializer (`css.ts`) that kebab-cases names and applies `px` units
  (`background-color:red;margin-top:8px`), so SSR output equals the client DOM.
- Updated dependencies [2eba52a]
  - @mindees/core@0.3.0

## 0.2.0

### Minor Changes

- c29f76c: Developer-experience: write apps in plain JSX with a one-call entry point.

  - **`@mindees/core`** now ships an **automatic JSX runtime** (`@mindees/core/jsx-runtime`
    and `@mindees/core/jsx-dev-runtime`). Set `"jsx": "react-jsx"` +
    `"jsxImportSource": "@mindees/core"` and write `<View><Text>hi</Text></View>` with **no
    manual `createElement` import** — the compiler/bundler injects `jsx`/`jsxs`/`Fragment`.
    Both delegate to `createElement`, and the package exposes the `JSX` type namespace so
    TSX type-checks.
  - **`@mindees/renderer`** adds **`createNativeApp(root, options?)`** — a one-call entry
    for embedded native hosts that wires the native command backend, renders the root,
    flushes command batches to the host, and exposes the `start()`/`dispatchEvent()`
    contract. `rootId` defaults to the host convention (`"host-root"`) and `emit` defaults
    to `globalThis.MindeesHost.emit`, so the app entry is just `createNativeApp(<App />)`.

  Together these turn a native app's entry from ~40 lines of backend/host plumbing in
  `createElement` calls into idiomatic TSX.

### Patch Changes

- Updated dependencies [c29f76c]
  - @mindees/core@0.2.0

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
