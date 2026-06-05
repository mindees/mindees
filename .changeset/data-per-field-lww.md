---
"@mindees/data": minor
---

**Per-field LWW in the Continuum sync engine.** Previously a record merged as a single
whole-record register, so two replicas editing *different* fields of the same record offline
would clobber each other (the later HLC won the entire record). Records now merge **per field**:
`set('users', 'u1', { name: 'Ada' })` stamps only `name`, so a concurrent `{ age: 36 }` edit on
another replica survives. `set` now **merges** fields rather than replacing the record (use
`delete` to remove one). A whole-record `delete` is a tombstone that shadows older fields but a
newer field write resurrects that field. Convergence is preserved (per-field `mergeRegister` is
commutative + idempotent + associative). Legacy persisted snapshots auto-migrate on restore.

Also fixes `sync()` silently no-op'ing a caller's just-queued ops when another `sync()` was in
flight — calls now serialize so each run pushes its own ops (no double-pull / cursor regression).
