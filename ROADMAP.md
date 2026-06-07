# Roadmap

MindeesNative is built **bottom-up**: each phase depends only on the ones before
it, and each ends with something a person can actually run. A phase is "done"
only when `pnpm verify` (lint, version sync, typecheck, build, exports, pack, CLI smoke,
and tests) is green in CI.

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
  Type-check gate, TSX transform, tree-flattening, per-route splitting, a build-time
  route manifest, opt-in **perf-lint**, and **enforced perf budgets**
  (`compileChecked(src, { budget })` fails the build over a budget)
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
  `@mindees/core` (renderer is a test-only devDependency). **File-based routing now
  lands**: `createFileRouter`/`routesFromModules` (`@mindees/router`) plus a build-time
  route manifest (`@mindees/compiler`) wired through the CLI build — Expo-parity
  convention-over-config routing (the Android example app generates its routes this way).
  Still deferred to a later router phase: the global typed route registry, per-key
  fine-grained loader signals, native shared-element transitions.
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
  - [~] **Phase 8F — End-to-end native example app**
    A runnable native example that renders on a real device/emulator over a real
    JS↔native bridge (embedding a JS engine to run the reactive app on-device) —
    the step that makes a native MindeesNative app real end to end. Current
    sub-status:
    - [x] **Phase 8F-A — Android embedded-runtime example.** A Gradle application
      module (`examples/native-hosts/android/mindees-example-app`) embeds Cash App
      QuickJS, exposes `MindeesHost.emit(json)` for command batches, routes native
      `press` callbacks back to `MindeesApp.dispatchEvent(handlerId)`, unit-tests
      the bridge contract, and assembles an APK in Android CI.
    - [x] **Phase 8F-B — Android emulator smoke execution.** Android CI creates an
      API 35 emulator and runs `:mindees-example-app:connectedDebugAndroidTest`,
      proving the example Activity renders native `TextView`/`Button` widgets and
      handles a native press through the embedded QuickJS bridge.
    - [x] **Phase 8F-C — iOS embedded-runtime bridge parity.** The Swift package
      includes `MindeesRuntimeBridge` + `JavaScriptCoreMindeesRuntime`; CI runs the
      model bridge tests via `swift test` and an iOS Simulator smoke test that invokes
      a `UIButton` `.touchUpInside` target/action callback and observes the JS-driven
      label update.
    - [x] **Phase 8F-D — Native renderer parity.** Both mobile hosts now have broad parity:
      flex (Android `FlexboxLayout`, iOS `UIStackView`), vertical + horizontal scroll, text +
      composition + styling, images (data-URI/asset), `TextInput`, `ActivityIndicator`,
      elevation/shadow, per-corner radii, a full-screen **portal overlay layer** (Modal/Toast
      paint last and overlap), and **value-carrying events** (`onChangeText` delivers the field
      text across the bridge on both hosts).
    - [ ] Physical-device smoke execution for the Android/iOS example bridges.
  - [x] **Phase 8G — Helix Canvas strand** ✅ a reconciler-driven 2D scene graph painted to a 2D
    context (`createCanvas2DBackend`, `SceneNode`/`Scene2DContext`), WebGPU-ready. The
    GPU-accelerated `createCanvasBackend` (and the direct-to-platform `createNativeBackend`) remain
    🔬 research tracks that throw `NotImplementedError`.
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
  - [x] **Phase 9E — Sandboxed WASM module runtime** ✅ `createWasmModuleRuntime` ships signed,
    capability-secure feature modules that run at runtime in their own linear memory, reachable
    only through the capabilities you grant (core WebAssembly today; the full Component Model /
    WASI 0.2/0.3 is a follow-up behind the same seam — was a research track, now real).
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
    stays commutative even on adversarial input), an add-wins OR-Set, and a **PN-Counter**
    (`Counter` — `counterInc`/`counterDec`/`mergeCounter`), proven
    commutative/associative/idempotent/convergent (fast-check) and prototype-pollution
    safe. See [ADR-0014](./docs/adr/0014-continuum-crdt.md).
  - [x] **Phase 10D — Local-first sync engine + transport** ✅
    HLC-stamped, idempotent `Op`s; a convergent `MutationLog` (record-level LWW via 10C
    `mergeRegister`); a `SyncTransport` contract + an in-memory `createMemoryHub`; and
    `createSyncEngine` (optimistic local `set`/`delete`, `sync()` = push + pull + merge).
    Two peers converge after concurrent offline edits, duplicate delivery, and
    out-of-order pulls — proven in a pure unit test. See
    [ADR-0015](./docs/adr/0015-continuum-sync-engine.md). The reactive offline store +
    delta sync + conflict resolution that defines Continuum now work end to end; 10E/10F
    add the reference server and persistence contract/export/restore path.
  - [x] **Phase 10E/10F — Reference sync server + persistence** ✅
    A capability-injected `createSyncServer` over an injected `OpLogStore`
    (`@mindees/data/server`) + a runnable `node:http` adapter in `examples/`; and a
    `Persistence` contract + `createMemoryPersistence` + a browser-backed
    `createWebStoragePersistence` (`localStorage`/`sessionStorage`) + engine `export()`/restore
    so a replica resumes after restart with stable identity (closing the op-id hazard). Native
    durable adapters (for example SQLite-backed storage), production sync hardening, and
    Yjs/Automerge/Loro rich-text interop are 🔬 research tracks. See
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
- [x] **Phase 12 — `@mindees/atlas` (Atlas): accessible UI primitives, component library + recycling list** ✅
  Web implementations render on the DOM today; the same primitives now also drive the native
  strand (the native renderers in `examples/native-hosts` have broad parity — flex, scroll,
  text/styling, images, `TextInput`, `ActivityIndicator`, elevation, per-corner radii, and a
  portal overlay layer). Sub-phased:
  - [x] **Phase 12A — Primitives, style & theme** ✅ accessible signals-native primitives
    (`View`/`Text`/`Image`/`TextInput`/`Pressable`/`Button`/`Stack`/`Row`/`Column`/`Spacer`/
    `ScrollView`) over `createElement`, a curated cross-platform `StyleObject` (numbers → `px`
    on web), `Reactive<T>` props, `role`/`aria-*` accessibility, real-DOM-event interaction,
    and a structural theme (`@mindees/atlas/theme`). See
    [ADR-0022](./docs/adr/0022-atlas-primitives.md).
  - [x] **Phase 12B — Virtualized recycling `List`** ✅ a fixed pool of per-slot reactive
    regions (not `items.map()`, which the reconciler would fully remount) so in-view rows keep
    identity and `renderItem` runs once per row as it scrolls in; pure `computeWindow` math,
    spacer-based scrollbar, `transform`-positioned rows, `onEndReached`, headless-testable
    (`@mindees/atlas/list`). Fixed-height; variable-height is a research track. See
    [ADR-0023](./docs/adr/0023-atlas-list.md). A virtualized `SectionList` lives alongside it.
  - [x] **Phase 12C — Component library, hooks, theming + dark mode** ✅ Atlas now ships **27+
    components** — the primitives plus `Card`/`Switch`/`Badge`/`Avatar`/`Chip`/`Divider`/
    `ProgressBar`/`ActivityIndicator`/`SafeAreaView`/`KeyboardAvoidingView`/`Checkbox`/
    `RadioGroup`/`Skeleton`/`Tabs`/`Accordion`/`Stepper`/`SegmentedControl`/`Toast`/`Modal`/
    `FocusScope`/`GestureView` — plus **12+ hooks** (`useToggle`/`useCounter`/`usePrevious`/
    `useReducer`/`useAsync`/`useForm`/`usePersistentSignal`/`useDebounce`/`useInterval`/
    `useTimeout` + device hooks), design-token theming with dark mode, and the **animated
    stack navigator** (`@mindees/atlas/stack`).
