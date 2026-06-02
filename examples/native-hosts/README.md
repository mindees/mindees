# MindeesNative — Reference Native Hosts

> **Status: authored, pending verification — not production hosts.** These are real
> Swift / Gradle projects that show how a native platform consumes the MindeesNative
> **native command protocol** (`@mindees/renderer`'s `native-protocol.ts`). They are
> **not** compiled or run by the maintainers (no macOS/Android toolchain in dev/CI)
> and do **not** render a real app yet. Each has a device-free, unit-testable core
> (the command-apply + strict-validation logic) plus the platform renderer — build,
> run, and verify them yourself, then the compiled+verified hosts become Phase 8C/8D.

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
> sequence. The stubs below implement exactly those semantics against UIKit /
> Jetpack Compose. When a real compiled host is built (Phase 8C/8D), it is checked
> against that contract.

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

These are **real, buildable** host projects (not single-file stubs) — but they are
**authored, pending verification**: the maintainers have no macOS/Android toolchain,
so neither has been compiled or run here or in CI. Each has a testable, device-free
core (the command-apply + strict-validation logic, runnable via `swift test` /
`./gradlew test`) plus the platform renderer.

- [`ios/`](ios/README.md) — a **Swift package** (`MindeesNativeHost`). Decodes the
  command stream (`Codable`), applies + strictly validates it (mirroring the TS
  reference host), and renders via `UIKitRenderer` (`UIView`). `swift test` runs the
  core with an in-memory `ModelRenderer` — no simulator.
- [`android/`](android/README.md) — a **Gradle/Android library** (`dev.mindees.host`).
  Same host + strict validation, `NativeCommandCodec` (org.json), and an
  `AndroidViewRenderer` (`android.view`). `./gradlew :mindees-host:test` runs the
  core on the JVM — no device.

## What is implemented vs. future

| Piece | Status |
| --- | --- |
| Native **command protocol** (TypeScript) | ✅ implemented + tested (`@mindees/renderer`) |
| Command-stream **backend** | ✅ implemented + tested (Phase 8A) |
| **Reference host** + conformance contract (`createReferenceHost`) | ✅ implemented + tested (Phase 8B) |
| iOS host project (`ios/`) | 📄 authored — core unit-tested by you via `swift test`; not built here |
| Android host project (`android/`) | 📄 authored — core unit-tested by you via `./gradlew test`; not built here |
| iOS host **verified + runnable on a device** | ⏳ Phase 8C _(needs macOS/Xcode)_ |
| Android host **verified + runnable on a device** | ⏳ Phase 8D _(needs the Android SDK)_ |
| End-to-end native example app | ⏳ Phase 8E |

**You cannot build a real mobile app with MindeesNative today.** The native
rendering _path_ exists (element tree → reactive updates → native command stream,
validated by the reference host), and host projects exist for you to build/verify;
a verified host that draws those commands on a device is the next phase.
