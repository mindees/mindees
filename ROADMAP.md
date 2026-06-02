# Roadmap

MindeesNative is built **bottom-up**: each phase depends only on the ones before
it, and each ends with something a person can actually run. A phase is "done"
only when `pnpm verify` (lint + typecheck + test + build) is green in CI.

See [STATUS.md](./STATUS.md) for current maturity.

- [x] **Phase 0 — Repository, governance & toolchain foundation** ✅
  Monorepo, full OSS/governance surface, verified toolchain, green CI, package
  scaffolds exporting only metadata + `NotImplementedError`.
- [x] **Phase 1 — `@mindees/core` I: signals & reactivity** ✅
  Glitch-free, leak-free fine-grained reactivity.
- [x] **Phase 2 — `@mindees/core` II: component model, scheduler & threading** ✅
  Selector-based, re-render-isolated context; priority scheduler; worker-backed
  thread abstraction (native multi-thread is research-track).
- [x] **Phase 3 — `@mindees/renderer` (Helix): web/DOM target + backend contract** ✅
  Working SSR-capable DOM backend + headless test backend; `NativeBackend`
  interface defined.
- [x] **Phase 4 — `@mindees/compiler` (MDC): build-time optimizer** ✅
  Type-check gate, TSX transform, tree-flattening, per-route splitting
  (TS→native AOT is a labeled research track with a working fallback).
- [x] **Phase 5 — `@mindees/cli` (Forge) + `create-mindees`** ✅
  `create` / `dev` (web HMR) / `build` / `doctor`; tested templates.
- [x] **Phase 6 — `@mindees/router` (Quantum) I: typed routing core** ✅
  Codegen-free typed path params (template-literal types), Standard-Schema
  validated typed search params (any Zod/Valibot/ArkType schema; zero runtime
  dep), signals-native router state with selector-based re-render isolation, typed
  + relative navigation, dynamic route-table reconfiguration without state reset,
  and injectable history (memory + browser).
- [x] **Phase 7 — `@mindees/router` (Quantum) II: render integration + data/guards/transitions** ✅
  Nested route tree + match chain, `createRouterView` (fine-grained,
  layout-preserving nested rendering), typed `createLink`; **SWR data loaders**
  (`AbortSignal` cancellation, `invalidate`, `preload`), **navigation guards**
  (`beforeNavigate` cancel/redirect + idempotent navigation), and **web view
  transitions** (`document.startViewTransition`, feature-detected). Built on
  `@mindees/core` (renderer is a test-only devDependency). Deferred to a later
  router phase: the global typed route registry, file-based route scanning + a
  bundler/Metro plugin, per-key fine-grained loader signals, native shared-element
  transitions.
- **Phase 8 — `@mindees/renderer` (Helix): the native strand**
  The framework-defining piece — render to real native platforms, not a web view.
  Built as a sub-phased track so each step is real and tested:
  - [x] **Phase 8A — Native command backend foundation** ✅
    A platform-neutral, serializable `NativeCommand` protocol + a
    `createNativeCommandBackend()` that implements the Helix `HostBackend`
    contract, turning the element tree + fine-grained reactive updates into a
    command stream a native host can replay. Event handlers cross as stable
    handler ids, never as serialized functions. (This is the path, not yet pixels.)
  - [x] **Phase 8B — Native host conformance contract + reference host** ✅
    `createReferenceHost()` — the inverse of the backend: it consumes the command
    stream, reconstructs the view tree, and **strictly validates** it (throws on
    any malformed/leaking sequence). It is the executable spec a real native host
    implements, and piping the backend through it proves the stream is valid and
    non-leaking end to end. The UIKit (iOS) and Android-View reference host projects
    in `examples/native-hosts/` implement these semantics.
  - [ ] **Phase 8C — iOS host MVP** _(toolchain-gated: needs macOS/Xcode)_
    A real Swift package (`examples/native-hosts/ios/`) is **authored** — UIKit
    renderer + a device-free, `swift test`-able apply/validation core implementing
    the 8B contract. Remaining: build + run it on a device and wire the JS↔native
    bridge (the maintainers have no macOS toolchain to verify it).
  - [ ] **Phase 8D — Android host MVP** _(toolchain-gated: needs the Android SDK)_
    A real Gradle/Android library (`examples/native-hosts/android/`) is **authored**
    — `android.view` renderer + a `./gradlew test`-able core. Remaining: build + run
    on a device and wire the bridge (no Android SDK available to verify it).
  - [ ] **Phase 8E — Native example app**
    An end-to-end runnable native example proving the full path.
- [ ] **Phase 9 — `@mindees/updates` (Pulse): signed differential OTA + SDUI**
  Manifest, binary diff, Ed25519 signing, atomic rollback, reference server.
- [ ] **Phase 10 — `@mindees/data` (Continuum): local-first store & sync**
  Reactive offline store, delta sync, conflict resolution.
- [ ] **Phase 11 — `@mindees/ai` (Synapse): on-device contract + dev-time AI**
  Mock + server backends, guided generation, tool calling, error explainer.
- [ ] **Phase 12 — `@mindees/atlas` (Atlas) + first-party capability modules**
  Accessible primitives + recycling list (web impls; native research-track).
- [ ] **Phase 13 — Examples, docs, benchmarks, release & governance**
  Runnable web example (offline + live OTA), docs site, enforced perf budgets,
  codemods, release pipeline, `v0.x.0`.

> Phases are gated: each is completed and reviewed before the next begins.
> Native rendering (Phase 8) is prioritized ahead of OTA/data/AI because it is the
> framework's defining capability and the prerequisite for a real native app.