- [~] **Phase 13 — Release pipeline & governance**
  - [x] **Release infrastructure** ✅ version-source sync (`scripts/sync-versions.mjs` keeps each
    package's source `VERSION` equal to its `package.json` — wired into `version-packages`, so the
    automated version PR also updates the versions `create-mindees` pins), a CI drift guard
    (`pnpm check:versions`), and a guarded `release` that refuses to publish `0.0.0` or with
    drifted sources. The Release workflow opens a version PR and, when that PR is merged, **publishes
    automatically** (`publish: pnpm run release`, authenticated with the `NPM_TOKEN` secret).
    See [ADR-0024](./docs/adr/0024-release-pipeline.md) + [RELEASING.md](./RELEASING.md).
  - [x] **First publish (`v0.1.0`)** ✅ all 10 packages (`@mindees/*` + `create-mindees`) published
    to npm at `0.1.0`, triggered by merging the version PR.
  - [x] **Ongoing releases (now `v0.13.0`)** ✅ the same automated version-PR → publish pipeline
    has shipped the locked line forward; all 10 packages (`@mindees/*` + `create-mindees`) are
    published to npm at `0.13.0` (single locked version, verified against every
    `packages/*/src/index.ts` + `package.json`).
  - [x] **Enforced perf budgets** ✅ `compileChecked(src, { budget })` (`checkBudget`) **fails the
    build** when a budget is exceeded, alongside the opt-in `perfLint` (`compileChecked(src, { perf: true })`).
  - [ ] Deferred: runnable web example, docs site, codemods.

> Phases are gated: each is completed and reviewed before the next begins.
> Native rendering (Phase 8) is prioritized ahead of OTA/data/AI because it is the
> framework's defining capability and the prerequisite for a real native app.
