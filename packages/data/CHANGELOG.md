# @mindees/data

## 0.15.0

### Patch Changes

- @mindees/core@0.15.0

## 0.14.0

### Patch Changes

- @mindees/core@0.14.0

## 0.13.0

### Minor Changes

- 08202ad: Add a **PN-Counter** CRDT to Continuum (`emptyCounter`/`counterInc`/`counterDec`/`counterValue`/
  `mergeCounter`) — a conflict-free integer counter (increment + decrement) for offline-first counts like
  likes, quantities, or inventory. State-based and convergent: `mergeCounter` is commutative, associative,
  and idempotent (per-replica max of two grow-only counters), so replicas reconcile with no lost updates.

### Patch Changes

- @mindees/core@0.13.0

## 0.12.0

### Patch Changes

- @mindees/core@0.12.0

## 0.11.0

### Patch Changes

- @mindees/core@0.11.0

## 0.10.0

### Patch Changes

- @mindees/core@0.10.0

## 0.9.0

### Patch Changes

- @mindees/core@0.9.0

## 0.8.0

### Patch Changes

- @mindees/core@0.8.0

## 0.7.0

### Patch Changes

- @mindees/core@0.7.0

## 0.6.0

### Patch Changes

- @mindees/core@0.6.0

## 0.5.0

### Minor Changes

- 13b59a9: Wire up durable persistence for Continuum. The `Persistence` contract had only an in-memory
  reference; now:

  - **`createWebStoragePersistence(storage)`** adapts a Web Storage (`localStorage`/`sessionStorage`),
    injected (not a global) so it stays DOM-free and testable.
  - **`persistEngine(engine, persistence, key)`** auto-saves the engine's snapshot after every
    `set`/`delete`/`sync` — serialized so a burst of edits can't write an older snapshot last, and
    best-effort (a save failure never breaks a mutation).
  - **`createPersistentEngine({ persistence, key, ...syncOptions })`** does both: restore the persisted
    snapshot (so `seq`/HLC survive and op ids never collide across restarts) then auto-save. One call
    for a replica that survives restart. `loadSnapshot` tolerates a corrupt blob (starts fresh).

### Patch Changes

- Updated dependencies [503be19]
- Updated dependencies [4d1707d]
- Updated dependencies [4591937]
- Updated dependencies [f8318f9]
  - @mindees/core@0.5.0

## 0.4.0

### Patch Changes

- Updated dependencies [ea9915f]
  - @mindees/core@0.4.0

## 0.3.0

### Minor Changes

- 73f8820: **Per-field LWW in the Continuum sync engine.** Previously a record merged as a single
  whole-record register, so two replicas editing _different_ fields of the same record offline
  would clobber each other (the later HLC won the entire record). Records now merge **per field**:
  `set('users', 'u1', { name: 'Ada' })` stamps only `name`, so a concurrent `{ age: 36 }` edit on
  another replica survives. `set` now **merges** fields rather than replacing the record (use
  `delete` to remove one). A whole-record `delete` is a tombstone that shadows older fields but a
  newer field write resurrects that field. Convergence is preserved (per-field `mergeRegister` is
  commutative + idempotent + associative). Legacy persisted snapshots auto-migrate on restore.

  Also fixes `sync()` silently no-op'ing a caller's just-queued ops when another `sync()` was in
  flight — calls now serialize so each run pushes its own ops (no double-pull / cursor regression).

### Patch Changes

- Updated dependencies [2eba52a]
  - @mindees/core@0.3.0

## 0.2.0

### Patch Changes

- Updated dependencies [c29f76c]
  - @mindees/core@0.2.0

## 0.1.0

### Minor Changes

- bf948be: First public release — **v0.1.0**.

  MindeesNative's foundation is complete and audited: fine-grained reactivity, the
  component model + selector-isolated context, the priority scheduler and thread-pool
  abstraction (`@mindees/core`); the Helix renderer with web/DOM + headless backends,
  SSR/hydration, and a CI-verified native strand on iOS (JavaScriptCore) and Android
  (QuickJS) (`@mindees/renderer` + `examples/native-hosts`); the build-time optimizer
  (`@mindees/compiler`); the Forge CLI + `create-mindees` scaffolder; the Quantum typed
  router with data loaders, guards, and view transitions (`@mindees/router`); the Pulse
  signed-OTA + SDUI system (`@mindees/updates`); the Continuum local-first CRDT store +
  sync engine (`@mindees/data`); the Synapse AI gateway (`@mindees/ai`); and the Atlas
  accessible primitives + virtualized list (`@mindees/atlas`).

  APIs are 🧪 experimental (pre-1.0); see `STATUS.md`. This `minor` bump versions the
  whole locked `@mindees/*` line at `0.1.0`.

