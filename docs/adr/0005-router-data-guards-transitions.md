# ADR-0005: Router II (part B) — loaders/data, navigation guards, view transitions

- **Status:** Accepted
- **Date:** 2026-06-02

## Context

Phase 7 part A (ADR-0004) shipped render integration. This completes the
originally-scoped Phase 7 with the three remaining capabilities: **data loaders**
(with SWR + prefetch), **navigation guards** (cancel/redirect + idempotent
navigation), and **web view transitions**. Grounded in current prior art (Solid
Router `0.16` `preload`→`props.data` + `useBeforeLeave`→`startViewTransition`;
TanStack `1.170` `loader`/`loaderDeps`/`staleTime`/`router.invalidate`).

The router stays signals-native and renderer-agnostic; the renderer remains a
test-only devDependency.

## Decision

### 1. Loaders + data (SWR + prefetch)

A route may declare `loader(ctx)`, `loaderDeps({ search })`, and `staleTime`.
`LoaderContext = { params, search, location, signal }` — `signal` is an
`AbortSignal` aborted when the load is superseded (navigated away, or re-keyed).

A `createLoaderManager` owns a cache keyed by **route identity** (`WeakMap<RouteRecord, …>`
so unused routes' data is GC'd) then by a serialized **(params + loaderDeps)**
inner key. Semantics (stale-while-revalidate):

- **fresh** (`now − loadedAt < staleTime`, `success`): return cached, no reload;
- **stale / missing / error**: abort any in-flight load for that key, start a new
  one (keeping prior `data` visible for SWR), and on settle record
  `success`/`error` + `loadedAt`.

Reactivity is **coarse but correct**: a single `dataVersion` signal is bumped on
any cache change; reactive reads (`router.loaderData(match)`) subscribe to it, so
a component's data binding updates when its load resolves — without re-mounting
the component (the depth-region freeze class of bug from ADR-0004 is avoided
because the loader effect is owned by the router root, not a re-running region,
and it never reads the signal it writes). Per-key fine-grained signals are a
documented later optimization.

Loaders run for **every route in the matched chain** (each component gets *its*
route's data via `RouteComponentProps.data()`). Orchestration is one effect
(owned by the router root) that, on each `matches` change, ensures the chain's
loads and **aborts in-flight loads for routes no longer matched**.

Exposed: `router.loaderData(match)`, `router.invalidate()` (mark all stale +
reload the current chain), `router.preload(href)` (run a target's loaders without
navigating — the building block for hover/intent prefetch; the DOM event wiring
on `Link` is a thin opt-in).

### 2. Navigation guards (cancel / redirect) + idempotent navigation

`createRouter({ beforeNavigate })` registers a guard
`(to, from) => boolean | string | void` run before each navigation:

- return `false` → **cancel** the navigation;
- return a **string** → **redirect** to it (resolved like any `navigate` target,
  guard re-applied, with a small redirect-depth cap to prevent loops);
- return `void`/`true` → proceed.

**Idempotent navigation:** navigating to a href equal to the current location is a
no-op (no duplicate history entry, no state churn) unless `force` is set.

### 3. Web view transitions

`navigate(to, { viewTransition })` (and a `createRouter({ viewTransitions })`
default) wraps the location update in `document.startViewTransition(...)` **when
available**, so the synchronous signals re-render happens inside the transition
(the Solid pattern — synchronous updates make this clean). Feature-detected and
**web/DOM-only**: outside a DOM (SSR, native, tests) it is a transparent no-op.
A cross-platform (shared-element) equivalent is a research track (no stable RN
primitive yet).

## Consequences

- `RouteComponentProps` gains `data: () => LoaderData` (`{ status, data?, error? }`).
- `@mindees/router` still depends only on `@mindees/core`; view transitions touch
  `document` behind a feature check, so the core stays SSR/native-safe.
- Still deferred to a later phase (not exported): the **global typed route
  registry** and **file-based route scanning + bundler plugin** (both large),
  per-key fine-grained loader signals, and native shared-element transitions.
- Maturity stays `experimental`.
