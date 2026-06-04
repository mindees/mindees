# @mindees/compiler

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
