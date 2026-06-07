# @mindees/updates

## 0.21.0

### Patch Changes

- @mindees/core@0.21.0

## 0.20.0

### Patch Changes

- @mindees/core@0.20.0

## 0.19.0

### Patch Changes

- Updated dependencies [e8622ed]
  - @mindees/core@0.19.0

## 0.18.0

### Patch Changes

- @mindees/core@0.18.0

## 0.17.0

### Patch Changes

- @mindees/core@0.17.0

## 0.16.0

### Patch Changes

- @mindees/core@0.16.0

## 0.15.0

### Patch Changes

- @mindees/core@0.15.0

## 0.14.0

### Patch Changes

- @mindees/core@0.14.0

## 0.13.0

### Patch Changes

- @mindees/core@0.13.0

## 0.12.0

### Patch Changes

- @mindees/core@0.12.0

## 0.11.0

### Patch Changes

- @mindees/core@0.11.0

## 0.10.0

### Minor Changes

- 9ecadab: Export the **Server-Driven UI** API from the package entry (it was implemented + tested but not
  surfaced): `compileSdui` (allowlisted, schema-versioned JSON → live MindeesNode tree; no `eval`,
  pre-registered components + actions), plus `applyMergePatch` (RFC 7396) and `applyJsonPatch` (RFC 6902)
  for incremental UI deltas, and the `SduiRegistry`/`SduiLimits`/`SduiError` types. Pulse spec §10.
- 61a821d: **Pulse sandboxed WASM modules are now implemented** (spec §10) — `createWasmModuleRuntime()` returns
  a real runtime whose `instantiate(bytes, capabilities)` runs a signed feature module in its own linear
  memory, reachable **only** through the capabilities you grant (capability-secure by construction — no
  ambient JS/network/DOM access). Validates + size-caps modules (`MODULE_INVALID`). Core WebAssembly
  (runs on Hermes/RN, Node, web); the full WASM Component Model (WASI 0.2/0.3) is a follow-up behind the
  same `instantiate` seam. Previously a `NotImplementedError` research-track throw.

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

### Patch Changes

- 2cbc407: Two correctness fixes from the v1 audit:

  - **`@mindees/ai` on-device backend honors the async contract.** It previously threw
    _synchronously_ from `generate()`/`stream()`, violating `generate(): Promise` /
    `stream(): AsyncIterable`. Now `generate()` returns a rejecting Promise and `stream()`
    returns an `AsyncIterable` that throws on iteration — the same shape a future native runtime
    has, so callers' `await`/`for await` surface the error as expected.
  - **`@mindees/updates` `download()` no longer clobbers concurrent state.** It wrote a spread of
    the _pre-transfer_ state snapshot after the (awaited) asset fetches, so a concurrent
    `apply()`/`boot()`/`rollback()` could be silently lost — including a regressed
    `highestVersion` anti-downgrade floor. It now re-reads fresh state before writing and
    re-asserts the floor.

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

- 86e5b94: Post-review hardening pass over the audit fixes (follow-ups confirmed with regression tests), plus a cross-package typecheck repair:

  - **`@mindees/renderer` — SSR element-tag injection (security)** — `serializeHeadless` interpolated the (possibly `mapTag`-mapped) tag into `<tag>`/`</tag>` unescaped, so a tag containing `>`/whitespace could break out and inject markup. The tag is now validated against the attribute-name grammar and rejected (fail closed) if unsafe.
  - **`@mindees/atlas` — `Pressable` style typecheck regression** — tightening `Accessor<T>` to a strict `() => T` left the 1-arg interaction-state style fn leaking into the `resolveStyle` branch. The arity-narrowed branch now asserts `Reactive<StyleInput>`, mirroring the state-fn cast, so the package typechecks again.
  - **`@mindees/atlas` — horizontal `ScrollView` layout was inert** — the row layout set `flexDirection`/`flexWrap` without `display: 'flex'`, so the element stayed in default block flow. `display: 'flex'` is now included.
  - **`@mindees/ai` — Anthropic streaming dropped `input_tokens`** — prompt tokens arrive on `message_start` while output tokens arrive on `message_delta`; the parser now carries `input_tokens` through to the finish chunk instead of reporting only output tokens.
  - **`@mindees/data` — HLC drift ceiling could ratchet** — the clamp ceiling is anchored to `physical + maxDriftMs` (not `max(localWall, physical) + maxDriftMs` re-added per merge), so repeated far-future merges can't walk the clock forward. The LWW same-stamp tie-break also tags `-0` distinctly from `+0` so a `-0`-vs-`+0` tie still converges.
  - **`@mindees/updates` — non-idempotent re-apply** — re-applying the already-current generation fell through and rewrote state, resetting `pendingVerification`/`bootAttempts` and un-confirming a generation that had already passed its readiness handshake. It now short-circuits to a true no-op.
  - **`@mindees/compiler` — marker collision missed destructuring** — the `_static` top-level collision check ignored destructuring bindings (`const { _static } = x`); it now recurses object/array binding patterns so flattening still bails on a real collision.
  - **`@mindees/cli` — overly specific scaffold error** — the unreadable-target message asserted "not a directory" for every `readDir` failure even though it could be a permission/I/O error; the message no longer claims a cause it didn't verify.

- e292c63: Security/audit hardening for `@mindees/updates` (Pulse). An adversarial security review of the signing, crypto, delta, SDUI, server, and store layers confirmed two defects (the Ed25519 signing, delta codec, and content-addressed store held up); both are fixed with regression tests:

  - **Anti-downgrade gate at apply (medium)** — `apply()` used `version < highestVersion`, while `download()`/`check()`/the server all enforce a `<=` floor. That let a _different_ bundle signed at the _same_ version laterally replace a confirmed-good current generation (a same-version signed-downgrade / lateral-move vector). `apply()` now rejects activating a different bundle once the high-water mark has reached that version, while still allowing an idempotent re-apply of the already-current generation.
  - **SDUI merge-patch prototype pollution (medium)** — `applyMergePatch`'s base-copy loop lacked the `__proto__`/`constructor`/`prototype` guard that every other tree walk in the module has, so an own `__proto__` key in the _base_ document (e.g. from `JSON.parse` of the prior OTA doc) corrupted the returned object's prototype via the `__proto__` setter — contradicting the module's "prototype-pollution-safe" guarantee. The base-copy loop now rejects forbidden keys like the patch loop does.

  Also freezes the exported `info` object (consistency with `@mindees/core`/`@mindees/renderer`).

- Updated dependencies [43c3d33]
- Updated dependencies [bf948be]
  - @mindees/core@0.1.0
