# Roadmap

MindeesNative is built **bottom-up**: each phase depends only on the ones before
it, and each ends with something a person can actually run. A phase is "done"
only when `pnpm verify` (lint + typecheck + test + build) is green in CI.

See [STATUS.md](./STATUS.md) for current maturity.

- [x] **Phase 0 — Repository, governance & toolchain foundation** ✅
  Monorepo, full OSS/governance surface, verified toolchain, green CI, package
  scaffolds exporting only metadata + `NotImplementedError`.
- [x] **Phase 1 — `@mindees/core` I: signals & reactivity** ✅
  Glitch-free, leak-free fine-grained reactivity.
- [x] **Phase 2 — `@mindees/core` II: component model, scheduler & threading** ✅
  Selector-based, re-render-isolated context; priority scheduler; worker-backed
  thread abstraction (native multi-thread is research-track).
- [x] **Phase 3 — `@mindees/renderer` (Helix): web/DOM target + backend contract** ✅
  Working SSR-capable DOM backend + headless test backend; `NativeBackend`
  interface defined.
- [x] **Phase 4 — `@mindees/compiler` (MDC): build-time optimizer** ✅
  Type-check gate, TSX transform, tree-flattening, per-route splitting
  (TS→native AOT is a labeled research track with a working fallback).
- [x] **Phase 5 — `@mindees/cli` (Forge) + `create-mindees`** ✅
  `create` / `dev` (web HMR) / `build` / `doctor`; tested templates.
- [x] **Phase 6 — `@mindees/router` (Quantum) I: typed routing core** ✅
  Codegen-free typed path params (template-literal types), Standard-Schema
  validated typed search params (any Zod/Valibot/ArkType schema; zero runtime
  dep), signals-native router state with selector-based re-render isolation, typed
  + relative navigation, dynamic route-table reconfiguration without state reset,
  and injectable history (memory + browser).
- [x] **Phase 7 — `@mindees/router` (Quantum) II: render integration + data/guards/transitions** ✅
  Nested route tree + match chain, `createRouterView` (fine-grained,
  layout-preserving nested rendering), typed `createLink`; **SWR data loaders**
  (`AbortSignal` cancellation, `invalidate`, `preload`), **navigation guards**
  (`beforeNavigate` cancel/redirect + idempotent navigation), and **web view
  transitions** (`document.startViewTransition`, feature-detected). Built on
  `@mindees/core` (renderer is a test-only devDependency). Deferred to a later
  router phase: the global typed route registry, file-based route scanning + a
  bundler/Metro plugin, per-key fine-grained loader signals, native shared-element
  transitions.
- **Phase 8 — `@mindees/renderer` (Helix): the native strand**
  The framework-defining piece — render to real native platforms, not a web view.
  Built as a sub-phased track so each step is real and tested:
  - [x] **Phase 8A — Native command backend foundation** ✅
    A platform-neutral, serializable `NativeCommand` protocol + a
    `createNativeCommandBackend()` that implements the Helix `HostBackend`
    contract, turning the element tree + fine-grained reactive updates into a
    command stream a native host can replay. Event handlers cross as stable
    handler ids, never as serialized functions. (This is the path, not yet pixels.)
  - [x] **Phase 8B — Native host conformance contract + reference host** ✅
    `createReferenceHost()` — the inverse of the backend: it consumes the command
    stream, reconstructs the view tree, and **strictly validates** it (throws on
    any malformed/leaking sequence). It is the executable spec a real native host
    implements, and piping the backend through it proves the stream is valid and
    non-leaking end to end. The UIKit (iOS) and Android-View reference host projects
    in `examples/native-hosts/` implement these semantics.
  - [x] **Phase 8C — iOS host (compiles + conformance core verified in CI)** ✅
    A real Swift package (`examples/native-hosts/ios/`): UIKit renderer + a
    device-free apply/validation core implementing the 8B contract. A macOS CI job
    (`.github/workflows/native-ios.yml`) runs `swift test` and compiles the full
    package (incl. `UIKitRenderer`) for the iOS SDK. Render-verified in 8E; full
    end-to-end app in 8F.
  - [x] **Phase 8D — Android host (compiles + conformance core verified in CI)** ✅
    A real Gradle/Android library (`examples/native-hosts/android/`): `android.view`
    renderer + a JVM-testable core. A Linux CI job (`.github/workflows/native-android.yml`,
    Android SDK) runs `:mindees-host:test` and `:mindees-host:assembleDebug` (compiles
    `AndroidViewRenderer`). Render-verified in 8E; full end-to-end app in 8F.
  - [x] **Phase 8E — On-device render verification** ✅
    The renderers are proven to build correct **native view trees on the platform
    runtime**, in CI: an iOS Simulator XCTest (`UIKitRenderTests`, run via
    `xcodebuild test`) and an Android Robolectric test (`AndroidRenderTest`, real
    `android.view` on the JVM — incl. click dispatch via `performClick()`). Both
    decode the JSON wire format and assert the resulting hierarchy + updates +
    disposal. (Proves correct native rendering; not yet pixels on a physical device.)
  - [ ] **Phase 8F — End-to-end native example app**
    A runnable native example that renders on a real device/emulator over a real
    JS↔native bridge (embedding a JS engine to run the reactive app on-device) —
    the step that makes a native MindeesNative app real end to end.
