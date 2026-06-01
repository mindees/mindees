# ADR-0002: Compiler foundation — TypeScript Compiler API (not SWC/oxc)

- **Status:** Accepted
- **Date:** 2026-06-01

## Context

Phase 4 builds the Mindees Compiler (MDC): the build-time optimizer. Its #1
requirement (per the framework spec) is a **strict type-check gate** — a build
must not ship with type errors — plus a TSX→`createElement` transform,
tree-flattening, per-route code-splitting, and a plugin API.

We evaluated three parser/transformer foundations, verifying current versions
against the npm registry on 2026-06-01:

| Option | Version | Type-checks? | Native binary? | JSX transform? |
| --- | --- | --- | --- | --- |
| **TypeScript Compiler API** | 6.0.3 | ✅ yes (uniquely) | ❌ no | ✅ yes |
| @swc/core | 1.15.40 | ❌ emit only | ✅ yes | ✅ yes |
| oxc-parser | 0.133.0 (0.x) | ❌ parse only | ✅ yes | partial |

## Decision

**Use the TypeScript Compiler API as MDC's foundation.**

Rationale (correctness-first, per the Working-Code Doctrine):

1. **Only TypeScript can type-check.** The gate is the headline feature; SWC and
   oxc do not type-check, so choosing them would *still* require shipping
   TypeScript for the gate — making them pure additive complexity for the
   correctness path.
2. **One tool does parse + check + transform (JSX) + source maps**, verified by
   a spike: `transpileModule` lowers JSX to `createElement(...)`/`Fragment`
   (matching `@mindees/core`), emits source maps, and accepts custom
   transformers.
3. **Zero native binaries** → deterministic, reproducible builds across
   Windows/macOS/Linux and CI, with no platform-specific install fragility
   (a real cost we've already paid attention to with other native deps).
4. We already pin `typescript@6.0.3` repo-wide, so no version drift.

### Spike-derived design constraint

`transpileModule` runs `before` transformers on the **pre-desugar JSX AST** and
lowers JSX during the `after` phase. Therefore the flatten optimizer and user
plugins — which match desugared `createElement(...)` **call expressions** — run
as **`after` transformers**. (We learned this empirically: a `before`-phase
transformer matching `createElement` calls matched nothing.)

## Consequences

- MDC depends on `typescript` at **runtime** (not just dev): it's a real
  dependency of `@mindees/compiler`.
- The type-check gate uses an in-memory `CompilerHost` (no files touch disk);
  `@mindees/compiler`'s tsconfig adds `types: ["node"]` for that host.
- Plugins receive the `typescript` module and return an `after` transformer
  factory, so they operate on the stable `createElement` form.
- **Emit speed**: the TS emitter is slower than SWC/oxc. An SWC/oxc-accelerated
  *emit* path (keeping TS for the gate) is a documented future optimization, not
  a Phase 4 concern.
- **TS→native AOT** remains a research track (`compileToNative` throws
  `NotImplementedError`); the working path is TS → optimized JavaScript.
