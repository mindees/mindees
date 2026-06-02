# ADR-0007: Native host as a strict conformance contract with a verifiable reference host (Phase 8B)

- **Status:** Accepted
- **Date:** 2026-06-03

## Context

Phase 8A (ADR-0006) shipped the native **command backend**: the reconciler +
fine-grained reactivity now emit a serializable `NativeCommand` stream. The next
step toward native rendering is a **host** that consumes that stream and builds
real platform views (SwiftUI/UIKit on iOS, Jetpack Compose/View on Android).

A genuinely *compiled, running* iOS or Android host cannot be built or verified in
this project's environment: development is on Windows + Node, and CI is Node-only
(Ubuntu, Node 22/24) — there is **no Swift/Xcode/macOS or Android SDK toolchain**,
and the maintainer has no Mac. The Working-Code Doctrine forbids claiming a feature
works without a test that proves it. So shipping a "compiled iOS host" now would be
an unverifiable claim — exactly what the project must not do.

What *can* be built and fully verified in Node is the part of a host that is
platform-independent: the **semantics** of applying the command stream to a view
tree, and the **invariants** a correct host must uphold (node identity, child
order, no orphaned/double-freed nodes, event wiring). That logic is identical
whether the nodes are model objects or UIViews.

## Decision

Define the native host as an explicit **conformance contract** and ship a strict,
fully-tested **reference host** in `@mindees/renderer` (`createReferenceHost`):

- It is the **inverse** of the command backend: it consumes a `NativeCommand`
  stream and reconstructs an in-memory view tree.
- It is **strict** — it throws `NativeHostError` on any malformed sequence
  (unknown/duplicate id, `removeChild` of a non-child, double `disposeNode`,
  out-of-range insert index, inserting an already-attached node, disposing the
  root). It therefore doubles as a **conformance validator**.
- Piping the command backend's output through it is an end-to-end check: it proves
  the backend emits a valid, non-leaking stream for real apps. (A strict host of
  this kind is precisely what would have caught the 8A double-dispose bug that a
  lenient host hid — see ADR-0006's review note.)

A real iOS/Android host is then defined as "implement these exact semantics, but
build platform views instead of model nodes." The reference host's behavior and
its test suite are the spec those hosts are checked against.

## Why this shape

- **It is verifiable today**, in Node, under `pnpm verify` — no toolchain, no Mac,
  no unverifiable claim.
- **It de-risks the real hosts**: the hard part (correct stream semantics + the
  no-orphan/no-double-free invariants) is nailed down and tested once, language-
  agnostically. A platform host author implements a thin view-binding layer and
  checks it against this contract.
- **It is honest**: it draws nothing and is documented as the host *contract*, not
  a running iOS app.

## Consequences

- `@mindees/renderer` exports `createReferenceHost` / `ReferenceHost` /
  `ReferenceHostNode` / `NativeHostError` alongside the command backend.
- The roadmap's compiled hosts are explicitly **toolchain-gated**: Phase 8C (iOS,
  needs macOS/Xcode) and Phase 8D (Android, needs the Android SDK) cannot be
  completed-and-verified until that toolchain is available. The reference Swift /
  Kotlin host stubs in `examples/native-hosts/` are illustrative and implement the
  semantics this reference host specifies.
- No new runtime dependencies; the web/DOM, headless, SSR, and command-backend
  behavior are unchanged (purely additive).
- Still true, and still said plainly in STATUS/README: **you cannot build a native
  mobile app end-to-end with MindeesNative yet.** This phase makes the host
  contract real and verified; it does not put pixels on a device.

## Alternatives considered

- **Ship a compiled iOS host now** — rejected: unverifiable in this environment and
  by the maintainer; would violate the doctrine.
- **Add a macOS/Swift CI job and author the host "blind"** — deferred: it would let
  CI verify Swift, but iterating without any local toolchain is slow and costly,
  and the platform-independent semantics (the high-value, bug-prone part) are
  better pinned down first in a language the whole team can run.
- **Only upgrade the reference stubs** — insufficient: stubs aren't executable or
  tested, so they prove nothing about stream correctness.
