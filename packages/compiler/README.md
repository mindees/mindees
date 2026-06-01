# @mindees/compiler

**MDC** — the Mindees Compiler. A build-time optimizer built on the TypeScript
Compiler API: a strict **type-check gate**, a **TSX → `createElement`** transform
(matching `@mindees/core`), **tree-flattening**, a per-route **code-splitting**
manifest, and a **plugin API**.

> **Status: 🧪 Experimental (Phase 4).** Implemented and tested. The working
> emit path is **TS → optimized JavaScript**. **TS → native machine code (AOT)**
> is a research track (`compileToNative` throws `NotImplementedError`). APIs may
> change before `1.0`.

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

## API

| Export | Kind | Description |
| --- | --- | --- |
| `typecheck(source, fileName?)` | fn | Type-check → `Diagnostic[]`. |
| `hasErrors(diagnostics)` | fn | Any `error`-severity diagnostic? |
| `compile(source, options?)` | fn | TSX → JS (+ flatten, plugins, source map). |
| `compileChecked(source, options?)` | fn | Gate, then compile; no emit on errors. |
| `buildRouteManifest(files)` / `fileToRoute` / `chunkName` | fn | Per-route manifest. |
| `createFlattenTransformer` / `STATIC_MARKER` | fn | The flatten pass. |
| `compileToNative` | fn | 🔬 research track — throws `NotImplementedError`. |
| `CompileOptions`, `CompileResult`, `Diagnostic`, `MdcPlugin`, … | type | Public types. |

## License

`MIT OR Apache-2.0`
