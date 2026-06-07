---
"@mindees/renderer": patch
"@mindees/data": patch
"@mindees/atlas": patch
"@mindees/core": patch
---

Fix six correctness bugs found by an adversarial bug-hunt (toward stable v1), each with a regression test:

- **renderer (Canvas2D):** `insert` now has move-semantics (detach before insert) — reordering a keyed
  list no longer **duplicates** the moved node in the scene graph (matched the headless/native/DOM backends).
- **data (Continuum sync):** a migrated whole-value (primitive/array) record is now resolved by HLC — a
  strictly-newer per-field set **supersedes** it instead of being silently masked, fixing data loss and a
  CvRDT **divergence** between a migrated and a fresh replica.
- **data (IndexedDB persistence):** a transient `open` failure is no longer cached forever — the next
  `load`/`save` **retries** instead of the handle being bricked for the session.
- **atlas (useForm):** `handleSubmit` guards against **double submission** while a submit is in flight;
  `isValid()` is now derived from the schema against current values (correct before the first validate()).
- **core (createElement):** an array passed via the `children` prop is used as-is (no **double-wrap**), so
  `element.children` has one consistent shape regardless of how children were supplied.
