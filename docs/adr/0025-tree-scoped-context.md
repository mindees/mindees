# ADR-0025: Tree-scoped context & portal-aware visibility (overlay-in-tab)

- **Status:** Proposed (design only — not yet implemented)
- **Date:** 2026-06-08

## Context

The v1 integration review found a real composition defect: a `Modal`/`Toast` opened by a screen inside a
`createTabNavigator` tab **floats over other tabs** after you switch tabs. The tab navigator hides an
inactive panel with `display:none` (keeping it mounted for state), but the overlay's content is **portaled**
to the backend overlay layer (`<div data-mindees-overlay>` on `document.body`) — which is *not* a descendant
of the hidden panel, so `display:none` never reaches it. The overlay stays `aria-modal`, keeps its focus
trap, and its scrim still dismisses — stealing focus/input from the now-active tab.
(`packages/atlas/src/tab.ts`, `packages/atlas/src/overlay.ts`, `packages/renderer/src/portal.ts`.)

The natural fix is for an overlay to know whether its **logical owning subtree** (the tab panel) is currently
visible, and to not render (or to tear down) its portal when it isn't. That requires delivering a reactive
"am I visible?" signal from an ancestor (the panel) to a descendant (the overlay) **without prop-threading
through every screen** — i.e. *tree-scoped context*.

### Why core's existing context doesn't solve it

`createContext`/`createProvider` (`packages/core/src/component/component.ts`) is **selector-based and
explicit**: `createProvider` returns a handle you hold and pass around (the router does this). There is no
implicit "nearest provider up the tree" lookup, so a deeply-nested overlay can't discover an ancestor's
value.

### The architectural constraint that makes this hard

The obvious SolidJS-style answer — attach context to the reactive **owner** and have `useContext` walk the
owner chain — does **not** map cleanly onto this renderer:

1. **The owner tree is flat for plain components.** `render.ts` invokes a function component *directly*
   (`component(props)`) with **no per-component `createRoot`** — by design, so a static component subtree
   flattens into the enclosing reactive scope (the tree-flatten optimization). So every plain component in a
   render shares **one** owner; there is no per-component owner to hang context on, and `OwnerNode` records
   **no parent link** (`reactive.ts:33` — only `owned`/`cleanups`; the "chain" is an implicit save/restore
   stack). Nested owners exist only at **reactive-region boundaries** (`bindReactiveChild`, `keyedRegion`,
   `bindPortalChild`).
2. **Overlays open *reactively*, after the provider's mount traversal.** A `Modal` is `visible`-gated
   (`() => isVisible() ? portal(...) : null`), so the portal is created when the user opens it — a reactive
   re-run that happens *outside* the tab panel's original depth-first mount. A mount-time "context stack"
   (push on enter subtree, pop on leave) is therefore empty at modal-open time and would yield the default.
3. **Portals relocate the host nodes but should preserve the *logical* creation scope.** Whether
   `bindPortalChild` currently renders portal content under its logical owner (the panel's reactive scope) or
   under a fresh scope is **unverified** and is a load-bearing assumption for any owner-based design.

## Decision (proposed)

Introduce **tree-scoped context bound to reactive-region scopes** (not per-component), plus a parent link on
those scopes, and make portals preserve their logical scope. Concretely:

### Core

1. Add to the reactive scope node (`OwnerNode` / `Computation`): `parent: OwnerNode | null` (set at creation
   to the enclosing `currentOwner`; `createRoot` sets it to the captured `prevOwner`) and a lazily-created
   `contexts: Map<symbol, unknown> | null`.
2. `provideContext<T>(context: Context<T>, value: T): void` — set `currentOwner.contexts[context.id] = value`
   on the nearest scope.
3. `useContext<T>(context: Context<T>): T` — walk `currentOwner` via `parent`, returning the first
   `contexts` hit, else `context.defaultValue`. Reads happen at mount/creation time; **reactivity flows
   through the *value*** (provide a stable `() => boolean` accessor, read once, tracked thereafter), so a
   later reactive re-run doesn't need the lookup to re-walk.
4. `bindPortalChild` must render the portal thunk under the **logical** scope captured when the portal node
   was created (via `runWithOwner(getOwner(), …)` at portal() call time), so a portaled overlay's
   `useContext` still finds ancestor providers even though its host nodes live on `document.body`.

### Atlas

5. A `VisibilityScope` context carrying a `() => boolean` accessor (default `() => true`). `createTabNavigator`
   wraps each panel so its subtree provides `() => activeIndex() === i`.
6. `Modal`/`Toast` call `useContext(VisibilityScope)` and gate the portal: render `null` when not visible in
   scope. Their existing `onCleanup` already tears the portal down correctly (verified in the integration
   review), so going invisible removes the overlay; coming back re-renders it.

## Open questions (must verify before implementing)

- **Does `bindReactiveChild`/`keyedRegion` create a child scope with a stable identity across re-runs?** The
  provider must live on a scope that survives the panel's re-renders. (Read `render.ts` region binding.)
- **Portal logical-owner capture:** confirm `portal()` can capture `getOwner()` and `bindPortalChild` can
  re-enter it without breaking disposal (the portal's cleanup must still run with the logical scope).
- **Perf:** a `parent` pointer + a usually-null `contexts` map on every reactive node is cheap, but confirm no
  measurable regression in the reactive benchmarks (`docs/benchmarks.md`).
- **Disposal ordering:** a portaled overlay disposed via its logical scope vs. the overlay layer's removal —
  ensure no double-free / leaked host node (`liveNodeCount()===0` invariant).

## Alternatives considered

- **Explicit prop threading** (today's documented workaround): the tab navigator passes an `isActive`
  accessor to each screen, which forwards it to `Modal`. No core change, but viral and easy to forget — not a
  1.0-quality default.
- **Per-component owners** (SolidJS parity): give every component a `createRoot`. Cleanest conceptually but
  reverses the component-flattening optimization and would regress the static-subtree perf wins MDC depends
  on. Rejected.
- **Module-level "current visibility" register** (like the active-router registry): fragile — which panel's
  value is "current" when a reactive modal-open fires outside any panel traversal is undefined.

## Consequences

A genuinely tree-scoped `provideContext`/`useContext` is broadly useful beyond overlays (theming overrides,
nested router scopes, form contexts) and is a natural 1.0 capability. The cost is a careful, well-benchmarked
change to the safety-critical reactive core plus portal scoping — which is why it is **scheduled as its own
focused effort**, not folded into a feature PR. Until it lands, the overlay-in-tab limitation is documented in
`STATUS.md` (close overlays on tab change).
