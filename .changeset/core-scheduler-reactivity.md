---
"@mindees/core": minor
---

Wire the priority scheduler into reactivity — concurrent-class prioritized / deferred updates,
**without changing the synchronous default**. `effect(fn, { priority: 'normal' })` defers its
re-runs through a scheduler injected via `setReactiveScheduler(scheduler)` (interaction priority /
deferred heavy work); rapid re-stales coalesce to one run (latest value), and disposal cancels any
pending flush. The first run is always synchronous (deps + initial paint), and with no scheduler
injected — every existing call site, all tests, and SSR — `'normal'` falls back to synchronous, so
the glitch-free synchronous default is provably untouched (one `lane` field defaulting to `'sync'`
plus a single `flushEffects` branch that is unreachable unless a scheduler is set). `startTransition`
/ `deferred` ergonomics + a native frame source are an additive follow-up.
