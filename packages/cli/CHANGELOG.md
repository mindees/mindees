# @mindees/cli

## 0.8.0

### Patch Changes

- @mindees/ai@0.8.0
- @mindees/compiler@0.8.0
- @mindees/core@0.8.0

## 0.7.0

### Patch Changes

- Updated dependencies [aad716b]
  - @mindees/compiler@0.7.0
  - @mindees/ai@0.7.0
  - @mindees/core@0.7.0

## 0.6.0

### Minor Changes

- b14ef4d: The `mindees` CLI now greets you with a friendly **branded banner** — the MindeesNative logo. On
  image-capable terminals (iTerm2 / WezTerm) it prints the actual logo PNG inline; everywhere else it
  shows a clean ANSI wordmark with the tagline + version. Shown on `mindees help` and after
  `mindees create`. Output stays plain + parseable when piped or under `NO_COLOR` (no banner on
  non-TTY stdout).

### Patch Changes

- @mindees/ai@0.6.0
- @mindees/compiler@0.6.0
- @mindees/core@0.6.0

## 0.5.0

### Minor Changes

- 919c7c1: `mindees dev` now runs a real build + watch + **live-reload** dev server. New testable building
  blocks: `createNodeWatcher` (adapts `node:fs.watch` to the `startDev` orchestrator's `Watcher`,
  debounced so one save = one rebuild) and `createDevServer` (a pure request handler that serves the
  app HTML with a live-reload client injected, plus a version endpoint the client polls — `bump()` on
  each rebuild reloads connected browsers). `renderDevPage` produces a build-status preview page. The
  `mindees` binary wires these over `node:http` (port via `MINDEES_DEV_PORT`, default 3000); the
  watcher/server/orchestrator are unit-tested independently of the I/O glue.

### Patch Changes

- Updated dependencies [503be19]
- Updated dependencies [4d1707d]
- Updated dependencies [4591937]
- Updated dependencies [f8318f9]
  - @mindees/core@0.5.0
  - @mindees/ai@0.5.0
  - @mindees/compiler@0.5.0

## 0.4.0

### Patch Changes

- Updated dependencies [25e26a6]
- Updated dependencies [ea9915f]
  - @mindees/compiler@0.4.0
  - @mindees/core@0.4.0
  - @mindees/ai@0.4.0

## 0.3.0

### Patch Changes

- Updated dependencies [25832b1]
- Updated dependencies [2eba52a]
- Updated dependencies [2cbc407]
  - @mindees/compiler@0.3.0
  - @mindees/core@0.3.0
  - @mindees/ai@0.3.0

## 0.2.0

### Patch Changes

- Updated dependencies [852d0ac]
- Updated dependencies [c29f76c]
  - @mindees/compiler@0.2.0
  - @mindees/core@0.2.0
  - @mindees/ai@0.2.0

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

- c03b848: Clean foundation tooling for CLI package builds and package export validation.
- 9885ece: Resolve create targets from simple names, relative paths, and absolute paths;
  sanitize generated package names; make create help exit successfully; and add a
  Windows-safe pnpm fallback to doctor guidance.
- Updated dependencies [c1acd04]
- Updated dependencies [962d912]
- Updated dependencies [43c3d33]
- Updated dependencies [86e5b94]
- Updated dependencies [bf948be]
  - @mindees/ai@0.1.0
  - @mindees/compiler@0.1.0
  - @mindees/core@0.1.0
