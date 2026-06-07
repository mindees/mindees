---
"@mindees/data": minor
---

Add a **PN-Counter** CRDT to Continuum (`emptyCounter`/`counterInc`/`counterDec`/`counterValue`/
`mergeCounter`) — a conflict-free integer counter (increment + decrement) for offline-first counts like
likes, quantities, or inventory. State-based and convergent: `mergeCounter` is commutative, associative,
and idempotent (per-replica max of two grow-only counters), so replicas reconcile with no lost updates.
