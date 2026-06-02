# ADR-0004: Router II — nested render integration via explicit composition

- **Status:** Accepted
- **Date:** 2026-06-02

## Context

Phase 6 (ADR-0003) shipped Quantum **Router I**: the typed routing *core* —
pattern matching + typed params, Standard-Schema search validation, a
signals-native router, and history. It deliberately did **not** render anything.

Phase 7 (**Router II**) makes routes actually render: nested layouts, a way to
place child routes, and links. We surveyed current prior art (June 2026):
Solid Router `0.16.1` (signals-native — the closest analogue), TanStack Router
`1.170.10`, React Router `7.16`.

Two findings shaped the design:

1. **Explicit composition beats ambient context for outlets.** Solid Router
   *removed* the standalone `<Outlet/>` in v0.10 — a layout now renders
   `props.children`, and the parent's route context injects the rendered child
   via a lazy `get children()`. The router computes the full **match chain**
   (root→leaf) as one memo and renders it top-down. Ambient context
   (React/Solid `useContext`, TanStack `createRootRouteWithContext`) is used only
   for *path resolution* of relative links/active matching — not to decide which
   child an outlet renders.

2. **MindeesNative core has no ambient owner-scoped context.** `Owner`
   (`@mindees/core`) has no parent pointer or context slot, so a SolidJS/React-
   style ambient `<Outlet/>` that "discovers" its depth is not available without
   a core change. That change (a parent pointer + context map on `Owner`) is a
   reactivity-core concern, out of scope for a router phase.

## Decision

Build Router II render integration on **explicit composition**, mapping the match
chain onto the renderer's existing primitives — **no core changes, no renderer
runtime dependency** (the router still depends only on `@mindees/core`; the
renderer is a test-only devDependency).

### 1. Nested route tree + match chain

`RouteRecord` gains `children`. A child's `path` is **relative to its parent**
(`{ path: '/dash', children: [{ path: 'settings' }] }` → `/dash/settings`); a
child with `path: ''`/`'/'` is the parent's **index**. `flattenRouteTree`
expands the tree into leaf full-paths, each carrying its ancestor **chain**;
matching reuses Router I's `matchPattern` + specificity over the full-paths. The
router exposes `matches: RouteMatch[]` (root→leaf); `match` stays the leaf
(backward-compatible — a flat Router I table is just depth-1 chains).

### 2. Outlet = the parent's `children` (Solid's model)

`createRouterView(router)` returns a node that renders the chain top-down. Each
matched route component receives `{ router, params, search, children }` where
**`children` is the next route in the chain** — a layout renders `props.children`
wherever the child should appear. A component-less (pathless/layout) route passes
its child through transparently.

### 3. Fine-grained, layout-preserving updates

Each depth's outlet is a **function-node reactive region** whose only dependency
is a **memo of that depth's route identity** (`router.select(s => s.matches[d]?.route)`,
`Object.is`). Navigating a leaf changes only the leaf's route memo → only the
leaf region re-mounts; parent layouts (and their signals/effects/DOM) are
preserved. A same-route param change (`/posts/1`→`/posts/2`) re-mounts *nothing*
— `params`/`search` are passed as **reactive accessors**, so only the bindings
that read the changed param update. This is the fine-grained payoff and the cure
for Expo Router's global-vs-local re-render footgun.

### 4. Typed `Link`/`RouterView`, bound to the router explicitly

`createLink(router)` returns a typed `Link({ to, params?, search?, ... })`
function (params required iff the pattern has them — reuses Router I's
`NavTarget<P>`). Because there is no ambient "current route", relative resolution
stays explicit (consistent with TanStack requiring `from`). `Link` builds an
element via `createElement` (default tag `a` with `href` + an `onClick` that
navigates; configurable `as` for native), so it is renderer-agnostic.

### Scope split (quality over breadth)

Shipped in Router II: nested tree + match chain, `createRouterView` (fine-grained
nested rendering), `createLink`, the `RouteComponentProps` contract.

Deliberately **deferred** (documented, not exported — no teasing future names):

- **Global typed route registry** (TanStack `Register` declaration-merging for
  whole-tree `to` autocomplete). Router I/II already give strong *per-call*
  typing; the global union derivation is a large type-level project for a
  dedicated phase.
- **Loaders / data / SWR / auto-prefetch** and **idempotent navigation guards**.
- **File-based route scanning + a bundler/Metro plugin** (the Phase 4
  `buildRouteManifest` is the build-time input when this lands).
- **View Transitions.** Same-document `document.startViewTransition` is Baseline
  (2025-10) but **web/DOM-only** with no stable cross-platform (RN shared-element)
  equivalent yet; wiring it into the renderer-agnostic core would couple it to
  the DOM. It is a signals-friendly imperative wrap (`startViewTransition(() =>
  apply)`) for a later renderer-side phase.
- **Ambient `<Outlet/>` + relative-link context** — both want owner-scoped
  context in `@mindees/core` first.

## Consequences

- `@mindees/router` still depends only on `@mindees/core`. The renderer remains a
  **devDependency** (headless backend) used to test that `createRouterView`
  actually mounts/updates.
- Nesting is data-driven (the `matches` array) and deterministic — no reliance on
  a context mechanism the core doesn't have.
- `RouteRecord.component` is typed `Component<RouteComponentProps>`; a zero-prop
  leaf component is still assignable (fewer params).
- Maturity stays `experimental`; Router II is additive to Router I's exports.
