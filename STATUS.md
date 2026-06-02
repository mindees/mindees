# STATUS — what actually works today

This file is the **single source of truth** for MindeesNative's maturity. It is
deliberately conservative. If something is not listed as working here, assume it
does not work.

**Last updated:** Phase 8B (Helix native strand — host conformance contract) — complete.
`@mindees/renderer` now includes both halves of the native path on the JS side:
the **native command backend** (`createNativeCommandBackend()`, Phase 8A) that
turns the element tree + fine-grained reactive updates into a serializable
`NativeCommand` stream, and a strict **reference host** (`createReferenceHost()`,
Phase 8B) — the inverse — that consumes the stream, reconstructs the view tree, and
validates it (throwing on any malformed/leaking sequence). It is the executable
**conformance contract** a real native host must satisfy; piping the backend
through it proves the stream is valid and non-leaking end to end. **It still does
not draw to a screen.** Compiled iOS/Android hosts that render the stream are
toolchain-gated (Phase 8C needs macOS/Xcode, 8D needs the Android SDK — neither is
available in this project's dev/CI environment); authored UIKit (iOS) and
Android-View host projects live in `examples/native-hosts/` (pending verification).
**You cannot build a native mobile app end-to-end with MindeesNative today.**

Phase 7 (Quantum Router II) — complete (render integration +
data/guards/transitions). `@mindees/router` renders (`createRouterView` —
fine-grained, layout-preserving nested rendering; `createLink` — typed links) and
now also does **data loaders** with stale-while-revalidate caching, `AbortSignal`
cancellation, `invalidate()` and `preload()` (intent prefetch); **navigation
guards** (`beforeNavigate` cancel/redirect + idempotent navigation); and **web
view transitions** (`document.startViewTransition`, feature-detected, SSR/native-
safe). Built on `@mindees/core` (the renderer is a test-only devDependency).
Still deferred (not exported): the global typed route registry, file-based route
scanning + bundler plugin, per-key fine-grained loader signals, and native
shared-element transitions.

Phase 6 (Router I) shipped the typed routing core: codegen-free typed path params
(template-literal types), Standard-Schema-validated typed search params (any
Zod/Valibot/ArkType schema, zero runtime dep), a signals-native router with typed
+ relative navigation and selector-isolated route state, dynamic reconfiguration
without state reset, and injectable history (memory + browser).

## Legend

| Badge | Meaning |
| --- | --- |
| ✅ **Stable** | Implemented, tested, documented; safe to rely on (within `0.x`). |
| 🧪 **Experimental** | Implemented but API may change; use with care. |
| 🔬 **Research track** | Not implemented. Public symbols (if any) throw `NotImplementedError` and are marked `@experimental`. |
| 📋 **Planned** | Not started; design pending. |
| 🚧 **Scaffold** | Package exists and builds, but exports only metadata (`name`, `VERSION`, `maturity`, `info`), the `Maturity`/`PackageInfo` status types, and `NotImplementedError` / `notImplemented` utilities. |

## Project-level

| Capability | Status |
| --- | --- |
| Monorepo + workspaces | ✅ done (Phase 0) |
| Open-source governance (license, CoC, security, contributing, RFCs) | ✅ in place |
| Verified toolchain (pnpm/turbo/ts/biome/vitest/changesets) | ✅ done (Phase 0) |
| CI (lint + typecheck + test + build) | ✅ done (Phase 0) |
| Reactivity (signals/computed/effect/batch) | ✅ done (Phase 1) — `@mindees/core` |
| Component model + selector-isolated context | ✅ done (Phase 2) — `@mindees/core` |
| Priority scheduler + thread-pool abstraction | ✅ done (Phase 2) — `@mindees/core` (native threads 🔬) |
| Reactive renderer + web/DOM backend + SSR/hydration | ✅ done (Phase 3) — `@mindees/renderer` (native + GPU canvas 🔬) |
| Native command backend (element tree + reactive updates → serializable `NativeCommand` stream) | ✅ done (Phase 8A) — `@mindees/renderer` |
| Native host conformance contract (strict reference host: replay + validate the command stream) | ✅ done (Phase 8B) — `@mindees/renderer` (compiled iOS/Android hosts that render the stream are 🔬, toolchain-gated Phase 8C/8D) |
| Compiler: type-check gate + TSX transform + tree-flatten + route manifest | ✅ done (Phase 4) — `@mindees/compiler` (TS→native AOT 🔬) |
| CLI: create + build + doctor + info + dev orchestrator; `npm create mindees` | ✅ done (Phase 5) — `@mindees/cli` + `create-mindees` (dev HTTP/HMR transport = preview) |
| Router: typed params + validated typed search + signals-native state + typed/relative navigation | ✅ done (Phase 6) — `@mindees/router` |
| Router render integration: nested routes, `createRouterView` (layout-preserving), typed `createLink` | ✅ done (Phase 7) — `@mindees/router` |
| Router data/guards/transitions: SWR loaders + prefetch + invalidate, guards (cancel/redirect/idempotent), view transitions | ✅ done (Phase 7) — `@mindees/router` (typed registry, file-scan 📋) |

## Per-package

| Package | Maturity | Notes |
| --- | --- | --- |
| `@mindees/core` | 🧪 Experimental | Phase 1 reactivity + Phase 2 component model, selector-isolated context, priority scheduler & thread-pool (Web Worker + inline). Native multi-threading is 🔬. |
| `@mindees/compiler` | 🧪 Experimental | MDC build-time optimizer (type-check gate, TSX→createElement, tree-flattening, per-route manifest, plugin API) on the TS Compiler API shipped in Phase 4. TS→native AOT is 🔬. |
| `@mindees/cli` | 🧪 Experimental | Forge CLI shipped in Phase 5: create (+ templates), build (via the compiler), doctor, info, dev rebuild-orchestrator. Live dev-server HTTP/HMR transport is a preview. |
| `@mindees/router` | 🧪 Experimental | Quantum Router I (Phase 6) + II (Phase 7). I: codegen-free typed path params, Standard-Schema validated typed search params, signals-native router state with selector isolation, typed + relative navigation, dynamic reconfiguration, memory + browser history. II: nested route tree + match chain, `createRouterView` (fine-grained, layout-preserving nested rendering), typed `createLink`, SWR data loaders (+ AbortSignal, `invalidate`, `preload`), navigation guards (cancel/redirect/idempotent), web view transitions. Deferred 📋: global typed route registry, file-based scanning + bundler plugin, per-key fine-grained loader signals, native shared-element transitions. |
| `@mindees/renderer` | 🧪 Experimental | Helix reconciler + web/DOM backend + SSR/hydration + headless backend shipped in Phase 3. **Phase 8A** added the native command backend (`createNativeCommandBackend()`): a serializable `NativeCommand` protocol + a `HostBackend` that emits it (events as stable handler ids; subtree-safe disposal). **Phase 8B** added `createReferenceHost()`: a strict reference host that replays + validates the stream — the conformance contract real native hosts implement. Compiled iOS/Android host rendering (toolchain-gated) + GPU canvas are 🔬. |
| `@mindees/atlas` | 🚧 Scaffold | Lands in Phase 12 (web impls; native 🔬). |
| `@mindees/ai` | 🚧 Scaffold | Lands in Phase 11 (mock/server backends; on-device 🔬). |
| `@mindees/data` | 🚧 Scaffold | Lands in Phase 10. |
| `@mindees/updates` | 🚧 Scaffold | Lands in Phase 9. WASM module runtime is 🔬. |
| `create-mindees` | 🧪 Experimental | `npm create mindees` scaffolder shipped in Phase 5; delegates to `@mindees/cli`'s tested core. |

## Standing research tracks (the honest frontier)

These are real seams in the architecture, deliberately **not** faked. Each has
(or will have) a documented working fallback:

- **TypeScript → native machine code (AOT).** Fallback: typed paths optimized,
  dynamic paths run on an embedded engine / the web target. _(Phase 4)_
- **Native iOS/Android renderer backends.** The platform-neutral **native command
  backend** (Phase 8A) plus a strict **reference host** that replays + validates the
  command stream (Phase 8B) are implemented and tested. Real **iOS (SwiftPM) and
  Android (Gradle) host projects** are authored in `examples/native-hosts/` — each
  with a device-free, unit-testable apply/validation core — but are **pending
  verification** (no macOS/Android toolchain in dev/CI). What remains 🔬 is building +
  running them on a device with a JS↔native bridge — toolchain-gated (Phase 8C needs
  macOS/Xcode, 8D the Android SDK). Fallback today: web/DOM. _(Phase 3, 8A, 8B)_
- **GPU canvas strand (wgpu/WebGPU).** _(Phase 3+)_
- **On-device LLM runtime (ExecuTorch / Apple Foundation Models / Gemini Nano).**
  Fallback: deterministic mock + server backend. _(Phase 10)_
- **Sandboxed WASM Component-Model module runtime.** Fallback: first-party
  modules + a validated declarative subset. _(Phases 8/11)_

> If you find any symbol in this repo that claims to do something it doesn't,
> that's a bug — please open an issue. Honesty is a feature.
