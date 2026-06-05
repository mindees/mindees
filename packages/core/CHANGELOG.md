# @mindees/core

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
