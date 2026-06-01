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
- [ ] **Phase 3 — `@mindees/renderer` (Helix): web/DOM target + backend contract**
  Working SSR-capable DOM backend + headless test backend; `NativeBackend`
  interface defined.
- [ ] **Phase 4 — `@mindees/compiler` (MDC): build-time optimizer**
  Type-check gate, TSX transform, tree-flattening, per-route splitting
  (TS→native AOT is a labeled research track with a working fallback).
- [ ] **Phase 5 — `@mindees/cli` (Forge) + `create-mindees`**
  `create` / `dev` (web HMR) / `build` / `doctor`; tested templates.
- [ ] **Phase 6 — `@mindees/router` (Quantum) I: typed routing core**
  Typed + runtime-validated params, typegen, re-render isolation.
- [ ] **Phase 7 — `@mindees/router` (Quantum) II: data, guards & transitions**
  Loaders + SWR + auto-prefetch, idempotent navigation, web transitions.
- [ ] **Phase 8 — `@mindees/updates` (Pulse): signed differential OTA + SDUI**
  Manifest, binary diff, Ed25519 signing, atomic rollback, reference server.
- [ ] **Phase 9 — `@mindees/data` (Continuum): local-first store & sync**
  Reactive offline store, delta sync, conflict resolution.
- [ ] **Phase 10 — `@mindees/ai` (Synapse): on-device contract + dev-time AI**
  Mock + server backends, guided generation, tool calling, error explainer.
- [ ] **Phase 11 — `@mindees/atlas` (Atlas) + first-party capability modules**
  Accessible primitives + recycling list (web impls; native research-track).
- [ ] **Phase 12 — Examples, docs, benchmarks, release & governance**
  Runnable web example (offline + live OTA), docs site, enforced perf budgets,
  codemods, release pipeline, `v0.x.0`.

> Phases are gated: each is completed and reviewed before the next begins.
