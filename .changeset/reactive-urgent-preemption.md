---
"@mindees/core": patch
---

Fix urgent-vs-transition scheduling in the reactive core: an **urgent write** (outside any
`startTransition`) now interrupts a **transition-deferred effect** and runs it synchronously with the
urgent value — even when the effect reads the signal **through one or more computeds** (the mark used to
die at an already-colored computed, so the urgent update was swallowed until the next drain).

- Preemption is decided **per node** (a parked sync effect is reached whether it sits at CHECK or DIRTY),
  deduped by an `urgentEpoch` stamp so a diamond is never re-walked and no effect is preempted twice.
- It fires **only** for transition-deferred SYNC effects; a `priority:'normal'` effect stays deferred by
  the dev's explicit choice (an urgent write does not force it synchronous).
- Glitch-freedom and no-redundant-recompute are preserved (the effect recomputes its sources in order and
  an unchanged memo still suppresses the run); detaching/replacing the scheduler mid-defer flushes the
  parked effects instead of stranding them, and honors an open `batch`/`startTransition`.

The entire path is inert on every default/SSR run (no scheduler, or nothing deferred). The companion
self-write-during-flush bug remains deferred. Verified across three adversarial review rounds + 1165 tests.
