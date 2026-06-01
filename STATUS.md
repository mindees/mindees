# STATUS — what actually works today

This file is the **single source of truth** for MindeesNative's maturity. It is
deliberately conservative. If something is not listed as working here, assume it
does not work.

**Last updated:** Phase 5 (Forge CLI + create-mindees) — complete: the `mindees`
CLI (`create`, `build` via the compiler, `doctor`, `info`, a tested dev
rebuild-orchestrator) plus `create-mindees` (`npm create mindees`) shipped. The
live dev-server HTTP/HMR transport is a developer preview; on-device NL→app
generation is Phase 10 (today `--prompt` maps to a template deterministically).

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
| Compiler: type-check gate + TSX transform + tree-flatten + route manifest | ✅ done (Phase 4) — `@mindees/compiler` (TS→native AOT 🔬) |
| CLI: create + build + doctor + info + dev orchestrator; `npm create mindees` | ✅ done (Phase 5) — `@mindees/cli` + `create-mindees` (dev HTTP/HMR transport = preview) |

## Per-package

| Package | Maturity | Notes |
| --- | --- | --- |
| `@mindees/core` | 🧪 Experimental | Phase 1 reactivity + Phase 2 component model, selector-isolated context, priority scheduler & thread-pool (Web Worker + inline). Native multi-threading is 🔬. |
| `@mindees/compiler` | 🧪 Experimental | MDC build-time optimizer (type-check gate, TSX→createElement, tree-flattening, per-route manifest, plugin API) on the TS Compiler API shipped in Phase 4. TS→native AOT is 🔬. |
| `@mindees/cli` | 🧪 Experimental | Forge CLI shipped in Phase 5: create (+ templates), build (via the compiler), doctor, info, dev rebuild-orchestrator. Live dev-server HTTP/HMR transport is a preview. |
| `@mindees/router` | 🚧 Scaffold | Typed routing core lands in Phase 6; data/transitions Phase 7. |
| `@mindees/renderer` | 🧪 Experimental | Helix reconciler + web/DOM backend + SSR/hydration + headless backend shipped in Phase 3. Native (iOS/Android) + GPU canvas are 🔬. |
| `@mindees/atlas` | 🚧 Scaffold | Lands in Phase 11 (web impls; native 🔬). |
| `@mindees/ai` | 🚧 Scaffold | Lands in Phase 10 (mock/server backends; on-device 🔬). |
| `@mindees/data` | 🚧 Scaffold | Lands in Phase 9. |
| `@mindees/updates` | 🚧 Scaffold | Lands in Phase 8. WASM module runtime is 🔬. |
| `create-mindees` | 🧪 Experimental | `npm create mindees` scaffolder shipped in Phase 5; delegates to `@mindees/cli`'s tested core. |

## Standing research tracks (the honest frontier)

These are real seams in the architecture, deliberately **not** faked. Each has
(or will have) a documented working fallback:

- **TypeScript → native machine code (AOT).** Fallback: typed paths optimized,
  dynamic paths run on an embedded engine / the web target. _(Phase 4)_
- **Native iOS/Android renderer backends.** Fallback: web/DOM is the reference
  platform; the `NativeBackend` interface is defined first. _(Phase 3)_
- **GPU canvas strand (wgpu/WebGPU).** _(Phase 3+)_
- **On-device LLM runtime (ExecuTorch / Apple Foundation Models / Gemini Nano).**
  Fallback: deterministic mock + server backend. _(Phase 10)_
- **Sandboxed WASM Component-Model module runtime.** Fallback: first-party
  modules + a validated declarative subset. _(Phases 8/11)_

> If you find any symbol in this repo that claims to do something it doesn't,
> that's a bug — please open an issue. Honesty is a feature.
