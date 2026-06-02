# MindeesNative — Reference Native Hosts

> **Status: CI-compiled + conformance-core-tested — not yet on-device.** These are
> real Swift / Gradle projects that show how a native platform consumes the
> MindeesNative **native command protocol** (`@mindees/renderer`'s
> `native-protocol.ts`). They now **compile and pass their conformance cores in CI**
> (a macOS runner for iOS, a Linux+SDK runner for Android — Phase 8C/8D), but they do
> **not render on a real device yet** (no simulator/emulator UI test or JS↔native
> bridge — that's Phase 8E). Not production hosts.

## What this is

`@mindees/renderer` can render an app against `createNativeCommandBackend()`,
which turns the Helix element tree and fine-grained reactive updates into a
stream of serializable [`NativeCommand`](../../packages/renderer/src/native-protocol.ts)
objects:

```ts
import { createNativeCommandBackend, render } from '@mindees/renderer'

const backend = createNativeCommandBackend({
  onBatch: (commands) => bridge.send(commands), // ship to the native host
})
const app = render(MyComponent, {}, backend, backend.root)
// later: backend.flushCommands() returns and clears the buffered batch
```

A native host receives each batch (as JSON over whatever bridge you build) and
replays it against real platform views. The protocol carries **no functions** —
event handlers are registered by a stable `handlerId`, and the host calls back
into the runtime via `dispatchEvent(handlerId, event)` when a native event fires.

> **The host semantics are specified executably.** `@mindees/renderer` ships
> `createReferenceHost()` — a strict reference host (in TypeScript) that applies
> the same command stream to a model tree and throws on any malformed/leaking
> sequence. The projects below implement exactly those semantics against UIKit /
> Android View, and their conformance cores are checked against that contract in CI.

## The command stream

| Command | Host action |
| --- | --- |
| `createNode { id, tag }` | Create a container view for `tag` (`view`, `text`, `button`, …), store it by `id` |
| `createText { id, text }` | Create a text/label node, store it by `id` |
| `setProp { id, name, value }` | Apply a serializable prop (style/accessibility/…) |
| `removeProp { id, name }` | Clear a previously-set prop |
| `insertChild { parentId, childId, index }` | Insert `childId` into `parentId` at `index` |
| `removeChild { parentId, childId }` | Detach `childId` from `parentId` |
| `updateText { id, text }` | Update a text node's content |
| `disposeNode { id }` | Free the node (emitted for a removed node and each descendant) |
| `registerEvent { id, eventName, handlerId }` | Wire a native gesture/event → `dispatchEvent(handlerId)` |
| `unregisterEvent { id, eventName, handlerId }` | Remove the wiring |

Ordering guarantees from the backend: a node is always `create`d before it is
inserted or referenced; children are inserted at explicit indices; on removal the
node is detached (`removeChild`) and then it **and every descendant** are
`disposeNode`d (deepest-first), with event handlers unregistered — so a correct
host never leaks nodes or handlers.

## Projects

These are **real, buildable** host projects (not single-file stubs). Each has a
device-free, unit-tested core (command-apply + strict validation) plus the platform
renderer, and each is **compiled + its core tested in CI**:

- [`ios/`](ios/README.md) — a **Swift package** (`MindeesNativeHost`). Decodes the
  command stream (`Codable`), applies + strictly validates it (mirroring the TS
  reference host), and renders via `UIKitRenderer` (`UIView`). CI (macOS) runs
  `swift test` (core, via `ModelRenderer`) and compiles the package incl.
  `UIKitRenderer` for the iOS SDK.
- [`android/`](android/README.md) — a **Gradle/Android library** (`dev.mindees.host`).
  Same host + strict validation, `NativeCommandCodec` (org.json), and an
  `AndroidViewRenderer` (`android.view`). CI (Linux + Android SDK) runs
  `:mindees-host:test` and `:mindees-host:assembleDebug`.

## What is implemented vs. future

| Piece | Status |
| --- | --- |
| Native **command protocol** (TypeScript) | ✅ implemented + tested (`@mindees/renderer`) |
| Command-stream **backend** | ✅ implemented + tested (Phase 8A) |
| **Reference host** + conformance contract (`createReferenceHost`) | ✅ implemented + tested (Phase 8B) |
| iOS host project (`ios/`) — compiles + conformance core | ✅ verified in CI (macOS; Phase 8C) |
| Android host project (`android/`) — compiles + conformance core | ✅ verified in CI (Linux; Phase 8D) |
| Hosts **render on a real device** (simulator/emulator UI tests + JS↔native bridge) | ⏳ Phase 8E |
| End-to-end native example app | ⏳ Phase 8E |

**You cannot build a real mobile app with MindeesNative today.** The native
rendering _path_ exists and the host projects compile + pass their conformance cores
in CI, but **nothing renders on a device yet** — on-device rendering over a JS↔native
bridge is the next phase.