### Patch Changes

- 230b62f: Audit hardening for `@mindees/data` (Continuum). An adversarial distributed-systems review of the HLC, CRDTs, sync engine, and persistence confirmed five convergence/causality defects; each is fixed with a regression test:

  - **Clock-skew causes permanent divergence + data loss (critical)** — the HLC drift guard threw on a far-future remote, and the sync loop treated that throw as "skip this op" _and_ advanced the cursor past it, so a legitimately clock-skewed peer (>24h, e.g. a wrong device date) had its committed write silently dropped forever — replicas never reconverged. `clock.update` now **clamps** how far a remote advances the local clock (anti-poisoning) instead of rejecting it, and the sync loop always merges the op (a CvRDT merge is independent of the local clock). Only structurally-invalid (non-encodable) stamps are skipped, which are permanently unusable.
  - **Drift bound anchored to physical time, not the clock (medium)** — folded into the fix above: the clamp ceiling is now `max(localWall, physical) + maxDriftMs`, so a stamp at/below the local clock is always accepted (it cannot poison a clock already past it).
  - **Same-stamp LWW tie-break non-commutative (high)** — the tie-break used `JSON.stringify`, which returns `undefined` for `undefined`/functions/symbols (flipping the winner by argument order) and collides `NaN` with `null` (both `"null"`). Replaced with a total, type-tagged key so equal-stamp registers converge to the same value on every replica regardless of delivery order.
  - **Persistence dropped the HLC high-water mark (high)** — `export()`/restore omitted the clock, so a restored replica's clock regressed to 0 and a same-record edit right after restart could lose the LWW merge to its own pre-restart write. The snapshot now carries the clock and the restored engine seeds it, so post-restart edits are strictly newer.

  Also freezes the exported `info` object (consistency with the other packages).

- 86e5b94: Post-review hardening pass over the audit fixes (follow-ups confirmed with regression tests), plus a cross-package typecheck repair:

  - **`@mindees/renderer` — SSR element-tag injection (security)** — `serializeHeadless` interpolated the (possibly `mapTag`-mapped) tag into `<tag>`/`</tag>` unescaped, so a tag containing `>`/whitespace could break out and inject markup. The tag is now validated against the attribute-name grammar and rejected (fail closed) if unsafe.
  - **`@mindees/atlas` — `Pressable` style typecheck regression** — tightening `Accessor<T>` to a strict `() => T` left the 1-arg interaction-state style fn leaking into the `resolveStyle` branch. The arity-narrowed branch now asserts `Reactive<StyleInput>`, mirroring the state-fn cast, so the package typechecks again.
  - **`@mindees/atlas` — horizontal `ScrollView` layout was inert** — the row layout set `flexDirection`/`flexWrap` without `display: 'flex'`, so the element stayed in default block flow. `display: 'flex'` is now included.
  - **`@mindees/ai` — Anthropic streaming dropped `input_tokens`** — prompt tokens arrive on `message_start` while output tokens arrive on `message_delta`; the parser now carries `input_tokens` through to the finish chunk instead of reporting only output tokens.
  - **`@mindees/data` — HLC drift ceiling could ratchet** — the clamp ceiling is anchored to `physical + maxDriftMs` (not `max(localWall, physical) + maxDriftMs` re-added per merge), so repeated far-future merges can't walk the clock forward. The LWW same-stamp tie-break also tags `-0` distinctly from `+0` so a `-0`-vs-`+0` tie still converges.
  - **`@mindees/updates` — non-idempotent re-apply** — re-applying the already-current generation fell through and rewrote state, resetting `pendingVerification`/`bootAttempts` and un-confirming a generation that had already passed its readiness handshake. It now short-circuits to a true no-op.
  - **`@mindees/compiler` — marker collision missed destructuring** — the `_static` top-level collision check ignored destructuring bindings (`const { _static } = x`); it now recurses object/array binding patterns so flattening still bails on a real collision.
  - **`@mindees/cli` — overly specific scaffold error** — the unreadable-target message asserted "not a directory" for every `readDir` failure even though it could be a permission/I/O error; the message no longer claims a cause it didn't verify.

- Updated dependencies [43c3d33]
- Updated dependencies [bf948be]
  - @mindees/core@0.1.0
