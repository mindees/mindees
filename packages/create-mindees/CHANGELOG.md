# create-mindees

## 0.2.0

### Patch Changes

- Updated dependencies [c29f76c]
  - @mindees/core@0.2.0
  - @mindees/cli@0.2.0

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

- c03b848: Clean foundation tooling for CLI package builds and package export validation.
- 9885ece: Resolve create targets from simple names, relative paths, and absolute paths;
  sanitize generated package names; make create help exit successfully; and add a
  Windows-safe pnpm fallback to doctor guidance.
- Updated dependencies [962d912]
- Updated dependencies [43c3d33]
- Updated dependencies [86e5b94]
- Updated dependencies [c03b848]
- Updated dependencies [bf948be]
- Updated dependencies [9885ece]
  - @mindees/cli@0.1.0
  - @mindees/core@0.1.0
