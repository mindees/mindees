# ADR-0003: Router architecture — type-level inference, Standard Schema, signals-native state

- **Status:** Accepted
- **Date:** 2026-06-02

## Context

Phase 6 builds **Quantum**, the `@mindees/router` typed router. The framework
spec's non-negotiables include "routing 10× better than Expo Router v6": fully
typed navigation, typed **and** runtime-validated params (path + search),
re-render isolation, and dynamic navigator reconfiguration without state reset.

We surveyed the current (June 2026) typed-router landscape, verifying versions
against the npm registry:

| Router | Version | Typed params | Typed **search** params | Type mechanism | Reactivity |
| --- | --- | --- | --- | --- | --- |
| **TanStack Router** | 1.170.10 | ✅ | ✅ (Standard Schema) | codegen route tree (`routeTree.gen.ts`) | signal graph (migrated Mar 2026) |
| **Expo Router** ("v6" = 6.0.24; current 56.2.8) | beta typed routes | ⚠️ typed **optional even when required** (#28813) | ❌ not typed | codegen (`.expo/types`, needs dev server) | React; global/local re-render footgun |
| **React Router** | 7.16.0 | ✅ (framework mode) | ❌ raw `URLSearchParams` | codegen (`.react-router/types` + `rootDirs`) | React |

Validation landscape: **Standard Schema** (`@standard-schema/spec` 1.1.0) is a
~60-line, **zero-runtime**, types-only interface co-designed by the authors of
Zod, Valibot, and ArkType. A consumer accepts *any* compliant validator via the
`~standard` property — Zod ≥ 3.24 (all of 4.x), Valibot ≥ 1, ArkType ≥ 2, and
20+ others — with no per-library adapters and no hard dependency.

## Decision

Build Quantum **Router I** (Phase 6) as a renderer-agnostic, signals-native
typed routing **core**, on three architectural choices:

### 1. Type-level inference over codegen

Path params are inferred from the route **pattern string** using
template-literal types (`PathParams<'/posts/:postId'>` → `{ postId: string }`),
so typed params and typed navigation need **no codegen step, no generated type
file, and no running dev server**. This directly removes the three failure modes
the incumbents share: stale/broken generated types, a build/dev-server
dependency for type safety, and (Expo) required params mistyped as optional.

> A build-time route-tree/manifest generator already exists in `@mindees/compiler`
> (`buildRouteManifest`); wiring it as an *optional* accelerator for very large
> route tables (the TanStack lesson) is future work — it is not required for
> correctness, because the types are derived purely.

### 2. Standard Schema as the validation contract

Quantum validates **search params** (and, where used, path params) through the
Standard Schema interface. We **vendor** the ~60 lines of `StandardSchemaV1`
types into the package (the spec FAQ explicitly blesses copy/paste; the project
guarantees no breaking change without a major bump) so Quantum takes **zero
runtime dependency** while accepting Zod, Valibot, ArkType, et al. directly.
This is the "batteries included, dependencies excluded" doctrine and gives
Quantum the typed-search-params capability Expo and React Router lack.

Policy decisions (the things RR/TanStack left implicit):

- **Failure is discriminated on `result.issues`** (truthiness), never on
  `result.value` — a schema may legitimately yield `value: undefined`.
- **Sync only at navigation time.** `validate()` may return a `Promise`; Quantum
  rejects async schemas during navigation parsing with a clear `RouterError`,
  because URL → state resolution must be synchronous.
- **Repeated query keys → `string[]`**; single keys → `string`. Coercion
  (string → number/boolean/date) is delegated to the schema (e.g.
  `z.coerce.number()`), keeping Quantum's core free of guesswork.

### 3. Signals-native router state + selector re-render isolation

Router state (pathname, params, search, matched route) is modeled **as the
fine-grained signal graph from day one**, built on `@mindees/core`'s Phase 1
signals, with `router.select(...)` applying the **same selector-isolation
technique** as Phase 2's `createProvider` (a `computed` memo over an
`equals:false` source). TanStack just *migrated*
a monolith `router.state` to a per-concern signal graph and measured real wins;
Quantum starts there. Consumers read a slice via `router.select(s => s.params.id)`
and re-run **only** when that slice changes — eliminating Expo's
`useGlobalSearchParams` "every screen re-renders on any URL change" footgun with
no hook-choice trap.

**Dynamic reconfiguration without state reset:** `router.setRoutes(next)` rebuilds
the matcher and re-matches the current location **in place** — the location
signals are not torn down, so a live navigator can be reconfigured without losing
where the user is.

### Scope split (quality over size)

Phase 6 = **Router I**: pattern matching + typed params, Standard-Schema search
validation, history (memory + browser), the signals-native router with typed +
relative navigation, and selector-isolated route context — all type-checked,
tested, and built. The following are **Router II** (a later phase) and are
deliberately **not exported** now (per the doctrine: no teasing future API
names): `Link`/`Outlet`/route-view components (need renderer integration),
file-system route scanning + a bundler/Metro plugin, nested layout composition,
and loaders/data + preloading.

## Consequences

- `@mindees/router` depends only on `@mindees/core` (no renderer dependency in
  Router I; the core is rendering-agnostic). `happy-dom`, `zod`, and `valibot`
  are **devDependencies** only — Zod and Valibot exist purely to *prove*
  validator-agnosticism in tests, not as runtime deps.
- The Standard Schema **v1 validation interface** is vendored
  (`src/standard-schema.ts`) with MIT attribution; `validate` is typed
  single-argument (the subset Quantum uses — a 1.1.0 validator's optional second
  argument stays assignable). No `@standard-schema/spec` dependency edge.
- The package's tsconfig adds the `dom` lib for the browser-history adapter,
  mirroring `@mindees/renderer`; the memory-history core remains DOM-free and is
  the primary tested path.
- Quantum maturity: `scaffold` → `experimental` (Router I implemented & tested;
  Router II is a documented research/roadmap track in `STATUS.md`).
