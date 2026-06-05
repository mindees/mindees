---
"@mindees/data": minor
---

Wire up durable persistence for Continuum. The `Persistence` contract had only an in-memory
reference; now:

- **`createWebStoragePersistence(storage)`** adapts a Web Storage (`localStorage`/`sessionStorage`),
  injected (not a global) so it stays DOM-free and testable.
- **`persistEngine(engine, persistence, key)`** auto-saves the engine's snapshot after every
  `set`/`delete`/`sync` — serialized so a burst of edits can't write an older snapshot last, and
  best-effort (a save failure never breaks a mutation).
- **`createPersistentEngine({ persistence, key, ...syncOptions })`** does both: restore the persisted
  snapshot (so `seq`/HLC survive and op ids never collide across restarts) then auto-save. One call
  for a replica that survives restart. `loadSnapshot` tolerates a corrupt blob (starts fresh).
