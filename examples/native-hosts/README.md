# MindeesNative — Reference Native Host Stubs

> **Status: reference stubs, not production hosts.** These files show *how* a
> native platform consumes the MindeesNative **native command protocol**
> (`@mindees/renderer`'s `native-protocol.ts`). They are intentionally minimal,
> are **not** wired into an Xcode/Gradle project, are **not** compiled in CI, and
> do **not** render a real app yet. They exist to make the protocol concrete and
> to define the contract Phase 8B/8C will implement for real.

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

## The command stream

| Command | Host action |
|---|---|
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

## Files

- [`ios/MindeesNativeHost.swift`](ios/MindeesNativeHost.swift) — a reference iOS
  host: decodes commands, maps `view`→`UIView`, `text`→`UILabel`, stores nodes by
  id, exposes an event callback. Props/accessibility are placeholders.
- [`android/MindeesNativeHost.kt`](android/MindeesNativeHost.kt) — the Android
  equivalent: `view`→`LinearLayout`, `text`→`TextView`.

## What is implemented vs. future

| | Status |
|---|---|
| Native **command protocol** (TypeScript) | ✅ implemented + tested (`@mindees/renderer`) |
| Command-stream **backend** | ✅ implemented + tested |
| Reference host stubs (this folder) | 📄 illustrative only — not compiled, not runnable |
| Real iOS host (compiled, renders) | ⏳ Phase 8B |
| Real Android host (compiled, renders) | ⏳ Phase 8C |
| End-to-end native example app | ⏳ Phase 8D |

**You cannot build a real mobile app with MindeesNative today.** The native
rendering *path* exists (element tree → reactive updates → native command
stream); a real host that draws those commands to the screen is the next phase.
