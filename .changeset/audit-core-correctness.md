---
"@mindees/core": patch
---

Audit hardening for `@mindees/core` (reactivity, scheduler, thread pool, component model). Eleven defects found by an adversarial review and confirmed with regression tests:

- **Reactivity** — a computation that writes a signal it reads (a "self-write") no longer silently drops the change; it recomputes until its own writes settle, bounded by the infinite-loop guard. An effect that disposes itself mid-run no longer leaks subscriptions or registers cleanups on the dead scope. A prior-run cleanup that throws during a re-run no longer strands the effect's children/dynamic deps — the graph is rebuilt and the error still surfaces. The public `Owner` type is now an opaque handle, so the internal `Computation` graph (and `any`) no longer leaks into published types.
- **Scheduler** — key eviction is identity-checked, so a stale handle can no longer break same-key dedup (two same-key tasks could both run). A throwing `onError` hook no longer aborts the flush or strands queued tasks.
- **Thread pool** — a worker crash now rejects all and only that worker's in-flight jobs (previously it rejected one arbitrary job, often another healthy worker's, and leaked the rest), terminates the dead worker, and respawns a replacement so the pool stays live and `size` stays accurate.
- **Component** — `renderComponent` disposes the partial reactive scope if the component throws during render, instead of leaking it with no disposer returned.
- **Metadata** — the exported `info` object is frozen to match its `readonly` contract.
