# @mindees/compiler

**MDC** — the Mindees Compiler. A build-time optimizer built on the TypeScript
Compiler API: a strict **type-check gate**, a **TSX → `createElement`** transform
(matching `@mindees/core`), **tree-flattening**, a per-route **code-splitting**
manifest, a **plugin API**, a **perf-lint** (warns on reactive/render footguns),
and **enforced performance budgets** (a build that exceeds its bytes/elements
budget refuses to emit — "100% optimized" is enforced, not aspirational).

> **Status: 🧪 Experimental (Phase 4).** Implemented and tested. The working
> emit path is **TS → optimized JavaScript**. **TS → native machine code (AOT)**
> is a research track (`compileToNative` throws `NotImplementedError`). APIs may
> change before `1.0`.

## Install

```bash
pnpm add -D @mindees/compiler
```

## Why the TypeScript Compiler API?

Only TypeScript can **type-check** — the compiler's #1 job. It also does JSX
lowering, transforms, and source maps in one tool, with **zero native binaries**
(deterministic, reproducible CI). See
[ADR-0002](../../docs/adr/0002-compiler-foundation.md). An SWC/oxc-accelerated
*emit* path is a documented future optimization.

## Quick start

```ts
import { compileChecked, buildRouteManifest } from '@mindees/compiler'

// Type-check gate: a build must not ship type errors.
const bad = compileChecked('export const a: number = "oops"')
bad.code         // '' — refused to emit
bad.diagnostics  // [{ code: 'TS2322', severity: 'error', ... }]

// Compile valid TSX → createElement, with tree-flattening + a source map.
const ok = compileChecked('export const v = <view id="x"><text>hi</text></view>')
ok.code          // '..._static(createElement("view", { id: "x" }, ...))...'
ok.stats         // { flattenedNodes: 1, totalElements: 2 }
ok.map           // JSON source map

// Per-route code-splitting manifest (file-based routing).
buildRouteManifest(['index.tsx', 'blog/[slug].tsx'])
// → { routes: [{ routePath: '/', ... },
//              { routePath: '/blog/:slug', params: ['slug'], chunk: 'route_blog_slug' }] }

// Opt-in perf-lint: warns on reactive/render footguns (never blocks the build).
compileChecked(src, { perf: true }).diagnostics
// → [{ severity: 'warning', code: 'MDC_PERF_001', ... }]  // e.g. a list via bare .map()

// Enforced budget: a violation is an ERROR that refuses to emit (spec §12).
const over = compileChecked(src, { budget: { maxBytes: 256, maxElements: 40 } })
over.code         // '' — over budget, refused to emit
over.diagnostics  // [{ severity: 'error', code: 'MDC_BUDGET_BYTES' | 'MDC_BUDGET_ELEMENTS', ... }]
```

## What the optimizer does

- **Type-check gate** (`typecheck` / `compileChecked`) — strict (`strict`,
  `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`); structured
  `Diagnostic`s with `TSxxxx` codes + positions. `compileChecked` refuses to emit
  on any `error`.
- **TSX → `createElement`** — JSX lowered to the `@mindees/core` factory, with
  source maps.
- **Tree-flattening** — fully-static element subtrees are wrapped once as
  `_static(createElement(...))`, a create-once / never-diff constant. Purely
  additive (never drops or reorders nodes). `stats.flattenedNodes` /
  `stats.totalElements` quantify it.
- **Per-route manifest** (`buildRouteManifest`) — maps a file tree to lazily
  loadable chunks (`index` → `/`, `[param]` → `:param`, `[...rest]` catch-all,
  `(group)` layout groups dropped from the URL).
- **Plugin API** (`MdcPlugin`) — plugins receive the `typescript` module and
  return a transformer that runs **after** JSX desugaring (so they see
  `createElement(...)` calls, not raw JSX).
- **Perf-lint** (`perfLint` / `compileChecked(src, { perf })`) — an opt-in pass
  that flags real performance footguns in the fine-grained reactive + Helix render
  model as `warning` diagnostics (it **never blocks the build**): a list via bare
  `.map()` (`MDC_PERF_001`), a keyed builder with no `key` (`002`), heavy work in a
  sync-lane `effect()` (`003`), a signal re-read in a loop (`004`), a subscribing
  `effect()` with no cleanup (`005`), a static literal in a function-valued prop
  (`006`), and a large inline list (`007`, off by default). Each rule reports a
  concrete structural fact and *why* it's slow in this model — no invented
  frame-time numbers. Suppress with a `// mdc-perf-ignore [CODE]` comment or
  `rules: { MDC_PERF_001: 'off' }`. A diagnostic neither RN nor Flutter ships.
- **Enforced perf budgets** (`checkBudget` / `compileChecked(src, { budget })`) —
  spec §12: the compiler **fails the build** when a module exceeds its `maxBytes`
  (compiled UTF-8 output) or `maxElements` (pre-flatten UI-tree count) budget. A
  violation is an `error` that refuses to emit (`code: ''`), same contract as the
  type-check gate — "100% optimized" is enforced, not aspirational. Neither React
  Native nor Flutter enforces a perf budget at build time.

## API

| Export | Kind | Description |
| --- | --- | --- |
| `typecheck(source, fileName?)` | fn | Type-check → `Diagnostic[]`. |
| `hasErrors(diagnostics)` | fn | Any `error`-severity diagnostic? |
| `compile(source, options?)` | fn | TSX → JS (+ flatten, plugins, source map). |
| `compileChecked(source, options?)` | fn | Gate (+ opt-in `perf`/`budget`), then compile; no emit on type or budget errors. |
| `perfLint(source, fileName?, options?)` | fn | Opt-in perf-lint → `warning` `Diagnostic[]`; never blocks. |
| `checkBudget(result, budget)` | fn | Perf-budget check → `error` `Diagnostic[]` for each exceeded limit. |
| `buildRouteManifest(files)` / `fileToRoute` / `chunkName` / `generateRouteModule` | fn | Per-route manifest + file-based route codegen. |
| `createFlattenTransformer` / `STATIC_MARKER` | fn | The flatten pass. |
| `compileToNative` | fn | 🔬 research track — throws `NotImplementedError`. |
| `CompileOptions`, `CompileResult`, `Diagnostic`, `MdcPlugin`, `BudgetOptions`, `PerfLintOptions`, … | type | Public types. |

## License

`MIT OR Apache-2.0`
