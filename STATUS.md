# STATUS — what actually works today

This file is the **single source of truth** for MindeesNative's maturity. It is
deliberately conservative. If something is not listed as working here, assume it
does not work.

**Last updated:** Phase 10E/10F (Continuum — reference server + persistence).
**Phase 10 (Continuum) is complete**: on top of the core (10A–10D), `@mindees/data` now
also has a capability-injected reference sync server (`@mindees/data/server` +
`createSyncServer` over an injected op log, with a runnable `node:http` example) and a
`Persistence` contract + engine `export()`/restore so a replica resumes after restart
with stable identity. Native SQLite persistence + Yjs/Automerge/Loro interop are 🔬
research tracks.

The Continuum core (10A–10D): `@mindees/data` does the reactive offline store + delta
sync + conflict resolution that defines it. 10D adds idempotent HLC-stamped `Op`s, a
convergent `MutationLog` (record-level LWW via 10C `mergeRegister`), a `SyncTransport`
contract + an in-memory `createMemoryHub`, and `createSyncEngine` (optimistic local
`set`/`delete`; `sync()` = push + pull + merge). Two peers converge after concurrent
offline edits, duplicate delivery, and out-of-order pulls — proven in a pure unit test.
A reference sync server (10E) and native persistence (10F) are research-track follow-ups.

Phase 10C (Continuum — CRDT conflict resolution): `@mindees/data` has
state-based CRDTs — a per-field HLC-stamped LWW-Register/Map (same-stamp ties broken by
content) and an add-wins OR-Set — all `fast-check`-proven convergent + pollution-safe.

Phase 10B (Continuum — causality primitives): `@mindees/data` has a
Hybrid Logical Clock (`createClock` — monotonic total causal order, injected physical
clock, counter-overflow + untrusted-remote drift guards, lexicographically-sortable
encoding) and version vectors, exhaustively property-tested (fast-check).

Phase 10A (Continuum — reactive local-first store): `@mindees/data`
ships `createCollection`: a signals-native, in-memory document store with
fine-grained reactive reads (`get`/`has`/`all`/`where`/`size`), atomic mutations
(`insert`/`upsert`/`update`/`delete`/`clear`/`tx`), and optimistic changes with
`rollback()`. Built on `@mindees/core` signals only (zero new deps). HLC causality
(10B), CRDT conflict resolution (10C), and the delta-sync engine (10D) build on it;
on-device native persistence + a production sync server are research tracks.

Phase 9 (Pulse) complete: `@mindees/updates` ships the signed-OTA core (9A),
differential downloads (9B), the reference update server (9C), and **SDUI** (9D) at the
`@mindees/updates/sdui` subpath — `compileSdui` turns an allowlisted, schema-versioned
JSON tree into a `@mindees/core` `MindeesNode` (named actions + reactive bindings, no
`eval`, prototype-pollution-safe, hard limits), plus pure-TS RFC 7396 merge-patch and a
safe RFC 6902 subset for incremental updates (re-validated before render). The WASM
module runtime stays a 🔬 research track.

Phase 9C (Pulse — reference update server): `@mindees/updates` exposes a
**pure, capability-injected update server core** at the `@mindees/updates/server`
subpath (`createUpdateServer`): `resolveUpdate` does channel selection, deterministic
staged rollout, an anti-downgrade mirror, freeze (expiry), and rollback directives;
`getAsset` serves content-addressed blobs (incl. deltas). It **never signs** (serves
pre-signed manifests only). A runnable `node:http` adapter lives in
`examples/pulse-server/`.

Phase 9B (Pulse — differential bundle diffing): `@mindees/updates` ships a
**zero-dependency, pure-TS byte-level delta codec** (`diff` build-side, `applyDelta`
on-device): a changed asset can be shipped as just its delta against a base blob the
client already holds, reconstructed on-device and verified against the manifest's
SHA-256 (a bad/forged delta can never install — it falls back to a full download).

Phase 9A (Pulse — signed OTA core): `@mindees/updates` ships the
working core an app embeds for over-the-air updates: a versioned, hash-addressed
manifest; Ed25519 signing/verification (threshold + key rotation, pure-JS `@noble`,
runs on Hermes/RN); a content-addressed store; and an update client with atomic
generations + crash-loop rollback (verify → download → atomic apply → boot-recovery).

