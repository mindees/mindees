# @mindees/router

## 0.35.0

### Minor Changes

- d722850: **Shared `MindeesError` base** (1.0 error-convention consistency, from the freeze audit). `@mindees/core`
  now exports `MindeesError extends Error` (a stable `name` + machine-readable `code`), and every package error
  extends it — `AiError`, `RouterError`, `DataError`, `UpdateError`, `SduiError`, `NativeHostError`, and
  `NotImplementedError`. So a consumer can `catch (e) { if (e instanceof MindeesError) … }` across the whole
  family and branch on `e.code` instead of string-matching messages. Subclasses keep their precise `code`
  union (via `declare readonly code`), and `instanceof <SpecificError>` still works.

  Also from the audit: `NativeHostError` now carries a `NativeHostErrorCode`; `useRouter()` throws a typed
  `RouterError('NO_ACTIVE_ROUTER')` instead of a bare `Error`; `SduiErrorCode` drops its redundant `SDUI_`
  prefix to match the bare-code convention of its peers.

### Patch Changes

- Updated dependencies [d722850]
  - @mindees/core@0.35.0

## 0.34.2

### Patch Changes

- @mindees/core@0.34.2

## 0.34.1

### Patch Changes

- Updated dependencies [e45fcc2]
  - @mindees/core@0.34.1

## 0.34.0

### Patch Changes

- @mindees/core@0.34.0

## 0.33.0

### Patch Changes

- Updated dependencies [10523ac]
  - @mindees/core@0.33.0

## 0.32.0

### Patch Changes

- @mindees/core@0.32.0

## 0.31.1

### Patch Changes

- @mindees/core@0.31.1

## 0.31.0

### Patch Changes

- @mindees/core@0.31.0

## 0.30.4

### Patch Changes

- @mindees/core@0.30.4

## 0.30.3

### Patch Changes

- @mindees/core@0.30.3

## 0.30.2

### Patch Changes

- @mindees/core@0.30.2

## 0.30.1

### Patch Changes

- @mindees/core@0.30.1

## 0.30.0

### Patch Changes

- @mindees/core@0.30.0

## 0.29.0

### Patch Changes

- @mindees/core@0.29.0

## 0.28.0

### Patch Changes

- @mindees/core@0.28.0

## 0.27.2

### Patch Changes

- Updated dependencies [9040462]
  - @mindees/core@0.27.2

## 0.27.1

### Patch Changes

- @mindees/core@0.27.1

## 0.27.0

### Patch Changes

- @mindees/core@0.27.0

## 0.26.0

### Patch Changes

- @mindees/core@0.26.0

## 0.25.0

### Patch Changes

