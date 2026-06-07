# @mindees/compiler

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

- Updated dependencies [9282b43]
  - @mindees/core@0.22.2

## 0.22.1

### Patch Changes

- Updated dependencies [57a45ee]
  - @mindees/core@0.22.1

## 0.22.0

### Patch Changes

- @mindees/core@0.22.0

## 0.21.0

### Patch Changes

- @mindees/core@0.21.0

## 0.20.0

### Patch Changes

- @mindees/core@0.20.0

## 0.19.0

### Patch Changes

- Updated dependencies [e8622ed]
  - @mindees/core@0.19.0

## 0.18.0

### Minor Changes

- e229090: Add perf-lint rule **`MDC_PERF_008`** — flags an `async` function passed to `effect()`. Dependency
  tracking stops at the first `await` (signals written afterward won't re-run the effect) and the returned
  Promise is ignored rather than used as cleanup. Keep the effect sync and launch the async work inside it.

### Patch Changes

- @mindees/core@0.18.0

## 0.17.0

### Patch Changes

- @mindees/core@0.17.0

## 0.16.0

### Patch Changes

- @mindees/core@0.16.0

## 0.15.0

### Patch Changes

- @mindees/core@0.15.0

## 0.14.0

### Patch Changes

- @mindees/core@0.14.0

## 0.13.0

### Patch Changes

- @mindees/core@0.13.0

## 0.12.0

### Patch Changes

- @mindees/core@0.12.0

## 0.11.0

### Patch Changes

- @mindees/core@0.11.0

## 0.10.0

### Minor Changes

- 2cbad54: Add build-time **performance budgets** (spec §12) — `compileChecked(src, { budget: { maxBytes, maxElements } })`
  emits an **error** that refuses to emit when a module exceeds its budget, so "100% performance
  optimized" is _enforced at build time_, not aspirational. Neither React Native nor Flutter fails a
  build on a perf budget. (`MDC_BUDGET_BYTES` / `MDC_BUDGET_ELEMENTS`; exported `checkBudget`.)

### Patch Changes

- @mindees/core@0.10.0

## 0.9.0

### Patch Changes

- 19b7b50: perf-lint: rules `MDC_PERF_003`/`MDC_PERF_004` now also catch reads of the **row accessor** a keyed
  builder passes to its callback (`For`/`List`/`keyedRegion`/… `{ children|renderItem: (item, index) => … }`
  where `item()`/`index()` are reads), closing the documented false-negative — without over-firing on a
  plain function that merely has an `item` parameter.
  - @mindees/core@0.9.0

## 0.8.0

### Patch Changes

- @mindees/core@0.8.0

## 0.7.0

### Minor Changes

- aad716b: Add an opt-in build-time **perf-lint** (`compileChecked(src, { perf: true })`) — honest `warning`
  diagnostics for real performance footguns in the fine-grained reactive + Helix render model, a
  build-time "this will be slow" signal neither React Native nor Flutter ships. It never blocks the
  build (warnings only) and reports structural facts (no invented frame-time numbers).

  v1 rules: `MDC_PERF_001` bare `.map()` list child (use `For`/`List` — a `.map` re-mounts every row);
  `MDC_PERF_002` `For`/`keyedRegion` missing `key`; `MDC_PERF_003` heavy sync work in a default effect
  (use `computed`/`memo` or the deferred lane); `MDC_PERF_004` repeated signal read in a loop;
  `MDC_PERF_005` `effect` that subscribes without cleanup; `MDC_PERF_006` constant function-valued prop
  (allocates a binding for a value that never changes); `MDC_PERF_007` (off by default) large inline
  literal list. Suppress with `// mdc-perf-ignore [CODE]` or `rules: { MDC_PERF_00x: 'off' }`. Exported
  `perfLint` for programmatic use.

### Patch Changes

- @mindees/core@0.7.0

## 0.6.0

### Patch Changes

- @mindees/core@0.6.0

## 0.5.0

### Patch Changes

- Updated dependencies [503be19]
- Updated dependencies [4d1707d]
- Updated dependencies [4591937]
- Updated dependencies [f8318f9]
  - @mindees/core@0.5.0

## 0.4.0

### Patch Changes

- 25e26a6: Fix Windows path corruption in route generation. `fileToRoute` split only on `/`, so a backslash
  path (what `path.join` yields on Windows) collapsed the whole route into a single literal segment,
  and `buildRouteManifest` stored backslash `file` specifiers that are invalid in `import()`.
  Separators are now normalized to POSIX in both, so route paths, chunk names, and import specifiers
  are correct regardless of host OS.
- Updated dependencies [ea9915f]
  - @mindees/core@0.4.0

## 0.3.0

### Patch Changes

- 25832b1: Fix the compiler so the framework's own **automatic-JSX** component style compiles and
  runs (it didn't). Two correctness bugs:

  - The type-check gate used classic JSX (`jsxFactory: createElement`), so an idiomatic
    component that imports nothing failed the gate with `TS2552 Cannot find name 'createElement'`.
    The gate now uses the automatic runtime (`jsx: react-jsx`, `jsxImportSource: '@mindees/core'`)
    with an ambient `@mindees/core/jsx-runtime` declaration, so JSX resolves with no import.
  - The transform emitted `createElement`/`Fragment` with **no import**, so emitted modules threw
    `ReferenceError` at runtime. Emit still lowers to `createElement` (the tree-flatten optimizer
    matches it), but now a transformer injects `import { createElement, Fragment } from '@mindees/core'`
    for any runtime name that's referenced but not already imported.

  Net: a component written in the documented style now type-checks **and** executes end-to-end
  (covered by a new test that compiles a no-import component and runs the output).

- Updated dependencies [2eba52a]
  - @mindees/core@0.3.0

## 0.2.0

### Minor Changes

- 852d0ac: Add `generateRouteModule(files, options?)` — file-based-routing codegen. It emits a
  TypeScript module that statically imports every route file and exposes them as the
  module map `@mindees/router`'s `createFileRouter`/`routesFromModules` consume. This is
  the build-time glue that makes file-based routing fully automatic on bundlers without
  `import.meta.glob` (e.g. an embedded-engine native bundle): scan the `app/` directory,
  run this over the file list, write `routes.gen.ts`, and import the map — drop a file in
  `app/` and it's a route, with no hand-written route config.

### Patch Changes

- Updated dependencies [c29f76c]
  - @mindees/core@0.2.0

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

- 962d912: Audit hardening for `@mindees/compiler` (MDC), `@mindees/cli` (Forge), and `create-mindees`. An adversarial review confirmed nine defects (one refuted); each is fixed with a regression test.

  **@mindees/compiler**

  - **Flatten demoted a leading directive prologue (high)** — injecting `const _static` after only the leading _imports_ placed it before a `"use client"`/`"use server"`/`"use strict"` directive, demoting it to a no-op string expression (the transform claims to be "purely additive"). The marker is now inserted after the leading directive prologue _and_ imports.
  - **Unhygienic `_static` marker (medium)** — if user code already bound `_static`, a second `const _static` was injected (a `SyntaxError`). The pass now bails out of flattening a module that already binds `_static` rather than emitting broken code.
  - **Non-injective chunk names (medium)** — `blog/[slug]` and `blog/slug` are distinct routes but both stripped to `route_blog_slug`; `buildRouteManifest` only deduped by route path. It now also rejects chunk-name collisions.
  - **Build doc/dead-code mismatch (low)** — the single-module gate drops unresolved-import (`TS2307`) diagnostics, so `build.ts`'s "reports these as warnings" claim was false; the docs now state the gate filters them upstream (the downgrade is a defensive backstop).

  **@mindees/cli**

  - **`dev` rebuild could kill the session (low)** — a throwing rebuild (e.g. a file removed mid-watch) escaped the orchestrator. It is now caught into a failed `BuildResult`, so the session keeps watching.
  - **`create` onto an existing FILE crashed (medium)** — the real `readDir` throws `ENOTDIR` on a file target, which escaped uncaught. `scaffold` now catches it and returns a clean error.
  - **Unsafe `cd` hint quoting (medium)** — `quoteShellPath` used double quotes, so a directory name containing `$(...)`/backticks/`$VAR` could execute when the printed `cd` hint was pasted. It now uses POSIX single-quote (literal) quoting.
  - **UNC path corruption (low)** — `resolveCreateTarget` silently collapsed `\\server\share` to a single-slash path; UNC inputs are now rejected with a clear error.
  - **Empty `--template` precedence divergence (low)** — `mindees create --template ""` failed with "Unknown template" while `create-mindees` deferred to the prompt/default. Both now treat an empty `--template` as "not chosen".

  All three packages' exported `info` objects are now frozen (consistency).

- 86e5b94: Post-review hardening pass over the audit fixes (follow-ups confirmed with regression tests), plus a cross-package typecheck repair:

  - **`@mindees/renderer` — SSR element-tag injection (security)** — `serializeHeadless` interpolated the (possibly `mapTag`-mapped) tag into `<tag>`/`</tag>` unescaped, so a tag containing `>`/whitespace could break out and inject markup. The tag is now validated against the attribute-name grammar and rejected (fail closed) if unsafe.
  - **`@mindees/atlas` — `Pressable` style typecheck regression** — tightening `Accessor<T>` to a strict `() => T` left the 1-arg interaction-state style fn leaking into the `resolveStyle` branch. The arity-narrowed branch now asserts `Reactive<StyleInput>`, mirroring the state-fn cast, so the package typechecks again.
  - **`@mindees/atlas` — horizontal `ScrollView` layout was inert** — the row layout set `flexDirection`/`flexWrap` without `display: 'flex'`, so the element stayed in default block flow. `display: 'flex'` is now included.
  - **`@mindees/ai` — Anthropic streaming dropped `input_tokens`** — prompt tokens arrive on `message_start` while output tokens arrive on `message_delta`; the parser now carries `input_tokens` through to the finish chunk instead of reporting only output tokens.
  - **`@mindees/data` — HLC drift ceiling could ratchet** — the clamp ceiling is anchored to `physical + maxDriftMs` (not `max(localWall, physical) + maxDriftMs` re-added per merge), so repeated far-future merges can't walk the clock forward. The LWW same-stamp tie-break also tags `-0` distinctly from `+0` so a `-0`-vs-`+0` tie still converges.
  - **`@mindees/updates` — non-idempotent re-apply** — re-applying the already-current generation fell through and rewrote state, resetting `pendingVerification`/`bootAttempts` and un-confirming a generation that had already passed its readiness handshake. It now short-circuits to a true no-op.
  - **`@mindees/compiler` — marker collision missed destructuring** — the `_static` top-level collision check ignored destructuring bindings (`const { _static } = x`); it now recurses object/array binding patterns so flattening still bails on a real collision.
  - **`@mindees/cli` — overly specific scaffold error** — the unreadable-target message asserted "not a directory" for every `readDir` failure even though it could be a permission/I/O error; the message no longer claims a cause it didn't verify.

- Updated dependencies [43c3d33]
- Updated dependencies [bf948be]
  - @mindees/core@0.1.0