Phase 8E (Helix native strand — on-device render verification): the
JS side has both halves of the native path: the **native command backend**
(`createNativeCommandBackend()`, Phase 8A) and a strict **reference host**
(`createReferenceHost()`, Phase 8B). The real host projects in `examples/native-hosts/`
are **CI-verified** to compile + pass their conformance cores (iOS `swift test` + iOS-SDK
compile, Phase 8C; Android `gradle test` + `assembleDebug`, Phase 8D) **and to render
the command stream into correct native view trees on the platform runtime** (Phase 8E):
an iOS Simulator XCTest asserts the real `UIView` hierarchy, and an Android Robolectric
test asserts the real `android.view` hierarchy (incl. click dispatch via `performClick()`).
**What is NOT yet done: a full app on a physical device** — there is no embedded JS
engine / JS↔native bridge running the reactive app on-device, so **you cannot build a
native mobile app end-to-end with MindeesNative today** — that is Phase 8F.

Phase 7 (Quantum Router II) — complete (render integration +
data/guards/transitions). `@mindees/router` renders (`createRouterView` —
fine-grained, layout-preserving nested rendering; `createLink` — typed links) and
now also does **data loaders** with stale-while-revalidate caching, `AbortSignal`
cancellation, `invalidate()` and `preload()` (intent prefetch); **navigation
guards** (`beforeNavigate` cancel/redirect + idempotent navigation); and **web
view transitions** (`document.startViewTransition`, feature-detected, SSR/native-
safe). Built on `@mindees/core` (the renderer is a test-only devDependency).
Still deferred (not exported): the global typed route registry, file-based route
scanning + bundler plugin, per-key fine-grained loader signals, and native
shared-element transitions.

Phase 6 (Router I) shipped the typed routing core: codegen-free typed path params
(template-literal types), Standard-Schema-validated typed search params (any
Zod/Valibot/ArkType schema, zero runtime dep), a signals-native router with typed
+ relative navigation and selector-isolated route state, dynamic reconfiguration
without state reset, and injectable history (memory + browser).

## Legend

| Badge | Meaning |
| --- | --- |
| ✅ **Stable** | Implemented, tested, documented; safe to rely on (within `0.x`). |
| 🧪 **Experimental** | Implemented but API may change; use with care. |
| 🔬 **Research track** | Not implemented. Public symbols (if any) throw `NotImplementedError` and are marked `@experimental`. |
| 📋 **Planned** | Not started; design pending. |
| 🚧 **Scaffold** | Package exists and builds, but exports only metadata (`name`, `VERSION`, `maturity`, `info`), the `Maturity`/`PackageInfo` status types, and `NotImplementedError` / `notImplemented` utilities. |

## Project-level