- 1136c25: Resolve API-consistency contradictions ahead of a 1.0 freeze (roadmap #3):

  - **atlas:** removed the orphaned `@mindees/atlas/theme` subpath (`createTheme`/`ThemeContext`/`ThemeTokens`).
    **No built-in component ever read it** — every component themes via `useTheme`/`tokens` (the main entry),
    which stays the single, working theming system (reactive, dark-mode aware). Shipping two incompatible
    theming APIs into 1.0 would have been a trap; this leaves exactly one. **Breaking:** import `useTheme`/
    `tokens` from `@mindees/atlas` instead of `createTheme` from `@mindees/atlas/theme`.
  - **router:** `info` is now `Object.freeze`d, matching the frozen package-identity invariant every other
    `@mindees/*` already upholds.
  - @mindees/core@0.25.0

## 0.24.0

### Patch Changes

- @mindees/core@0.24.0

## 0.23.0

### Patch Changes

- @mindees/core@0.23.0

## 0.22.8

### Patch Changes

- Updated dependencies [8de302d]
  - @mindees/core@0.22.8

## 0.22.7

### Patch Changes

- Updated dependencies [3a3bcae]
  - @mindees/core@0.22.7

## 0.22.6

### Patch Changes

- Updated dependencies [34605e2]
  - @mindees/core@0.22.6

## 0.22.5

### Patch Changes

- Updated dependencies [bed575f]
  - @mindees/core@0.22.5

## 0.22.4

### Patch Changes

- Updated dependencies [6782bee]
  - @mindees/core@0.22.4

## 0.22.3

### Patch Changes

- 7a7d7b7: Fix four more correctness bugs from the v1 bug-hunt (the deferred batch), each with a regression test:

  - **router (loaders):** a route that declares a `searchSchema` no longer runs its **loader on raw,
    unvalidated search** when validation fails — it surfaces a `VALIDATE_SEARCH` error instead (the
    `LoaderContext.search` "validated" contract is now honored; loaders never see attacker-controlled raw strings).
  - **router (file routes):** duplicate effective route paths (e.g. `users.tsx` + `users/index.tsx`, or two
    `(group)` indexes) now emit a **dev warning** instead of one route being silently unreachable.
  - **compiler (perf-lint):** a **trailing** `// mdc-perf-ignore` no longer bleeds onto the next line's
    finding — the line-above lookback is honored only for a standalone ignore comment.
  - **core (gesture):** the pan recognizer now **resets** translation/velocity/position state on the final
    pointer-up (it was stuck at the last drag offset), consistent with tap/long-press.

- Updated dependencies [7a7d7b7]
  - @mindees/core@0.22.3

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

### Patch Changes

- @mindees/core@0.10.0

## 0.9.0

### Patch Changes

- @mindees/core@0.9.0

## 0.8.0

### Patch Changes

- @mindees/core@0.8.0

## 0.7.0

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

- Updated dependencies [ea9915f]
  - @mindees/core@0.4.0

## 0.3.0

### Minor Changes

- 020fba0: `<Link>` now **auto-prefetches** its target's loaders, warming the SWR cache so the destination
  renders instantly — the Quantum differentiator vs Expo Router's manual-only `router.prefetch`.
  Policy via `prefetch`: `'intent'` (default — on hover, press-in, or keyboard focus), `'render'`
  (on mount), or `false`. Deduped per link, and a no-op for routes with no loader.

### Patch Changes

- 25832b1: Fix three router lifecycle/isolation bugs:

  - **`dispose()` now clears the active-router registry.** A disposed router no longer leaks
    through `useRouter()`/`useParams()`/`<Link>` (identity-guarded so disposing an old router
    can't clobber a newer active one).
  - **`params()`/`search()`/`usePathname()` are re-render isolated.** They're memoized with
    shallow equality (pathname via `select`), so navigating between locations with the same
    params/search no longer re-runs subscribers — the headline selector-isolation guarantee.
  - **An invalid synthesized route pattern no longer poisons all router state.** A structurally
    invalid route (e.g. a catch-all parent with children → `/x/:rest*/y`) is dropped with a dev
    warning at compile time instead of throwing out of the state memo on every access.

- Updated dependencies [2eba52a]
  - @mindees/core@0.3.0

## 0.2.0

### Minor Changes

- cbc36f8: Quantum router: file-based routing + ergonomic hooks (Expo-router-level DX, on a better core).

  - **`createFileRouter(modules, options?)`** + **`routesFromModules(modules)`** — build a router
    from a file/module map using the same conventions Expo Router uses: `index` → `/`,
    `[param]` → `:param`, `[...rest]` → catch-all, `(group)` → URL-less grouping, `_layout` →
    a layout route that wraps a directory's routes, `+not-found` → a fallback. The map comes
    from a bundler glob (`import.meta.glob('./app/**', { eager: true })`) or a generated table,
    so you never hand-write a route config.
  - **Hooks + bound `Link`** — `useRouter()`, `useParams()`, `useSearch()`, `usePathname()`,
    and a typed **`<Link to="…">`** that resolve the active router (no prop-drilling), mirroring
    Expo's `useRouter`/`useLocalSearchParams`/`<Link>`. `createRouter` now registers itself as
    the active router.

  Unlike Expo Router these sit on Quantum's stronger core: params are schema-**validated and
  coerced** (not raw strings), reads are **fine-grained** via accessors/`select` (no whole-stack
  re-renders), and typing is **inferred from the route table with no brittle CLI codegen**.

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

- c9a051e: Audit hardening for `@mindees/router` (Quantum). Six defects found by an adversarial review and confirmed with regression tests:

  - **Query prototype pollution (high)** — `parseQuery` used a `{}` accumulator, so a query key like `?constructor=x` resolved a built-in on the existence probe (leaking a function into a bogus array) and `?__proto__=a&__proto__=b` mutated the result's prototype. The accumulator is now `Object.create(null)`, so every key — including `constructor`/`__proto__`/`toString` — is an ordinary own data property.
  - **Unbounded loader cache (high)** — the SWR cache grew without limit for high-cardinality dynamic routes (`/posts/:id` visited many times) and `dispose()` never released it. The per-route cache is now bounded (LRU eviction of the oldest non-pending entries) and `dispose()` drops the cache.
  - **Async `searchSchema` wedged the router (medium)** — an async (or throwing) search schema threw `ASYNC_SCHEMA` out of matching, escaping the match memo and making every router-state accessor throw with no recovery. Matching now contains it and degrades to raw search + `match.issues`, exactly like the invalid-input path.
  - **View-transition hazards (medium)** — the `startViewTransition` wrapper didn't handle a synchronous throw (could drop a navigation and escape `navigate()`) or a rejected `ready` promise (unhandled rejection on rapid/aborted transitions). It now falls back to a plain commit on a sync throw (no double-commit) and marks the transition's promises handled.
  - **`invalidate()` no-op while loading (medium)** — invalidating while a load was in flight neither cancelled it nor refetched, serving the pre-invalidation result. It now aborts the in-flight load so a fresh one runs.
  - **Aborted preload left a stuck `pending` entry (low)** — an aborted preload discarded its result and left a permanent `pending` cache entry despite the documented "warms the cache" contract. An aborted load now still warms the cache (without notifying the navigated-away route) and never leaves a stuck `pending` entry.

- Updated dependencies [43c3d33]
- Updated dependencies [bf948be]
  - @mindees/core@0.1.0
