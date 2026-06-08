# @mindees/cli

## 0.29.0

### Patch Changes

- @mindees/ai@0.29.0
- @mindees/compiler@0.29.0
- @mindees/core@0.29.0

## 0.28.0

### Patch Changes

- 85ce3e5: Harden the web build + Image after an adversarial review of the shipped web-run-loop (two real defects):

  - **compiler/cli:** the relative-import `.js` rewrite was a regex that **corrupted** valid code — it
    injected `.js` into a concatenated dynamic import (`import('./p/' + name)` → `import('./p/.js' + name)`),
    mangled import-like text inside string literals, and turned a directory/barrel import (`./widgets`) into
    `./widgets.js` (404) instead of `./widgets/index.js`. Replaced with a new **AST-based**
    `rewriteImportSpecifiers` (exported from `@mindees/compiler`): it touches only real import/export and
    single-string-literal dynamic-import specifiers, and the CLI resolves directory imports to `/index.js`
    against the compiled source set.
  - **atlas:** `Image` `fallbackSrc` looped forever — the live `src` is an absolute URL that never equals the
    literal fallback, so it re-swapped and re-fired `onError` on every error event. It now swaps exactly once
    (guarded by a marker). A multiline `TextInput` also no longer emits a stray `type` attribute on the `<textarea>`.

- Updated dependencies [85ce3e5]
  - @mindees/compiler@0.28.0
  - @mindees/ai@0.28.0
  - @mindees/core@0.28.0

## 0.27.2

### Patch Changes

- Updated dependencies [9040462]
  - @mindees/core@0.27.2
  - @mindees/ai@0.27.2
  - @mindees/compiler@0.27.2

## 0.27.1

### Patch Changes

- d30461e: **Fix the scaffold's JSX config + ship a getting-started guide** (roadmap #6).

  - The generated `tsconfig.json` used **classic** JSX (`jsx: "react"` + `jsxFactory`) while the compiler
    type-checks with **automatic** JSX and the docs tell you to write import-free JSX — so the editor and the
    build disagreed on a fresh project. The scaffold now emits `jsx: "react-jsx"` +
    `jsxImportSource: "@mindees/core"`, and the templates no longer import `createElement` (the compiler
    injects it at emit). Editor == compiler == docs.
  - New [`docs/getting-started.md`](../../docs/getting-started.md): zero → running web app, the
    signals/JSX/components model, Atlas theming, and `mindees.config.json`.
  - @mindees/ai@0.27.1
  - @mindees/compiler@0.27.1
  - @mindees/core@0.27.1

## 0.27.0

### Patch Changes

- @mindees/ai@0.27.0
- @mindees/compiler@0.27.0
- @mindees/core@0.27.0

## 0.26.0

### Patch Changes

- d39954d: **Live device hooks on the web target** (roadmap #4). The platform environment signals (`useColorScheme`,
  `useWindowDimensions`, `useSafeAreaInsets`, `useKeyboard`, `useReducedMotion`) previously had no web
  wiring — they kept inert defaults (0×0, light, no insets, keyboard hidden) on the framework's primary
  target, so three advertised RN-parity capabilities silently no-op'd.

  - **atlas:** new `connectWebEnvironment(window?)` subscribes `prefers-color-scheme` (dark mode),
    `prefers-reduced-motion`, `resize` + `devicePixelRatio` (dimensions/scale), `visualViewport` (soft
    keyboard height), and `env(safe-area-inset-*)` (via a hidden probe) — pushing each through
    `setEnvironment` as a fine-grained signal write. SSR-safe (no-op without a DOM); returns a `disconnect()`.
  - **cli:** the `atlas` scaffold template's `main.tsx` now calls `connectWebEnvironment()`, so a freshly
    created app has live dark-mode/safe-area/keyboard hooks with zero config.
  - @mindees/ai@0.26.0
  - @mindees/compiler@0.26.0
  - @mindees/core@0.26.0