| Capability | Status |
| --- | --- |
| Monorepo + workspaces | ✅ done (Phase 0) |
| Open-source governance (license, CoC, security, contributing, RFCs) | ✅ in place |
| Verified toolchain (pnpm/turbo/ts/biome/vitest/changesets) | ✅ done (Phase 0) |
| CI (lint + typecheck + test + build) | ✅ done (Phase 0) |
| Reactivity (signals/computed/effect/batch) | ✅ done (Phase 1) — `@mindees/core` |
| Component model + selector-isolated context | ✅ done (Phase 2) — `@mindees/core` |
| Priority scheduler + thread-pool abstraction | ✅ done (Phase 2) — `@mindees/core` (native threads 🔬) |
| Reactive renderer + web/DOM backend + SSR/hydration | ✅ done (Phase 3) — `@mindees/renderer` (native + GPU canvas 🔬) |
| Native command backend (element tree + reactive updates → serializable `NativeCommand` stream) | ✅ done (Phase 8A) — `@mindees/renderer` |
| Native host conformance contract (strict reference host: replay + validate the command stream) | ✅ done (Phase 8B) — `@mindees/renderer` |
| Native host projects compile + conformance core verified in CI (iOS `swift test`/iOS compile; Android `gradle test`/`assemble`) | ✅ done (Phase 8C iOS, 8D Android) — `examples/native-hosts/` |
| Native hosts render the command stream into correct native view trees, verified in CI (iOS Simulator XCTest; Android Robolectric incl. click dispatch) | ✅ done (Phase 8E) — `examples/native-hosts/` (full app on a physical device over a JS↔native bridge 🔬, Phase 8F) |
| Compiler: type-check gate + TSX transform + tree-flatten + route manifest | ✅ done (Phase 4) — `@mindees/compiler` (TS→native AOT 🔬) |
| CLI: create + build + doctor + info + dev orchestrator; `npm create mindees` | ✅ done (Phase 5) — `@mindees/cli` + `create-mindees` (dev HTTP/HMR transport = preview) |
| Router: typed params + validated typed search + signals-native state + typed/relative navigation | ✅ done (Phase 6) — `@mindees/router` |
| Router render integration: nested routes, `createRouterView` (layout-preserving), typed `createLink` | ✅ done (Phase 7) — `@mindees/router` |
| Router data/guards/transitions: SWR loaders + prefetch + invalidate, guards (cancel/redirect/idempotent), view transitions | ✅ done (Phase 7) — `@mindees/router` (typed registry, file-scan 📋) |
| Signed OTA core: hash-addressed manifest, Ed25519 signing/verify (threshold + rotation), content-addressed store, atomic generations + crash-loop rollback | ✅ done (Phase 9A) — `@mindees/updates` |
| Differential bundle diffing: zero-dep pure-TS byte-level delta (`diff`/`applyDelta`), delta-download with verify-after-apply + full-fetch fallback | ✅ done (Phase 9B) — `@mindees/updates` |
| Reference update server: pure injected `createUpdateServer` (channel selection, deterministic staged rollout, anti-downgrade, freeze, rollback directives, `getAsset`) — never signs; `node:http` adapter example | ✅ done (Phase 9C) — `@mindees/updates/server` + `examples/pulse-server/` |
| Server-driven UI (SDUI): `compileSdui` (allowlisted JSON tree → `MindeesNode`, named actions + reactive `$bind`, no `eval`, prototype-pollution-safe, hard limits) + RFC 7396 merge-patch + safe RFC 6902 subset (re-validated before render) | ✅ done (Phase 9D) — `@mindees/updates/sdui` (WASM module runtime 🔬) |
| Local-first reactive store: `createCollection` (signals-native fine-grained reactive reads, atomic mutations + `tx`, optimistic + rollback) | ✅ done (Phase 10A) — `@mindees/data` (native persistence + sync server 🔬) |
| Causality primitives: Hybrid Logical Clock (`createClock`/`compareHlc`/`encodeHlc`, monotonic total order, drift-guarded) + version vectors (`vvMerge`/`vvDominates`/…) | ✅ done (Phase 10B) — `@mindees/data` |
| CRDT conflict resolution: per-field LWW-Register/Map (HLC-stamped, content-tiebroken) + add-wins OR-Set — commutative/associative/idempotent/convergent (fast-check), prototype-pollution-safe | ✅ done (Phase 10C) — `@mindees/data` |
| Local-first delta sync: idempotent HLC `Op`s, a convergent `MutationLog`, a `SyncTransport` contract + in-memory hub, and `createSyncEngine` (optimistic local writes + push/pull/merge) — two peers converge offline | ✅ done (Phase 10D) — `@mindees/data` |
| Reference sync server + persistence: `createSyncServer` over an injected `OpLogStore` (`@mindees/data/server`) + `node:http` example; `Persistence` + engine `export()`/restore (durable replicas resume with stable identity) | ✅ done (Phase 10E/10F) — `@mindees/data` + `examples/data-sync-server/` (native persistence + CRDT-lib interop 🔬) |

## Per-package

