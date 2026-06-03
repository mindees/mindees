# ADR-0023: Atlas (Phase 12B) — virtualized recycling `List`

- **Status:** Accepted
- **Date:** 2026-06-04

## Context

12A shipped Atlas primitives. 12B adds the centerpiece: a **virtualized recycling list** that
renders only the visible window of a large item set and reuses rows as the user scrolls — over
`@mindees/core` signals + the Helix reactive-region model, with no manual DOM. On the
`@mindees/atlas/list` subpath.

## Decision

### Fixed pool of per-slot regions (NOT `items.map()`)

The hard constraint, confirmed against the reconciler: a reactive region returning
`items.slice(...).map(renderItem)` tears down **and remounts the entire window** on every
scroll change (the reconciler has no keyed array diff). So `createList` renders a **fixed pool**
of `poolSize = ceil(height/itemHeight) + 2·overscan + 1` rows, each its **own** reactive region.
A slot region's body depends only on its `active` signal; the row's `item`/`index`/`top` flow
through inner accessors. Therefore:
- A row that stays in view **keeps its identity** — `renderItem` is **not** re-run; only its
  inner bindings patch.
- Only rows crossing the window edge toggle, so `renderItem` runs **once per row as it scrolls
  into view** (proven by a test: scroll one row → exactly one new `renderItem` call).

Each visible index `i` maps to slot `i % poolSize`; the max window size **equals** `poolSize`
(the `+1` is that exact margin), and any run of ≤ `poolSize` consecutive indices has distinct
residues mod `poolSize`, so no two visible indices ever collide. The window is recomputed only
when the integer `[start, end)` actually changes (a `memo` with index-equality), so sub-row
scrolls do no work.

**Reactivity is created at mount, not at call.** `createList` returns a reactive-region
accessor; the renderer runs it once under the mounting owner, so every signal/memo/effect it
creates is **disposed on unmount** (creating them eagerly at call time would leave them un-owned
and leak past `dispose()`). Validation (`RangeError`) stays synchronous at call time.

**Lazy-accessor contract.** A slot region's body depends only on `active()`, so `renderItem`
runs once per activation — *provided the consumer reads `item()`/`index()` lazily* (inside a
child accessor / `style` fn). Reading them synchronously in the `renderItem` body subscribes the
slot region to those signals, so it re-runs on reuse (correct, but no longer recycling). The
`renderItem` doc states this.

### Pure window math

`computeWindow(scrollTop, viewportHeight, itemHeight, itemCount, overscan)` →
`{ startIndex, endIndex, totalHeight }` is a pure, exported, exhaustively unit-tested function
(clamps scroll, clamps indices, handles empty/short lists) — the deterministic heart of
virtualization, testable with plain numbers.

### Layout & scroll

A `ScrollView` (`overflow:auto`) contains a spacer of `itemCount · itemHeight` so the native
scrollbar is correct; rows are absolutely positioned by `transform: translateY(index·height)`.
`scrollTop` is read **only** from the scroll event (`e.target.scrollTop`) — never by querying a
node, so there's no layout measurement in the device path. A `getScrollOffset` seam + the
event handler make it fully headless-testable with zero real scroll. `onEndReached` fires once
when the window reaches the last item (re-armed when it leaves).

### Fixed height in v1

`itemHeight` is a `number`. Variable/measured row heights need host measurement round-trips
(native) or `getBoundingClientRect` (web, against the no-measurement doctrine), so they are a
🔬 research track — the API simply doesn't offer them yet (no silent mis-render).

## Consequences

- A correct, honest, headless-testable virtualized list that genuinely recycles in-window rows.
  `@mindees/core` runtime dep only; renderer is a peer/dev dep. **Phase 12 (Atlas) complete.**
- Rows receive **accessor** `item`/`index` (not raw values) — the recycling contract; document
  that `renderItem` runs once per slot, so row-local effects must read the accessors.

## Alternatives considered

- **One region returning `items.map()`** — rejected: remounts the whole window every scroll,
  loses row state/focus, and defeats the point. The per-slot pool is the only design that
  recycles on this reconciler.
- **Variable heights now** — deferred: needs measurement that violates the device-path
  doctrine; shipped fixed-height first rather than mis-rendering.
