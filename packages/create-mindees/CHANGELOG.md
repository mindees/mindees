# create-mindees

## 0.37.0

### Patch Changes

- Updated dependencies [a457873]
  - @mindees/core@0.37.0
  - @mindees/cli@0.37.0

## 0.36.0

### Patch Changes

- @mindees/cli@0.36.0
- @mindees/core@0.36.0

## 0.35.0

### Patch Changes

- Updated dependencies [d722850]
  - @mindees/core@0.35.0
  - @mindees/cli@0.35.0

## 0.34.2

### Patch Changes

- 75ce7dc: 1.0 API-freeze prep (from the freeze-readiness audit) — stop exposing internals and name the unnameable:

  - **Dropped leaked internals** from public entry points (they would otherwise freeze under semver):
    `@mindees/compiler` `createFlattenTransformer`/`STATIC_MARKER` (optimizer plumbing; use `compile`),
    `@mindees/renderer` `isEventProp` (reconciler detail), and `create-mindees`'s re-export of
    `naturalLanguageToTemplate` (a CLI internal).
  - **Exported previously-unnameable public types**: `@mindees/cli` `DevServerResponse` + the
    `mindees.config.json` surface (`MindeesConfig`/`loadConfig`/`CONFIG_FILE`); `@mindees/renderer`
    `SerializeOptions` + `HeadlessBackendOptions`; `@mindees/data` `RecordState` + `AbortLike`.

- Updated dependencies [75ce7dc]
  - @mindees/cli@0.34.2
  - @mindees/core@0.34.2

## 0.34.1

### Patch Changes

- Updated dependencies [e45fcc2]
  - @mindees/core@0.34.1
  - @mindees/cli@0.34.1

## 0.34.0

### Patch Changes

- @mindees/cli@0.34.0
- @mindees/core@0.34.0

## 0.33.0

### Patch Changes

- Updated dependencies [10523ac]
  - @mindees/core@0.33.0
  - @mindees/cli@0.33.0

## 0.32.0

### Patch Changes

- Updated dependencies [0a776f7]
  - @mindees/cli@0.32.0
  - @mindees/core@0.32.0

## 0.31.1

### Patch Changes

- @mindees/cli@0.31.1
- @mindees/core@0.31.1

## 0.31.0

### Patch Changes

- Updated dependencies [2dff962]
  - @mindees/cli@0.31.0
  - @mindees/core@0.31.0

## 0.30.4

### Patch Changes

- @mindees/cli@0.30.4
- @mindees/core@0.30.4

## 0.30.3

### Patch Changes

- Updated dependencies [d0ccfdb]
  - @mindees/cli@0.30.3
  - @mindees/core@0.30.3

## 0.30.2

### Patch Changes

- @mindees/cli@0.30.2
- @mindees/core@0.30.2

## 0.30.1

### Patch Changes

- @mindees/cli@0.30.1
- @mindees/core@0.30.1

## 0.30.0

### Patch Changes

- @mindees/cli@0.30.0
- @mindees/core@0.30.0

## 0.29.0

### Patch Changes

- @mindees/cli@0.29.0
- @mindees/core@0.29.0

## 0.28.0

### Patch Changes

- Updated dependencies [85ce3e5]
  - @mindees/cli@0.28.0
  - @mindees/core@0.28.0

## 0.27.2

### Patch Changes

- Updated dependencies [9040462]
  - @mindees/core@0.27.2
  - @mindees/cli@0.27.2

## 0.27.1

### Patch Changes

- Updated dependencies [d30461e]
  - @mindees/cli@0.27.1
  - @mindees/core@0.27.1

## 0.27.0

### Patch Changes

- @mindees/cli@0.27.0
- @mindees/core@0.27.0

## 0.26.0

### Patch Changes

- Updated dependencies [d39954d]
  - @mindees/cli@0.26.0
  - @mindees/core@0.26.0

## 0.25.0

### Patch Changes

- @mindees/cli@0.25.0
- @mindees/core@0.25.0

## 0.24.0

### Patch Changes

- Updated dependencies [cefc953]
  - @mindees/cli@0.24.0
  - @mindees/core@0.24.0

## 0.23.0

### Patch Changes

- Updated dependencies [2e12ad6]
  - @mindees/cli@0.23.0
  - @mindees/core@0.23.0

## 0.22.8

### Patch Changes

- Updated dependencies [8de302d]
  - @mindees/core@0.22.8
  - @mindees/cli@0.22.8

## 0.22.7

### Patch Changes

- Updated dependencies [3a3bcae]
  - @mindees/core@0.22.7
  - @mindees/cli@0.22.7

## 0.22.6

### Patch Changes

- Updated dependencies [34605e2]
  - @mindees/cli@0.22.6
  - @mindees/core@0.22.6

## 0.22.5

