---
"@mindees/router": patch
---

Fix three router lifecycle/isolation bugs:

- **`dispose()` now clears the active-router registry.** A disposed router no longer leaks
  through `useRouter()`/`useParams()`/`<Link>` (identity-guarded so disposing an old router
  can't clobber a newer active one).
- **`params()`/`search()`/`usePathname()` are re-render isolated.** They're memoized with
  shallow equality (pathname via `select`), so navigating between locations with the same
  params/search no longer re-runs subscribers — the headline selector-isolation guarantee.
- **An invalid synthesized route pattern no longer poisons all router state.** A structurally
  invalid route (e.g. a catch-all parent with children → `/x/:rest*/y`) is dropped with a dev
  warning at compile time instead of throwing out of the state memo on every access.