- **Phase 9 — `@mindees/updates` (Pulse): signed differential OTA + SDUI**
  Ship new JS + assets to installed apps with no app-store release, safely.
  Sub-phased so each step is real and tested:
  - [x] **Phase 9A — Signed OTA core** ✅
    A versioned, hash-addressed `UpdateManifest`; Ed25519 `signManifest` /
    `verifySignedManifest` (≥-threshold distinct trusted keys → key rotation +
    multi-party signing; signature checked over detached canonical bytes; pure-JS
    `@noble`, so it runs on Hermes/RN without WebCrypto); a content-addressed
    `UpdateStorage` (blobs keyed by SHA-256 ⇒ unchanged assets aren't re-downloaded);
    and `createUpdateClient()` — check/download/apply/boot/notifyReady/rollback with
    atomic generations, monotonic-version + expiry + runtime-compatibility gates, and
    readiness-handshake crash-loop rollback (previous → embedded). See
    [ADR-0008](./docs/adr/0008-pulse-ota.md).
  - [x] **Phase 9B — Differential bundle diffing** ✅
    A zero-dependency, pure-TS byte-level delta codec (`diff` build-side / `applyDelta`
    on-device, a rolling-hash COPY/INSERT scheme) and a `download()` delta path: an
    `AssetEntry.patch` descriptor (inside the signed manifest) lets a changed asset be
    reconstructed from a small delta against a base blob the client already holds,
    gated by the existing post-apply SHA-256 check with a full-fetch fallback. See
    [ADR-0009](./docs/adr/0009-pulse-differential-diff.md).
  - [x] **Phase 9C — Pulse reference update server** ✅
    A pure, capability-injected server core (`createUpdateServer` at the
    `@mindees/updates/server` subpath): channel selection, deterministic staged
    rollout, an anti-downgrade mirror, freeze (expiry), rollback directives, and
    content-addressed `getAsset` (deltas included). It **never signs** — it serves
    pre-signed manifests. A runnable `node:http` adapter lives in
    `examples/pulse-server/`. See [ADR-0010](./docs/adr/0010-pulse-reference-server.md).
  - [x] **Phase 9D — Server-driven UI (SDUI)** ✅
    `compileSdui` at the `@mindees/updates/sdui` subpath turns an allowlisted,
    schema-versioned JSON component tree into a `@mindees/core` `MindeesNode`: named
    (never `eval`'d) action handlers, reactive `$bind` data bindings, prototype-pollution
    defense, and hard depth/node/string/prop limits. Incremental updates via pure-TS
    RFC 7396 merge-patch + a safe RFC 6902 subset (`add`/`remove`/`replace`), re-validated
    before render. See [ADR-0011](./docs/adr/0011-pulse-sdui.md). **Phase 9 (Pulse) complete.**
- **Phase 10 — `@mindees/data` (Continuum): local-first store & sync**
  A reactive offline store, delta sync, and conflict resolution — hand-rolled pure-TS
  on `@mindees/core` signals (Automerge/Loro are WASM and can't run on Hermes; Yjs is
  a documented optional rich-text adapter). Sub-phased:
  - [x] **Phase 10A — Reactive document store** ✅
    `createCollection`: signals-native fine-grained reactive reads
    (`get`/`has`/`all`/`where`/`size`), atomic mutations (`insert`/`upsert`/`update`/
    `delete`/`clear`/`tx`), and optimistic changes with `rollback()`. See
    [ADR-0012](./docs/adr/0012-continuum-reactive-store.md).
  - [x] **Phase 10B — HLC + causality** ✅
    A Hybrid Logical Clock (`createClock`, injected physical clock + nodeId; monotonic
    total order; counter-overflow rolls into wall time; untrusted-remote drift guard;
    lexicographically-sortable encoding) and version vectors (`vvMerge`/`vvDominates`/…),
    exhaustively property-tested (fast-check). See
    [ADR-0013](./docs/adr/0013-continuum-hlc-causality.md). (Content-addressed op
    encoding lands with the `Op` type in 10D.)
  - [x] **Phase 10C — CRDT conflict resolution** ✅
    Per-field LWW-Register/Map (HLC-stamped; same-stamp ties broken by content so merge
    stays commutative even on adversarial input) + an add-wins OR-Set, proven
    commutative/associative/idempotent/convergent (fast-check) and prototype-pollution
    safe. See [ADR-0014](./docs/adr/0014-continuum-crdt.md).
  - [x] **Phase 10D — Local-first sync engine + transport** ✅
    HLC-stamped, idempotent `Op`s; a convergent `MutationLog` (record-level LWW via 10C
    `mergeRegister`); a `SyncTransport` contract + an in-memory `createMemoryHub`; and
    `createSyncEngine` (optimistic local `set`/`delete`, `sync()` = push + pull + merge).
    Two peers converge after concurrent offline edits, duplicate delivery, and
    out-of-order pulls — proven in a pure unit test. See
    [ADR-0015](./docs/adr/0015-continuum-sync-engine.md). The reactive offline store +
    delta sync + conflict resolution that defines Continuum now work end to end (a
    reference server + native persistence are the 10E/10F follow-ups).
  - [x] **Phase 10E/10F — Reference sync server + persistence** ✅
    A capability-injected `createSyncServer` over an injected `OpLogStore`
    (`@mindees/data/server`) + a runnable `node:http` adapter in `examples/`; and a
    `Persistence` contract + `createMemoryPersistence` + engine `export()`/restore so a
    replica resumes after restart with stable identity (closing the op-id hazard). Native
    SQLite + Yjs/Automerge/Loro interop are 🔬 research tracks. See
    [ADR-0016](./docs/adr/0016-continuum-server-persistence.md). **Phase 10 (Continuum) complete.**
- **Phase 11 — `@mindees/ai` (Synapse): provider-agnostic AI + dev-time AI**
  A pure-TS, hand-rolled AI contract (no vendor SDK) with backends that work everywhere;
  on-device LLM inference is inherently native (Apple Foundation Models, AICore, ExecuTorch)
  so it's a labeled research track with a working mock/server fallback. Sub-phased:
  - [x] **Phase 11A — AI contract + mock backend** ✅
    `createAi` + the `AiBackend` seam (messages, `GenerateRequest`/`AiResult`/`AiChunk`,
    `AiError`), streaming as `AsyncIterable` only; a deterministic `createMockBackend`
    (offline, no keys); a `createOnDeviceBackend` research-track seam that throws. See
    [ADR-0017](./docs/adr/0017-synapse-ai-contract.md).
  - [x] **Phase 11B — Server/HTTP backend** ✅
    `createServerBackend({ fetch, … })` over an injected `fetch`, a pure-TS
    SSE→`AsyncIterable` parser (buffer-capped against newline-starved servers), and
    openai/anthropic mappers — defensive untrusted-JSON parsing, golden-fixture tested with
    zero real network, exported from the `@mindees/ai/server` subpath. See
    [ADR-0018](./docs/adr/0018-synapse-server-backend.md).
  - [x] **Phase 11C — Structured output + tool calling** ✅ — shipped in two:
    - [x] **Structured output** ✅ `generateObject`/`streamObject`: prompt-and-validate
      against any Standard Schema (no JSON-Schema generation — validator-agnostic), no
      `eval`, deep sanitize-before-validate (prototype-pollution + DoS defense), bounded
      repair (`1 + maxRepairs`) with the concrete issues fed back. See
      [ADR-0019](./docs/adr/0019-synapse-structured-output.md).
    - [x] **Tool calling** ✅ `runTools` — a bounded loop (step = one `generate`; validate
      args before `execute`; invalid args fed back recoverably; dedup; parallel + requested
      order; 4-point abort; non-mutating transcript), mock scripted tool-call mode, and
      openai/anthropic tool wire mapping. See
      [ADR-0020](./docs/adr/0020-synapse-tool-calling.md).
  - [x] **Phase 11D — Dev-time error explainer** ✅ `explainError` (`@mindees/ai/devtools`)
    turns a thrown error into a validated `{ summary, likelyCauses, suggestedFixes }` via
    `generateObject`, plus a `mindees ai explain <error>` CLI command (server backend wired
    from `MINDEES_AI_*` env). Dev/build path only — never bundled on device. See
    [ADR-0021](./docs/adr/0021-synapse-devtools.md). **Phase 11 (Synapse) complete.**
- [~] **Phase 12 — `@mindees/atlas` (Atlas): accessible UI primitives + recycling list**
  Web implementations now; native is a labeled research track. Sub-phased:
  - [x] **Phase 12A — Primitives, style & theme** ✅ accessible signals-native primitives
    (`View`/`Text`/`Image`/`TextInput`/`Pressable`/`Button`/`Stack`/`Row`/`Column`/`Spacer`/
    `ScrollView`) over `createElement`, a curated cross-platform `StyleObject` (numbers → `px`
    on web), `Reactive<T>` props, `role`/`aria-*` accessibility, real-DOM-event interaction,
    and a structural theme (`@mindees/atlas/theme`). See
    [ADR-0022](./docs/adr/0022-atlas-primitives.md).
  - [ ] **Phase 12B — Virtualized recycling `List`** — fixed-pool row recycling over the
    Helix reactive-region model (`@mindees/atlas/list`); fixed-height first, variable-height
    a research track.
- [ ] **Phase 13 — Examples, docs, benchmarks, release & governance**
  Runnable web example (offline + live OTA), docs site, enforced perf budgets,
  codemods, release pipeline, `v0.x.0`.

> Phases are gated: each is completed and reviewed before the next begins.
> Native rendering (Phase 8) is prioritized ahead of OTA/data/AI because it is the
> framework's defining capability and the prerequisite for a real native app.