## 0.25.0

### Patch Changes

- @mindees/ai@0.25.0
- @mindees/compiler@0.25.0
- @mindees/core@0.25.0

## 0.24.0

### Minor Changes

- cefc953: **Wire perf-lint + performance budgets into `mindees build`/`dev`** — the flagship build-time DX (advice
  neither RN nor Flutter ships) was previously reachable only from compiler unit tests; now it runs on every
  real build, making spec §12's "100% optimized, enforced" true rather than aspirational.

  - **perf-lint** runs by default and emits **warnings** (never blocks), e.g. `MDC_PERF_001`: a bare `.map()`
    in JSX re-mounts every row. Disable with `{ "perf": false }`.
  - **performance budgets** are opt-in via `mindees.config.json` (`{ "budget": { "maxElements": N } }`); a
    per-module violation is an **error** that fails the build (non-zero exit).
  - New `mindees.config.json` loader (tolerant: missing/malformed → defaults, never throws). Supports
    `perf`, `budget`, and `appName` (the emitted index.html title).

### Patch Changes

- @mindees/ai@0.24.0
- @mindees/compiler@0.24.0
- @mindees/core@0.24.0

## 0.23.0

### Minor Changes

- 2e12ad6: **`mindees dev`/`build` now produce and serve a runnable web app** — closing the #1 v1-readiness gap (the
  create → dev → see-my-app loop was broken).

  - `mindees build` emits a runnable `dist/index.html` when an app entry (`src/main.{tsx,ts}`) compiles: a
    native **import-map** resolves the bare `@mindees/*` specifiers to the published packages on the esm.sh
    CDN (no bundler step), and relative imports in the compiled output are rewritten with explicit `.js`
    extensions so they load as native ES modules in the browser. Subpath imports (`@mindees/atlas/list`) are
    mapped too. (`html: false` opts out.)
  - `mindees dev` now serves the built file tree — `index.html` at `/` (live-reload client injected), each
    emitted asset at its path, with extensionless resolution (`/App` → `App.js`). A failed build shows a
    diagnostics overlay at `/` that auto-recovers on the next good build. (Previously it served a static
    build-status page and never the app.)

### Patch Changes

- @mindees/ai@0.23.0
- @mindees/compiler@0.23.0
- @mindees/core@0.23.0

## 0.22.8

### Patch Changes

