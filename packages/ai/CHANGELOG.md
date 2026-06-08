# @mindees/ai

## 0.35.0

### Minor Changes

- d722850: **Shared `MindeesError` base** (1.0 error-convention consistency, from the freeze audit). `@mindees/core`
  now exports `MindeesError extends Error` (a stable `name` + machine-readable `code`), and every package error
  extends it — `AiError`, `RouterError`, `DataError`, `UpdateError`, `SduiError`, `NativeHostError`, and
  `NotImplementedError`. So a consumer can `catch (e) { if (e instanceof MindeesError) … }` across the whole
  family and branch on `e.code` instead of string-matching messages. Subclasses keep their precise `code`
  union (via `declare readonly code`), and `instanceof <SpecificError>` still works.

  Also from the audit: `NativeHostError` now carries a `NativeHostErrorCode`; `useRouter()` throws a typed
  `RouterError('NO_ACTIVE_ROUTER')` instead of a bare `Error`; `SduiErrorCode` drops its redundant `SDUI_`
  prefix to match the bare-code convention of its peers.

### Patch Changes

- Updated dependencies [d722850]
  - @mindees/core@0.35.0

## 0.34.2

### Patch Changes

- @mindees/core@0.34.2

## 0.34.1

### Patch Changes

- Updated dependencies [e45fcc2]
  - @mindees/core@0.34.1

## 0.34.0

### Patch Changes

- @mindees/core@0.34.0

## 0.33.0

### Patch Changes

- Updated dependencies [10523ac]
  - @mindees/core@0.33.0

## 0.32.0

### Patch Changes

- @mindees/core@0.32.0

## 0.31.1

### Patch Changes

- @mindees/core@0.31.1

## 0.31.0

### Patch Changes

- @mindees/core@0.31.0

## 0.30.4

### Patch Changes

- @mindees/core@0.30.4

## 0.30.3

### Patch Changes

- @mindees/core@0.30.3

## 0.30.2

### Patch Changes

- @mindees/core@0.30.2

## 0.30.1

### Patch Changes

- @mindees/core@0.30.1

## 0.30.0

### Patch Changes

- @mindees/core@0.30.0

## 0.29.0

### Patch Changes

- @mindees/core@0.29.0

## 0.28.0

### Patch Changes

- @mindees/core@0.28.0

## 0.27.2

### Patch Changes

- Updated dependencies [9040462]
  - @mindees/core@0.27.2

## 0.27.1

### Patch Changes

- @mindees/core@0.27.1

## 0.27.0

### Patch Changes

- @mindees/core@0.27.0

## 0.26.0

### Patch Changes

- @mindees/core@0.26.0

## 0.25.0

### Patch Changes

- @mindees/core@0.25.0

## 0.24.0

### Patch Changes

- @mindees/core@0.24.0

## 0.23.0

### Patch Changes

- @mindees/core@0.23.0

## 0.22.8

### Patch Changes

- Updated dependencies [8de302d]
  - @mindees/core@0.22.8

## 0.22.7

### Patch Changes

- Updated dependencies [3a3bcae]
  - @mindees/core@0.22.7

## 0.22.6

### Patch Changes

- Updated dependencies [34605e2]
  - @mindees/core@0.22.6

## 0.22.5

### Patch Changes

- bed575f: Fix eight correctness bugs from the third v1 bug-hunt (untouched surfaces), each with a regression test:

  - **core (deferred):** `deferred()` no longer subscribes its **enclosing** effect/computed to the source
    (it seeded the mirror tracked) — which defeated deferral and leaked an effect per re-run. Seeded untracked.
  - **core (thread-pool):** a late/duplicate `onerror` from an **already-replaced** worker no longer rejects
    the live replacement's jobs or evicts it (added a worker-identity guard).
  - **ai (server SSE):** empty keep-alive events (`data:` with no payload) are skipped instead of crashing
    the stream with `JSON.parse('')`; and a **terminal finish event** is delivered even if the abort signal
    flips on that iteration (servers that omit `[DONE]` no longer drop the final chunk).
  - **ai (mappers):** tool results containing a **bigint / cycle** serialize losslessly to the model instead
    of collapsing to `"[object Object]"`.
  - **renderer (DOM):** a **string** `style` prop is applied via `cssText` (was silently dropped, breaking
    styling + hydration parity).
  - **renderer (SSR):** the CSS serializer now runs only for the `style` attribute — a non-style object prop
    (e.g. `data-config={{…}}`) serializes like the DOM backend, restoring SSR/DOM hydration parity.
  - **cli (build):** a `.jsx`/`.js` route is no longer added to the manifest when the build doesn't compile
    it — no more dangling route chunk in a green build.

