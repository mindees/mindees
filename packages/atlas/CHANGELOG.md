# @mindees/atlas

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

- 716e035: Fix `List`/`SectionList` silently dropping a reactive (accessor) `style`. The scroll
  container eagerly `flattenStyle`-d the caller's style, which `Object.assign`-es a function to
  nothing — so a `style={() => ({...})}` was lost at runtime despite being typed as supported.
  The container now keeps the style reactive when the caller's is (merging the base
  height/position into the live accessor), so it updates fine-grained like every other style.
- Updated dependencies [2eba52a]
  - @mindees/core@0.3.0

## 0.2.0

### Minor Changes

- bee8227: Add a component library: **Card, Divider, Badge, Avatar, Chip, Switch, SafeAreaView,
  KeyboardAvoidingView, ProgressBar** (determinate).

  Each is composed purely from the existing primitives + device hooks — no new host
  concepts — so they render on web _and_ native today, and stay fine-grained: reactive
  parts (Switch/Chip state, ProgressBar fill, SafeAreaView/KeyboardAvoidingView padding)
  are accessor styles, so only the changed node updates, never a component re-render.

  Defaults follow the 2026 UI/UX handbook: 8pt spacing, 12–16 corner radius, WCAG-AA tone
  contrast (badge tones use -700 shades for ≥4.5:1 on white), and proper roles
  (`separator`, `progressbar`, `switch`, `status`). Also adds the `separator` and
  `progressbar` ARIA roles to `Role`.

- 0a61015: Add a design-token layer + theming (2026 UI/UX handbook §7–24, §31).

  - **Primitive scales**: `space` (8pt), `radius`, `fontSize` (1.25 type scale), `lineHeight`,
    `fontWeight`, `duration`/`easing` (motion), and color `palette` ramps — plus a `tokens`
    aggregate of the non-color scales.
  - **Semantic theming**: a `Theme` (`bg`/`surface`/`surfaceVariant`/`text`/`textMuted`/`border`/
    `primary`/`onPrimary`/`success`·`warning`·`danger`·`info`) with light & dark variants.
    **Dark mode is a token-set swap** (§23/§31): `useTheme()` returns a reactive theme driven by
    `useColorScheme()`, and `getTheme(scheme)` resolves one non-reactively.
  - **Components are now themed**: Card, Divider, Badge, Avatar, Chip, Switch, ProgressBar consume
    the theme, so they re-theme automatically light↔dark — fine-grained (only color nodes update),
    with WCAG-AA tone contrast in both modes.

- e254642: Add device hooks + a platform environment — the signal-backed equivalents of React
  Native's `useWindowDimensions`, `useColorScheme`, `useSafeAreaInsets`, and `Keyboard`.

  - **`useWindowDimensions()`**, **`useColorScheme()`**, **`useSafeAreaInsets()`**,
    **`useKeyboard()`** return Quantum-style reactive accessors, so reads are
    fine-grained — rotating the device or switching theme re-runs only the nodes that
    read that value, never the whole tree (RN re-renders the component).
  - **`setEnvironment(partial)`** / **`getEnvironment()`** — the host/runtime feeds the
    environment (on launch and on rotation/theme/keyboard changes); each field is a
    separate signal so updates stay isolated.

  Closes a real RN-parity gap (MindeesNative previously had no dimensions/appearance
  API). The Android example wires it end-to-end: the host injects window size + color
  scheme, and the home screen shows them live.

- 3e2ef33: Add `SectionList` (on the `@mindees/atlas/list` subpath) — a **virtualized** sectioned list
  built on `createList`. Sections are flattened to a single header/row entry stream and windowed,
  so only the visible headers and rows render (RN-parity `SectionList`, perf-optimized). Provides
  `SectionList`/`createSectionList`, `Section`, `SectionListOptions`, and the pure `flattenSections`
  helper. `renderSectionHeader` is optional (defaults to the section title); fixed row height in v1
  (headers share it), matching the List's current model.

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

- c1acd04: Audit hardening for `@mindees/ai` (Synapse) and `@mindees/atlas`. An adversarial review confirmed seven defects (the structured-output/tool-calling allowlist, SSE framing, and mock/research stubs held up); each is fixed with a regression test.

  **@mindees/ai**

  - **Broken Anthropic auth via the mapper object (high)** — `createServerBackend` chose `x-api-key` auth only when `adapter` was the string `'anthropic'`; passing the exported `anthropicMapper` _object_ (supported public API) fell through to `Authorization: Bearer` + no `anthropic-version`, so Anthropic returned 401. Auth now follows the mapper (new `ProviderMapper.auth` field), so the name and object forms authenticate identically.
  - **OpenAI stream parser dropped finish/usage on a combined event (medium)** — when one SSE event carried a content delta _and_ `finish_reason`/`usage` (common in local OpenAI-compatible servers), the parser early-returned the text-delta and silently lost the terminal finish + token usage. `StreamParser` now returns an array, so an event can emit both the delta and the finish.
  - **Abort consistency (low ×2)** — `generate()` now re-checks the abort signal after the round-trip (matching `stream()`/`runTools`), and `stream()` checks the `[DONE]` sentinel before the abort poll so a completed stream never throws a spurious `ABORTED`.

  **@mindees/atlas**

  - **`ScrollView horizontal` was a no-op (medium)** — it only set an inert `data-orientation` attribute no backend reads. It now drives real horizontal layout through the curated style subset (`flexDirection: 'row'` + `overflow: 'auto'` + `flexWrap: 'nowrap'`).
  - **`Pressable` over-subscribed plain reactive styles (low)** — every function `style` was treated as an interaction-state fn, so an ordinary reactive style re-ran on every hover/press/focus. State-fns are now distinguished by arity, so a plain `() => StyleInput` accessor only re-runs on its own dependencies.
  - **Decorative `Image` kept a contradictory `aria-label` (low)** — a decorative image given both `decorative` and `label` emitted `aria-hidden="true"` _and_ `aria-label`; the label is now dropped so a decorative image exposes no accessible name.

  Both packages' exported `info` objects are now frozen (consistency).

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