- 8de302d: Resolve the two v1 doc-contract decisions from the bug-hunt, each with a regression test:

  - **core (gesture):** `swipe()` now derives `direction` from the **release velocity** (the flick intent)
    instead of net displacement, so `direction` always agrees with the sign of `velocityX`/`velocityY`. A
    reversing flick (drag one way, fling back) now reports the way it was flung — previously `direction`
    (net travel) and the reported velocity could disagree. Falls back to displacement only at zero velocity.
  - **cli (scaffold):** documented `--force`'s real contract — it **overlays/merges** the template onto a
    non-empty target (overwriting same-named files, keeping the user's other files); it does not wipe the
    directory (the FileSystem abstraction has no delete primitive). The misleading "overwrite" wording and
    the not-empty error message are corrected.

- Updated dependencies [8de302d]
  - @mindees/core@0.22.8
  - @mindees/ai@0.22.8
  - @mindees/compiler@0.22.8

## 0.22.7

### Patch Changes

- Updated dependencies [3a3bcae]
  - @mindees/core@0.22.7
  - @mindees/ai@0.22.7
  - @mindees/compiler@0.22.7

## 0.22.6

### Patch Changes

- 34605e2: Fix the final five bugs from the third v1 bug-hunt — closing the sweep — each with a regression test:

  - **cli (build):** source maps now resolve to the real `src/` file — `sources` is rewritten relative to
    the output (was a non-existent `dist/*.tsx`), `sourceRoot` cleared, and the `sourceMappingURL` comment
    points at the literal `.map` filename (TS percent-encodes `[ ]`, which didn't match the written file).
  - **cli (build):** two sources whose basenames differ only by extension (`App.ts` + `App.tsx`) now fail
    the build with an `MDC_OUTPUT_COLLISION` error instead of one silently overwriting the other's `dist/App.js`.
  - **cli (dev-server):** the live-reload client embeds the **render-time** build version as its baseline
    (built per-request) — a rebuild that lands within the first poll interval no longer misses the reload.
  - **core (scheduler):** re-scheduling a keyed task with a **different priority** now relocates it to the
    requested lane (latest priority wins), instead of silently keeping its original lane.
  - **core (scheduler):** a recovery task scheduled by `onError` during the runaway-loop guard is no longer
    stranded — the overflow is reported outside the flushing window so the recovery arms a fresh flush.

- Updated dependencies [34605e2]
  - @mindees/core@0.22.6
  - @mindees/ai@0.22.6
  - @mindees/compiler@0.22.6

## 0.22.5

### Patch Changes

- bed575f: Fix eight correctness bugs from the third v1 bug-hunt (untouched surfaces), each with a regression test:

  - **core (deferred):** `deferred()` no longer subscribes its **enclosing** effect/computed to the source
    (it seeded the mirror tracked) — which defeated deferral and leaked an effect per re-run. Seeded untracked.
  - **core (thread-pool):** a late/duplicate `onerror` from an **already-replaced** worker no longer rejects
    the live replacement's jobs or evicts it (added a worker-identity guard).
  - **ai (server SSE):** empty keep-alive events (`data:` with no payload) are skipped instead of crashing
    the stream with `JSON.parse('')`; and a **terminal finish event** is delivered even if the abort signal
    flips on that iteration (servers that omit `[DONE]` no longer drop the final chunk).
  - **ai (mappers):** tool results containing a **bigint / cycle** serialize losslessly to the model instead
    of collapsing to `"[object Object]"`.
  - **renderer (DOM):** a **string** `style` prop is applied via `cssText` (was silently dropped, breaking
    styling + hydration parity).
  - **renderer (SSR):** the CSS serializer now runs only for the `style` attribute — a non-style object prop
    (e.g. `data-config={{…}}`) serializes like the DOM backend, restoring SSR/DOM hydration parity.
  - **cli (build):** a `.jsx`/`.js` route is no longer added to the manifest when the build doesn't compile
    it — no more dangling route chunk in a green build.

- Updated dependencies [bed575f]
  - @mindees/core@0.22.5
  - @mindees/ai@0.22.5
  - @mindees/compiler@0.22.5

## 0.22.4

### Patch Changes

- Updated dependencies [6782bee]
  - @mindees/compiler@0.22.4
  - @mindees/core@0.22.4
  - @mindees/ai@0.22.4

## 0.22.3

### Patch Changes

- Updated dependencies [7a7d7b7]
  - @mindees/compiler@0.22.3
  - @mindees/core@0.22.3
  - @mindees/ai@0.22.3

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
  - @mindees/compiler@0.22.2
  - @mindees/core@0.22.2
  - @mindees/ai@0.22.2

## 0.22.1

### Patch Changes

- Updated dependencies [57a45ee]
  - @mindees/core@0.22.1
  - @mindees/ai@0.22.1
  - @mindees/compiler@0.22.1

## 0.22.0

### Patch Changes

- @mindees/ai@0.22.0
- @mindees/compiler@0.22.0
- @mindees/core@0.22.0

## 0.21.0

### Minor Changes

- 8f37cf4: The `android` template now derives a unique Android `applicationId` (`com.example.<app>`) and Gradle
  `rootProject.name` from the app name, so two scaffolded MindeesNative Android apps install side-by-side
  on a device (the compile `namespace` stays `dev.mindees.example` — Android keys install identity on
  `applicationId`). Closes the documented namespace limitation.

### Patch Changes

- e6d3fd0: The `mindees create` / `create-mindees` next-steps hint is now template-aware: the `android` template
  prints its real two-phase native build flow (build the app-js bundle, then `gradle assembleDebug`)
  instead of the web-only `pnpm install && mindees dev`.
- 63a15d9: Regenerate the `android` template's vendored module so its scaffolded `app-js` pins `@mindees/*` to the
  current release, and run `gen:android-template` as part of `version-packages` so the pin tracks every
  future version bump automatically (the drift guard was catching the post-0.20.0 lag).
  - @mindees/ai@0.21.0
  - @mindees/compiler@0.21.0
  - @mindees/core@0.21.0

## 0.20.0

### Minor Changes

- c475625: Add an experimental **`android`** create template: `create-mindees myapp --template android` (or
  `mindees create`) scaffolds a **standalone, buildable native Android app** — TSX UI (Atlas + the
  Quantum router) running on a real Android view tree via an embedded **QuickJS** runtime, with the
  native host **vendored as Kotlin source** (no Maven dependency on MindeesNative).

  The template is codegen'd from the CI-verified reference host (`scripts/gen-android-template.mjs`,
  `git ls-files` oracle) so it can't drift, with a `check:android-template` guard. The scaffolded
  `app-js` resolves `@mindees/*` from npm (synthesized `package.json` + alias-free `tsdown`). A new
  `android-template.yml` CI job proves it end-to-end: scaffold → build the bundle from the public npm
  registry → `gradle assembleDebug` → assert the APK contains the bundle.

### Patch Changes

- @mindees/ai@0.20.0
- @mindees/compiler@0.20.0
- @mindees/core@0.20.0

## 0.19.0

### Patch Changes

- Updated dependencies [e8622ed]
  - @mindees/core@0.19.0
  - @mindees/ai@0.19.0
  - @mindees/compiler@0.19.0

## 0.18.0

### Patch Changes

- Updated dependencies [e229090]
  - @mindees/compiler@0.18.0
  - @mindees/ai@0.18.0
  - @mindees/core@0.18.0

## 0.17.0

### Patch Changes

- @mindees/ai@0.17.0
- @mindees/compiler@0.17.0
- @mindees/core@0.17.0

## 0.16.0

### Patch Changes

- @mindees/ai@0.16.0
- @mindees/compiler@0.16.0
- @mindees/core@0.16.0

## 0.15.0

### Patch Changes

- Updated dependencies [3faea71]
  - @mindees/ai@0.15.0
  - @mindees/compiler@0.15.0
  - @mindees/core@0.15.0

## 0.14.0

### Patch Changes

- Updated dependencies [c3f95ee]
  - @mindees/ai@0.14.0
  - @mindees/compiler@0.14.0
  - @mindees/core@0.14.0

## 0.13.0

### Patch Changes

- @mindees/ai@0.13.0
- @mindees/compiler@0.13.0
- @mindees/core@0.13.0

## 0.12.0

### Patch Changes

- @mindees/ai@0.12.0
- @mindees/compiler@0.12.0
- @mindees/core@0.12.0

## 0.11.0

### Patch Changes

- @mindees/ai@0.11.0
- @mindees/compiler@0.11.0
- @mindees/core@0.11.0

## 0.10.0

### Minor Changes

- 009face: Add an **`app`** starter template (`mindees create my-app --template app`) — a polished, batteries-on
  starting point using the Atlas UI kit (`Card`/`Button`/`Switch`/`Text`), a standard hook (`useToggle`),
  and a real screen, so an ordinary developer has something working and good-looking in seconds.

### Patch Changes

- Updated dependencies [2cbad54]
  - @mindees/compiler@0.10.0
  - @mindees/ai@0.10.0
  - @mindees/core@0.10.0

## 0.9.0

### Patch Changes

- Updated dependencies [19b7b50]
  - @mindees/compiler@0.9.0
  - @mindees/ai@0.9.0
  - @mindees/core@0.9.0

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
