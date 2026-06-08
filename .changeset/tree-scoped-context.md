---
"@mindees/core": minor
---

**Tree-scoped context: `provideContext` / `useContext`** (implements ADR-0025, part 1). Alongside the
explicit `createProvider`, a context value can now flow *implicitly* down the reactive owner tree: a parent
scope calls `provideContext(ctx, value)` and any descendant — including one inside a `portal`, whose host
nodes relocate but whose **logical scope is preserved** — reads it with `useContext(ctx)`, falling back to
the context's default. Values are re-provided on each scope re-run (a conditional provide can't go stale),
and may be reactive accessors so descendants track changes.

Internally this adds a `parent` link and a lazily-allocated context map to each reactive scope (one pointer +
a usually-null map per node). This is the foundation for the overlay-in-tab visibility fix (part 2).