- Updated dependencies [bed575f]
  - @mindees/core@0.22.5

## 0.22.4

### Patch Changes

- Updated dependencies [6782bee]
  - @mindees/core@0.22.4

## 0.22.3

### Patch Changes

- Updated dependencies [7a7d7b7]
  - @mindees/core@0.22.3

## 0.22.2

### Patch Changes

- Updated dependencies [9282b43]
  - @mindees/core@0.22.2

## 0.22.1

### Patch Changes

- Updated dependencies [57a45ee]
  - @mindees/core@0.22.1

## 0.22.0

### Patch Changes

- @mindees/core@0.22.0

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

### Minor Changes

- 3faea71: Add **`withCache`** — wrap any `AiBackend` so identical one-shot `generate` requests return a memoized
  result instead of re-hitting the provider (cuts latency + token cost for deterministic prompts/dev loops).
  Bounded LRU + optional `ttlMs`; injectable `now` + `keyOf`. Compose with `withRetry` for resilient,
  cached AI calls. Streaming passes through unwrapped.

### Patch Changes

- @mindees/core@0.15.0

## 0.14.0

### Minor Changes

- c3f95ee: Add **`withRetry`** — wrap any `AiBackend` so one-shot `generate` retries transient failures (network
  blips, 429s, 5xx) with exponential backoff. Configurable `maxAttempts`/`shouldRetry`/`backoffMs` and an
  injectable `sleep` (deterministic tests). Streaming passes through unwrapped (mid-stream can't resume).

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

- c1acd04: Audit hardening for `@mindees/ai` (Synapse) and `@mindees/atlas`. An adversarial review confirmed seven defects (the structured-output/tool-calling allowlist, SSE framing, and mock/research stubs held up); each is fixed with a regression test.

  **@mindees/ai**

  - **Broken Anthropic auth via the mapper object (high)** — `createServerBackend` chose `x-api-key` auth only when `adapter` was the string `'anthropic'`; passing the exported `anthropicMapper` _object_ (supported public API) fell through to `Authorization: Bearer` + no `anthropic-version`, so Anthropic returned 401. Auth now follows the mapper (new `ProviderMapper.auth` field), so the name and object forms authenticate identically.
  - **OpenAI stream parser dropped finish/usage on a combined event (medium)** — when one SSE event carried a content delta _and_ `finish_reason`/`usage` (common in local OpenAI-compatible servers), the parser early-returned the text-delta and silently lost the terminal finish + token usage. `StreamParser` now returns an array, so an event can emit both the delta and the finish.
  - **Abort consistency (low ×2)** — `generate()` now re-checks the abort signal after the round-trip (matching `stream()`/`runTools`), and `stream()` checks the `[DONE]` sentinel before the abort poll so a completed stream never throws a spurious `ABORTED`.

  **@mindees/atlas**

  - **`ScrollView horizontal` was a no-op (medium)** — it only set an inert `data-orientation` attribute no backend reads. It now drives real horizontal layout through the curated style subset (`flexDirection: 'row'` + `overflow: 'auto'` + `flexWrap: 'nowrap'`).
  - **`Pressable` over-subscribed plain reactive styles (low)** — every function `style` was treated as an interaction-state fn, so an ordinary reactive style re-ran on every hover/press/focus. State-fns are now distinguished by arity, so a plain `() => StyleInput` accessor only re-runs on its own dependencies.
  - **Decorative `Image` kept a contradictory `aria-label` (low)** — a decorative image given both `decorative` and `label` emitted `aria-hidden="true"` _and_ `aria-label`; the label is now dropped so a decorative image exposes no accessible name.

  Both packages' exported `info` objects are now frozen (consistency).

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
