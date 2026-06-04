# @mindees/router

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
