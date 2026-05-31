# STATUS — what actually works today

This file is the **single source of truth** for MindeesNative's maturity. It is
deliberately conservative. If something is not listed as working here, assume it
does not work.

**Last updated:** Phase 0 (foundations) — complete (merged to `main`, CI + Release green).

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
| Any framework functionality | 📋 not yet — starts Phase 1 |

## Per-package

| Package | Maturity | Notes |
| --- | --- | --- |
| `@mindees/core` | 🚧 Scaffold | Reactivity/scheduler land in Phases 1–2. |
| `@mindees/compiler` | 🚧 Scaffold | Optimizer/codegen lands in Phase 4. TS→native AOT is 🔬. |
| `@mindees/cli` | 🚧 Scaffold | Lands in Phase 5. |
| `@mindees/router` | 🚧 Scaffold | Typed routing core lands in Phase 6; data/transitions Phase 7. |
| `@mindees/renderer` | 🚧 Scaffold | Web/DOM backend lands in Phase 3. Native + GPU canvas are 🔬. |
| `@mindees/ui` | 🚧 Scaffold | Lands in Phase 11 (web impls; native 🔬). |
| `@mindees/ai` | 🚧 Scaffold | Lands in Phase 10 (mock/server backends; on-device 🔬). |
| `@mindees/data` | 🚧 Scaffold | Lands in Phase 9. |
| `@mindees/updates` | 🚧 Scaffold | Lands in Phase 8. WASM module runtime is 🔬. |
| `create-mindees` | 🚧 Scaffold | Lands in Phase 5. |

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
