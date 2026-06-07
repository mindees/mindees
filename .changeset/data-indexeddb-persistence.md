---
"@mindees/data": minor
---

Add **`createIndexedDbPersistence`** — a durable IndexedDB-backed Continuum `Persistence` for the
browser (large, async storage beyond `localStorage`'s synchronous ~5MB cap; a better home for a growing
op log / snapshot). The database + store open lazily and are reused; inject `factory` to run outside a
browser. Stays DOM-lib-free via a minimal `IndexedDbFactoryLike` surface (like `WebStorageLike`).