### Patch Changes

- Updated dependencies [bed575f]
  - @mindees/core@0.22.5
  - @mindees/cli@0.22.5

## 0.22.4

### Patch Changes

- Updated dependencies [6782bee]
  - @mindees/core@0.22.4
  - @mindees/cli@0.22.4

## 0.22.3

### Patch Changes

- Updated dependencies [7a7d7b7]
  - @mindees/core@0.22.3
  - @mindees/cli@0.22.3

## 0.22.2

### Patch Changes

- Updated dependencies [9282b43]
  - @mindees/cli@0.22.2
  - @mindees/core@0.22.2

## 0.22.1

### Patch Changes

- Updated dependencies [57a45ee]
  - @mindees/core@0.22.1
  - @mindees/cli@0.22.1

## 0.22.0

### Patch Changes

- @mindees/cli@0.22.0
- @mindees/core@0.22.0

## 0.21.0

### Patch Changes

- Updated dependencies [e6d3fd0]
- Updated dependencies [8f37cf4]
- Updated dependencies [63a15d9]
  - @mindees/cli@0.21.0
  - @mindees/core@0.21.0

## 0.20.0

### Patch Changes

- c475625: Add an experimental **`android`** create template: `create-mindees myapp --template android` (or
  `mindees create`) scaffolds a **standalone, buildable native Android app** — TSX UI (Atlas + the
  Quantum router) running on a real Android view tree via an embedded **QuickJS** runtime, with the
  native host **vendored as Kotlin source** (no Maven dependency on MindeesNative).

  The template is codegen'd from the CI-verified reference host (`scripts/gen-android-template.mjs`,
  `git ls-files` oracle) so it can't drift, with a `check:android-template` guard. The scaffolded
  `app-js` resolves `@mindees/*` from npm (synthesized `package.json` + alias-free `tsdown`). A new
  `android-template.yml` CI job proves it end-to-end: scaffold → build the bundle from the public npm
  registry → `gradle assembleDebug` → assert the APK contains the bundle.

- Updated dependencies [c475625]
  - @mindees/cli@0.20.0
  - @mindees/core@0.20.0

## 0.19.0

### Patch Changes

- Updated dependencies [e8622ed]
  - @mindees/core@0.19.0
  - @mindees/cli@0.19.0

## 0.18.0

### Patch Changes

- @mindees/cli@0.18.0
- @mindees/core@0.18.0

## 0.17.0

### Patch Changes

- @mindees/cli@0.17.0
- @mindees/core@0.17.0

## 0.16.0

### Patch Changes

- @mindees/cli@0.16.0
- @mindees/core@0.16.0

## 0.15.0

### Patch Changes

- @mindees/cli@0.15.0
- @mindees/core@0.15.0

## 0.14.0

### Patch Changes

- @mindees/cli@0.14.0
- @mindees/core@0.14.0

## 0.13.0

### Patch Changes

- @mindees/cli@0.13.0
- @mindees/core@0.13.0

## 0.12.0

### Patch Changes

- @mindees/cli@0.12.0
- @mindees/core@0.12.0

## 0.11.0

### Patch Changes

- @mindees/cli@0.11.0
- @mindees/core@0.11.0

## 0.10.0

### Minor Changes

- 009face: Add an **`app`** starter template (`mindees create my-app --template app`) — a polished, batteries-on
  starting point using the Atlas UI kit (`Card`/`Button`/`Switch`/`Text`), a standard hook (`useToggle`),
  and a real screen, so an ordinary developer has something working and good-looking in seconds.

### Patch Changes

- Updated dependencies [009face]
  - @mindees/cli@0.10.0
  - @mindees/core@0.10.0

## 0.9.0

### Patch Changes

- @mindees/cli@0.9.0
- @mindees/core@0.9.0

## 0.8.0

### Patch Changes

- @mindees/cli@0.8.0
- @mindees/core@0.8.0

## 0.7.0

### Patch Changes

- @mindees/cli@0.7.0
- @mindees/core@0.7.0

## 0.6.0

### Patch Changes

- Updated dependencies [b14ef4d]
  - @mindees/cli@0.6.0
  - @mindees/core@0.6.0

## 0.5.0

### Patch Changes

- Updated dependencies [919c7c1]
- Updated dependencies [503be19]
- Updated dependencies [4d1707d]
- Updated dependencies [4591937]
- Updated dependencies [f8318f9]
  - @mindees/cli@0.5.0
  - @mindees/core@0.5.0

## 0.4.0

### Patch Changes

- Updated dependencies [ea9915f]
  - @mindees/core@0.4.0
  - @mindees/cli@0.4.0

## 0.3.0

### Patch Changes

- Updated dependencies [2eba52a]
  - @mindees/core@0.3.0
  - @mindees/cli@0.3.0

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