| Package | Maturity | Notes |
| --- | --- | --- |
| `@mindees/core` | 🧪 Experimental | Phase 1 reactivity + Phase 2 component model, selector-isolated context, priority scheduler & thread-pool (Web Worker + inline). Native multi-threading is 🔬. |
| `@mindees/compiler` | 🧪 Experimental | MDC build-time optimizer (type-check gate, TSX→createElement, tree-flattening, per-route manifest, plugin API) on the TS Compiler API shipped in Phase 4. TS→native AOT is 🔬. |
| `@mindees/cli` | 🧪 Experimental | Forge CLI shipped in Phase 5: create (+ templates), build (via the compiler), doctor, info, dev rebuild-orchestrator. **Phase 11D** adds `mindees ai explain <error>` — a dev-time error explainer over Synapse's `explainError` (server backend wired from `MINDEES_AI_*` env; deterministically testable with the mock). Live dev-server HTTP/HMR transport is a preview. |
| `@mindees/router` | 🧪 Experimental | Quantum Router I (Phase 6) + II (Phase 7). I: codegen-free typed path params, Standard-Schema validated typed search params, signals-native router state with selector isolation, typed + relative navigation, dynamic reconfiguration, memory + browser history. II: nested route tree + match chain, `createRouterView` (fine-grained, layout-preserving nested rendering), typed `createLink`, SWR data loaders (+ AbortSignal, `invalidate`, `preload`), navigation guards (cancel/redirect/idempotent), web view transitions. Deferred 📋: global typed route registry, file-based scanning + bundler plugin, per-key fine-grained loader signals, native shared-element transitions. |
| `@mindees/renderer` | 🧪 Experimental | Helix reconciler + web/DOM backend + SSR/hydration + headless backend shipped in Phase 3. **Phase 8A** added the native command backend (`createNativeCommandBackend()`): a serializable `NativeCommand` protocol + a `HostBackend` that emits it (events as stable handler ids; subtree-safe disposal). **Phase 8B** added `createReferenceHost()`: a strict reference host that replays + validates the stream — the conformance contract real native hosts implement. The `examples/native-hosts/` iOS + Android host projects compile + pass their conformance cores in CI (Phase 8C/8D) and render the command stream into correct native view trees on the platform runtime (iOS Simulator XCTest; Android Robolectric — Phase 8E). A full app on a physical device over a JS↔native bridge (Phase 8F) + GPU canvas are 🔬. |
| `@mindees/atlas` | 🧪 Experimental | Atlas UI primitives shipped in Phase 12A: accessible, signals-native `View`/`Text`/`Image`/`TextInput`/`Pressable`/`Button`/`Stack`/`Row`/`Column`/`Spacer`/`ScrollView` — function components over `@mindees/core` `createElement` returning renderer-agnostic `MindeesNode` trees (web real via the Helix DOM backend; native 🔬). One curated cross-platform `StyleObject` + `flattenStyle` (numbers → `px` on web via the renderer, raw on native), `Reactive<T>` props (a function value is a fine-grained binding), typed accessibility lowered to `role`/`aria-*`, `Pressable` interaction state (`usePressable`) wired via **real** DOM events (`onPress` invoked from `click`/Enter/Space — never a fake `press` host prop that no-ops on web), and a structural theme on the `@mindees/atlas/theme` subpath (selector-isolated; no `@mindees/tokens` dep). **Phase 12B** adds a virtualized recycling `List` on the `@mindees/atlas/list` subpath: a fixed pool of per-slot reactive regions (not `items.map()`, which the reconciler would fully remount on each scroll) so in-view rows keep identity and `renderItem` runs once per row as it scrolls in; a pure exhaustively-tested `computeWindow`, a spacer-sized scrollbar, `transform`-positioned rows, `onEndReached`, and a `getScrollOffset` seam make it headless-testable with zero real scroll (fixed row height; variable height is a 🔬 research track). `@mindees/core` runtime dep only (renderer is a peer). **Phase 12 (Atlas) complete.** Native rendering is a 🔬 research track. |
| `@mindees/ai` | 🧪 Experimental | Synapse AI: the contract (Phase 11A) — `createAi` + the `AiBackend` seam (messages/parts, `GenerateRequest`/`AiResult`/`AiChunk`, `AiError`), streaming as `AsyncIterable` only (Node/browser/Hermes-safe), a deterministic `createMockBackend` (offline, no-keys — the working fallback), and a `createOnDeviceBackend` research-track seam that throws. **Phase 11B** adds a real server/HTTP backend on the `@mindees/ai/server` subpath: `createServerBackend({ fetch, baseUrl, model, … })` over an **injected `fetch`** (capability injection — no global/DOM dep), a pure-TS SSE→`AsyncIterable` parser (buffers across chunk boundaries, joins multi-line `data:`, caps the unparsed buffer against newline-starved servers), and defensive openai/anthropic wire mappers (untrusted-JSON-safe, null-proto finish maps, streamed-usage capture) — golden-fixture tested with zero real network, abort honored before and mid-stream. **Phase 11C** adds **structured output**: `generateObject`/`streamObject` validate model JSON against any Standard Schema (Zod/Valibot/ArkType — vendored types, no `@mindees/router` dep) built purely on `AiBackend` so the mock runs it offline; no `eval`, deep sanitize-before-validate (prototype-pollution + depth/node/string/prop limits), bounded repair (`1 + maxRepairs`, concrete issues fed back, usage accumulated), `streamObject` validates the assembled value once at stream end with opt-in unvalidated previews — **plus tool calling**: `runTools` is a bounded loop (step = one `generate` with a hard `maxSteps` ceiling; tool args deep-pollution-rejected + Standard-Schema-validated **before** `execute`; invalid args fed back recoverably while `TOOL_FAILED` is reserved for an `execute` throw; identical calls deduped; parallel execution appended in requested order; four-point abort; non-mutating transcript), with a scripted-tool mock and openai/anthropic tool wire mapping (`tool_calls`/`tool_use`, with the loop's tool messages round-tripped). **Phase 11D** adds a build/dev-only error explainer on the `@mindees/ai/devtools` subpath: `explainError(backend, error)` turns a thrown error into a validated `{ summary, likelyCauses, suggestedFixes }` via `generateObject` (works offline against the mock), plus `formatExplanation` for terminals — surfaced as the `mindees ai explain <error>` CLI command. `@mindees/core` only. **Phase 11 (Synapse) complete.** On-device LLM inference is inherently native → 🔬. |
| `@mindees/data` | 🧪 Experimental | Continuum reactive local-first store shipped in Phase 10A: `createCollection` — a signals-native, in-memory document store with fine-grained reactive reads (`get`/`has`/`all`/`where`/`size` via per-record + per-collection version signals), atomic mutations (`insert`/`upsert`/`update`/`delete`/`clear`/`tx`), and `optimistic()` changes with `rollback()`. `@mindees/core` only; zero third-party deps. HLC causality (10B), CRDT merge (10C), and delta sync (10D) build on it. Native persistence + production sync server + rich-text CRDTs are 🔬 research tracks. |
| `@mindees/updates` | 🧪 Experimental | Pulse signed-OTA core (Phase 9A): a versioned hash-addressed `UpdateManifest`, Ed25519 `signManifest`/`verifySignedManifest` (≥-threshold distinct trusted keys → key rotation + multi-party signing; detached canonical bytes; pure-JS `@noble`, no WebCrypto/native dep), a content-addressed `UpdateStorage` (blobs by SHA-256 ⇒ unchanged assets aren't re-downloaded) + `createMemoryStorage()`, and `createUpdateClient()` with check/download/apply/boot/notifyReady/rollback — atomic generations, monotonic-version + expiry + runtime gates, and readiness-handshake crash-loop rollback to previous → embedded. **Phase 9B** adds a zero-dep pure-TS byte-level delta codec (`diff`/`applyDelta`, rolling-hash COPY/INSERT) and a `download()` delta path (`AssetEntry.patch`): reconstruct a changed asset from a delta against a stored base, gated by the existing post-apply SHA-256 check with a full-fetch fallback. **Phase 9C** adds the `@mindees/updates/server` subpath — a pure, capability-injected `createUpdateServer` (channel selection, deterministic staged rollout, anti-downgrade mirror, freeze, rollback directives, `getAsset`) that never signs (serves pre-signed manifests), with a runnable `node:http` adapter in `examples/pulse-server/`. **Phase 9D** adds the `@mindees/updates/sdui` subpath — `compileSdui` (allowlisted, schema-versioned JSON tree → `@mindees/core` `MindeesNode`; named actions + reactive `$bind`; no `eval`; prototype-pollution-safe; hard depth/node/string/prop limits) + pure-TS RFC 7396 merge-patch and a safe RFC 6902 subset (`add`/`remove`/`replace`), re-validated before render. **Phase 9 (Pulse) complete.** WASM module runtime is 🔬. |
| `create-mindees` | 🧪 Experimental | `npm create mindees` scaffolder shipped in Phase 5; delegates to `@mindees/cli`'s tested core. |

## Standing research tracks (the honest frontier)

These are real seams in the architecture, deliberately **not** faked. Each has
(or will have) a documented working fallback:

- **TypeScript → native machine code (AOT).** Fallback: typed paths optimized,
  dynamic paths run on an embedded engine / the web target. _(Phase 4)_
- **Native iOS/Android renderer backends.** The platform-neutral **native command
  backend** (Phase 8A) plus a strict **reference host** that replays + validates the
  command stream (Phase 8B) are implemented and tested. The real **iOS (SwiftPM) and
  Android (Gradle) host projects** in `examples/native-hosts/` now **compile + pass
  their conformance cores in CI** (macOS runner: iOS `swift test` + iOS-SDK compile,
  Phase 8C; Linux runner: Android `gradle test` + `assemble`, Phase 8D), **and render
  the command stream into correct native view trees on the platform runtime** (iOS
  Simulator XCTest; Android Robolectric incl. click dispatch — Phase 8E). What remains
  🔬 is a **full app on a physical device** (embedded JS engine + JS↔native bridge
  running the reactive app on-device) — Phase 8F. Fallback today: web/DOM.
  _(Phase 3, 8A, 8B, 8C, 8D, 8E)_
- **GPU canvas strand (wgpu/WebGPU).** _(Phase 3+)_
- **On-device LLM runtime (ExecuTorch / Apple Foundation Models / Gemini Nano).**
  Fallback: deterministic mock + server backend. _(Phase 10)_
- **Sandboxed WASM Component-Model module runtime.** Fallback: first-party
  modules + a validated declarative subset. _(Phases 8/11)_

> If you find any symbol in this repo that claims to do something it doesn't,
> that's a bug — please open an issue. Honesty is a feature.
