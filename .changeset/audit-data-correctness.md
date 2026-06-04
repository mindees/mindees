---
"@mindees/data": patch
---

Audit hardening for `@mindees/data` (Continuum). An adversarial distributed-systems review of the HLC, CRDTs, sync engine, and persistence confirmed five convergence/causality defects; each is fixed with a regression test:

- **Clock-skew causes permanent divergence + data loss (critical)** — the HLC drift guard threw on a far-future remote, and the sync loop treated that throw as "skip this op" *and* advanced the cursor past it, so a legitimately clock-skewed peer (>24h, e.g. a wrong device date) had its committed write silently dropped forever — replicas never reconverged. `clock.update` now **clamps** how far a remote advances the local clock (anti-poisoning) instead of rejecting it, and the sync loop always merges the op (a CvRDT merge is independent of the local clock). Only structurally-invalid (non-encodable) stamps are skipped, which are permanently unusable.
- **Drift bound anchored to physical time, not the clock (medium)** — folded into the fix above: the clamp ceiling is now `max(localWall, physical) + maxDriftMs`, so a stamp at/below the local clock is always accepted (it cannot poison a clock already past it).
- **Same-stamp LWW tie-break non-commutative (high)** — the tie-break used `JSON.stringify`, which returns `undefined` for `undefined`/functions/symbols (flipping the winner by argument order) and collides `NaN` with `null` (both `"null"`). Replaced with a total, type-tagged key so equal-stamp registers converge to the same value on every replica regardless of delivery order.
- **Persistence dropped the HLC high-water mark (high)** — `export()`/restore omitted the clock, so a restored replica's clock regressed to 0 and a same-record edit right after restart could lose the LWW merge to its own pre-restart write. The snapshot now carries the clock and the restored engine seeds it, so post-restart edits are strictly newer.

Also freezes the exported `info` object (consistency with the other packages).
