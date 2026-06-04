---
"@mindees/router": patch
---

Audit hardening for `@mindees/router` (Quantum). Seven defects found by an adversarial review and confirmed with regression tests:

- **Query prototype pollution (high)** — `parseQuery` used a `{}` accumulator, so a query key like `?constructor=x` resolved a builtin on the existence probe (leaking a function into a bogus array) and `?__proto__=a&__proto__=b` mutated the result's prototype. The accumulator is now `Object.create(null)`, so every key — including `constructor`/`__proto__`/`toString` — is an ordinary own data property.
- **Unbounded loader cache (high)** — the SWR cache grew without limit for high-cardinality dynamic routes (`/posts/:id` visited many times) and `dispose()` never released it. The per-route cache is now bounded (LRU eviction of the oldest non-pending entries) and `dispose()` drops the cache.
- **Async `searchSchema` wedged the router (medium)** — an async (or throwing) search schema threw `ASYNC_SCHEMA` out of matching, escaping the match memo and making every router-state accessor throw with no recovery. Matching now contains it and degrades to raw search + `match.issues`, exactly like the invalid-input path.
- **View-transition hazards (medium)** — the `startViewTransition` wrapper didn't handle a synchronous throw (could drop a navigation and escape `navigate()`) or a rejected `ready` promise (unhandled rejection on rapid/aborted transitions). It now falls back to a plain commit on a sync throw (no double-commit) and marks the transition's promises handled.
- **`invalidate()` no-op while loading (medium)** — invalidating while a load was in flight neither cancelled it nor refetched, serving the pre-invalidation result. It now aborts the in-flight load so a fresh one runs.
- **Aborted preload left a stuck `pending` entry (low)** — an aborted preload discarded its result and left a permanent `pending` cache entry despite the documented "warms the cache" contract. An aborted load now still warms the cache (without notifying the navigated-away route) and never leaves a stuck `pending` entry.
