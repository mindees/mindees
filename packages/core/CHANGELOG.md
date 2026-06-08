# @mindees/core

## 0.25.0

## 0.24.0

## 0.23.0

## 0.22.8

### Patch Changes

- 8de302d: Resolve the two v1 doc-contract decisions from the bug-hunt, each with a regression test:

  - **core (gesture):** `swipe()` now derives `direction` from the **release velocity** (the flick intent)
    instead of net displacement, so `direction` always agrees with the sign of `velocityX`/`velocityY`. A
    reversing flick (drag one way, fling back) now reports the way it was flung — previously `direction`
    (net travel) and the reported velocity could disagree. Falls back to displacement only at zero velocity.
  - **cli (scaffold):** documented `--force`'s real contract — it **overlays/merges** the template onto a
    non-empty target (overwriting same-named files, keeping the user's other files); it does not wipe the
    directory (the FileSystem abstraction has no delete primitive). The misleading "overwrite" wording and
    the not-empty error message are corrected.

## 0.22.7

### Patch Changes

- 3a3bcae: Fix urgent-vs-transition scheduling in the reactive core: an **urgent write** (outside any
  `startTransition`) now interrupts a **transition-deferred effect** and runs it synchronously with the
  urgent value — even when the effect reads the signal **through one or more computeds** (the mark used to
  die at an already-colored computed, so the urgent update was swallowed until the next drain).

  - Preemption is decided **per node** (a parked sync effect is reached whether it sits at CHECK or DIRTY),
    deduped by an `urgentEpoch` stamp so a diamond is never re-walked and no effect is preempted twice.
  - It fires **only** for transition-deferred SYNC effects; a `priority:'normal'` effect stays deferred by
    the dev's explicit choice (an urgent write does not force it synchronous).
  - Glitch-freedom and no-redundant-recompute are preserved (the effect recomputes its sources in order and
    an unchanged memo still suppresses the run); detaching/replacing the scheduler mid-defer flushes the
    parked effects instead of stranding them, and honors an open `batch`/`startTransition`.

  The entire path is inert on every default/SSR run (no scheduler, or nothing deferred). The companion
  self-write-during-flush bug remains deferred. Verified across three adversarial review rounds + 1165 tests.

## 0.22.6

### Patch Changes

- 34605e2: Fix the final five bugs from the third v1 bug-hunt — closing the sweep — each with a regression test:

  - **cli (build):** source maps now resolve to the real `src/` file — `sources` is rewritten relative to
    the output (was a non-existent `dist/*.tsx`), `sourceRoot` cleared, and the `sourceMappingURL` comment
    points at the literal `.map` filename (TS percent-encodes `[ ]`, which didn't match the written file).
  - **cli (build):** two sources whose basenames differ only by extension (`App.ts` + `App.tsx`) now fail
    the build with an `MDC_OUTPUT_COLLISION` error instead of one silently overwriting the other's `dist/App.js`.
  - **cli (dev-server):** the live-reload client embeds the **render-time** build version as its baseline
    (built per-request) — a rebuild that lands within the first poll interval no longer misses the reload.
  - **core (scheduler):** re-scheduling a keyed task with a **different priority** now relocates it to the
    requested lane (latest priority wins), instead of silently keeping its original lane.
  - **core (scheduler):** a recovery task scheduled by `onError` during the runaway-loop guard is no longer
    stranded — the overflow is reported outside the flushing window so the recovery arms a fresh flush.

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

## 0.22.4

### Patch Changes

- 6782bee: Fix the last clearly-fixable bugs from the v1 bug-hunt, each with a regression test:

  - **compiler:** the injected JSX-runtime import is now placed **after** a leading `"use client"`/`"use
server"` directive (an import before it demoted the directive to a no-op — breaking the RSC/web path).
  - **compiler:** the **element budget** (`maxElements`) is now enforced even with `flatten:false` — a
    count-only pass populates `totalElements` so `compileChecked` refuses to emit over-budget regardless
    of the optimizer.
  - **core (animation):** `interpolate` with `extrapolate:'extend'` past a **zero-width terminal segment**
    now extends the last real slope (and falls back to the terminal output if all terminal segments are
    degenerate) instead of returning the plateau's start value.

## 0.22.3

### Patch Changes

- 7a7d7b7: Fix four more correctness bugs from the v1 bug-hunt (the deferred batch), each with a regression test:

  - **router (loaders):** a route that declares a `searchSchema` no longer runs its **loader on raw,
    unvalidated search** when validation fails — it surfaces a `VALIDATE_SEARCH` error instead (the
    `LoaderContext.search` "validated" contract is now honored; loaders never see attacker-controlled raw strings).
  - **router (file routes):** duplicate effective route paths (e.g. `users.tsx` + `users/index.tsx`, or two
    `(group)` indexes) now emit a **dev warning** instead of one route being silently unreachable.
  - **compiler (perf-lint):** a **trailing** `// mdc-perf-ignore` no longer bleeds onto the next line's
    finding — the line-above lookback is honored only for a standalone ignore comment.
  - **core (gesture):** the pan recognizer now **resets** translation/velocity/position state on the final
    pointer-up (it was stuck at the last drag offset), consistent with tap/long-press.

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

## 0.22.0

## 0.21.0

## 0.20.0

## 0.19.0

### Minor Changes

- e8622ed: Add **`on`** — make an `effect`/`memo` react to an _explicit_ dependency only. The body runs untracked
  (signals it reads don't subscribe); only the `deps` accessor does. The callback gets the current dep
  value, the previous, and its own previous return. `{ defer: true }` skips the first run (still tracking),
  so you react to _changes_ not the initial value. `effect(on(() => id(), (id) => load(id)))`.

## 0.18.0

## 0.17.0

## 0.16.0

## 0.15.0

## 0.14.0

## 0.13.0

## 0.12.0

## 0.11.0

## 0.10.0

## 0.9.0

## 0.8.0

## 0.7.0

## 0.6.0

## 0.5.0

### Minor Changes

- 503be19: Add an **animation system** — RN `Animated`/Reanimated + Flutter `AnimationController` parity, built
  entirely on the reactive core.

  - **`@mindees/core`**: `animate(initial)` returns an `AnimatedValue` that **is a reactive accessor**
    (read it in a `style` fn → only that node re-renders, no renderer surface). Drive it with
    `timing(av, { to, duration, easing })` or `spring(av, { to, stiffness, damping })`; `interpolate`
    maps a value through ranges; `cubicBezier` + named easings. One injected `FrameSource`
    (`setFrameSource` — mirroring `setReactiveScheduler`; `rafFrameSource()` for web, `manualFrameSource()`
    for tests, vsync for native) drives a single loop that ticks all animations in **one `batch` per
    frame** (glitch-free). With **no frame source** (SSR/headless), animations jump to their final value
    synchronously — deterministic, never a hang. Animations started in a component scope auto-stop on
    unmount; springs have a stability cap; `done` + `onComplete` settle exactly once.
  - **`@mindees/atlas`**: `motion` (the easing tokens as ready easing fns) + `animateTo` (timing with
    the standard duration/easing token defaults).

- 4d1707d: Add a **gesture system** — RN Gesture Handler / Flutter GestureDetector parity, built on the reactive
  core and composing with the animation engine.

  - **`@mindees/core`**: `tap`, `longPress`, `pan`, `pinch`, `swipe` recognizer factories. Each returns
    `{ handlers, state, reset }` — spread `handlers` (`onPointerDown/Move/Up/Cancel`) onto an element,
    read `state` (reactive signals: pan's `translationX/Y` + `velocityX/Y`, pinch's `scale`/`focal`, …)
    in a `style` accessor. `composeGestures([...])` merges recognizers onto one element (required since
    the renderer binds a single listener per event). `panAnimated(x, y, { release })` is the headline:
    drag follows the finger and **springs to a target seeded with the gesture velocity** on release.
    Platform differences live only in `normalizePointer` (web PointerEvent + native payload); an
    injectable clock makes long-press deterministic; SSR-safe (pure payload → signal).
  - **`@mindees/atlas`**: `GestureView` — attach a recognizer to a view (handlers wired, auto-`reset`
    on unmount).

  Native multi-touch payload wiring is a documented research-track follow-up; an explicit exclusive
  gesture arena (beyond per-recognizer slop disambiguation) is a follow-up.

- 4591937: Wire the priority scheduler into reactivity — concurrent-class prioritized / deferred updates,
  **without changing the synchronous default**. `effect(fn, { priority: 'normal' })` defers its
  re-runs through a scheduler injected via `setReactiveScheduler(scheduler)` (interaction priority /
  deferred heavy work); rapid re-stales coalesce to one run (latest value), and disposal cancels any
  pending flush. The first run is always synchronous (deps + initial paint), and with no scheduler
  injected — every existing call site, all tests, and SSR — `'normal'` falls back to synchronous, so
  the glitch-free synchronous default is provably untouched (one `lane` field defaulting to `'sync'`
  plus a single `flushEffects` branch that is unreachable unless a scheduler is set). `startTransition`
  / `deferred` ergonomics + a native frame source are an additive follow-up.
- f8318f9: Add `startTransition` and `deferred` — the ergonomic concurrent layer over the scheduler primitive.

  - **`startTransition(fn)`** applies the writes in `fn` immediately (reads see the latest) but defers
    the effects they invalidate onto the scheduler's low-priority lane — so a heavy re-render from a
    keystroke doesn't block the interaction (the `useTransition` pattern). Coalesces the transition's
    writes into one deferred flush.
  - **`deferred(source)`** returns a low-priority view of an accessor that lags under sustained updates
    (the `useDeferredValue` pattern — show stale results while the latest compute).

  Both degrade to **synchronous** when no scheduler is injected (every existing call site, SSR, tests),
  so the synchronous default is unchanged. The deferred lane also gained a runaway-loop cap and
  guaranteed-unique per-effect scheduler keys (from the primitive's adversarial review).

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

## 0.3.0

### Minor Changes

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

- 43c3d33: Audit hardening for `@mindees/core` (reactivity, scheduler, thread pool, component model). Eleven defects found by an adversarial review and confirmed with regression tests:

  - **Reactivity** — a computation that writes a signal it reads (a "self-write") no longer silently drops the change; it recomputes until its own writes settle, bounded by the infinite-loop guard. An effect that disposes itself mid-run no longer leaks subscriptions or registers cleanups on the dead scope. A prior-run cleanup that throws during a re-run no longer strands the effect's children/dynamic deps — the graph is rebuilt and the error still surfaces. The public `Owner` type is now an opaque handle, so the internal `Computation` graph (and `any`) no longer leaks into published types.
  - **Scheduler** — key eviction is identity-checked, so a stale handle can no longer break same-key dedup (two same-key tasks could both run). A throwing `onError` hook no longer aborts the flush or strands queued tasks.
  - **Thread pool** — a worker crash now rejects all and only that worker's in-flight jobs (previously it rejected one arbitrary job, often another healthy worker's, and leaked the rest), terminates the dead worker, and respawns a replacement so the pool stays live and `size` stays accurate.
  - **Component** — `renderComponent` disposes the partial reactive scope if the component throws during render, instead of leaking it with no disposer returned.
  - **Metadata** — the exported `info` object is frozen to match its `readonly` contract.
