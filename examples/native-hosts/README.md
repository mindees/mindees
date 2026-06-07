# MindeesNative - Reference Native Hosts

> **Status: CI-verified to compile + render correctly, with emulator/simulator bridge
> smoke tests - not yet physical-device proof.** These are real Swift / Gradle projects
> that show how a native platform consumes the MindeesNative **native command protocol**
> (`@mindees/renderer`'s `native-protocol.ts`). In CI they **compile + pass their
> conformance cores** (macOS for iOS, Linux+SDK for Android - Phase 8C/8D) **and render
> the command stream into correct native view trees on the platform runtime** (iOS
> Simulator XCTest; Android Robolectric, incl. click dispatch - Phase 8E). Android runs
> a **real multi-screen TypeScript app** (signals + Atlas + the Quantum router + the
> Helix reconciler, in embedded QuickJS) on an **API 35 emulator** in CI - it renders
> native views, reacts to input, and navigates between routes with state surviving the
> swap. iOS runs a JavaScriptCore counter app that renders the same shape and routes a
> `UIButton` `.touchUpInside` target/action callback in the iOS Simulator.
> **Native events carry values** (`onChangeText` delivers the field text). The renderers
> now have broad RN-style parity (flex, scroll + horizontal scroll, text composition +
> styling, images, TextInput, ActivityIndicator, elevation; Android adds per-corner radii
> and a full-screen portal **overlay** layer where Modal/Toast overlap the app content).
> Physical-device proof is still pending. Not production hosts.

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
replays it against real platform views. The protocol carries **no functions**:
event handlers are registered by a stable `handlerId`, and the host calls back
into the runtime via `dispatchEvent(handlerId, value)` when a native event fires.
Events carry a serializable value: a press is notify-only, while a TextInput
`input`/`change` delivers the field's current text (the JS layer wraps a non-nil
value as `{ target: { value } }`), so `onChangeText` receives it.

> **The host semantics are specified executably.** `@mindees/renderer` ships
> `createReferenceHost()` - a strict reference host (in TypeScript) that applies
> the same command stream to a model tree and throws on any malformed/leaking
> sequence. The projects below implement exactly those semantics against UIKit /
> Android View, and their conformance cores are checked against that contract in CI.

## The command stream

| Command | Host action |
| --- | --- |
| `createNode { id, tag }` | Create a container view for `tag` (`view`, `text`, `button`, ...), store it by `id` |
| `createText { id, text }` | Create a text/label node, store it by `id` |
| `setProp { id, name, value }` | Apply a serializable prop (style/accessibility/...) |
| `removeProp { id, name }` | Clear a previously-set prop |
| `insertChild { parentId, childId, index }` | Insert `childId` into `parentId` at `index` |
| `removeChild { parentId, childId }` | Detach `childId` from `parentId` |
| `updateText { id, text }` | Update a text node's content |
| `disposeNode { id }` | Free the node (emitted for a removed node and each descendant) |
| `registerEvent { id, eventName, handlerId }` | Wire a native gesture/event -> `dispatchEvent(handlerId, value)` (press = no value; input/change carry the field text) |
| `unregisterEvent { id, eventName, handlerId }` | Remove the wiring |

Ordering guarantees from the backend: a node is always `create`d before it is
inserted or referenced; children are inserted at explicit indices; on removal the
node is detached (`removeChild`) and then it **and every descendant** are
`disposeNode`d (deepest-first), with event handlers unregistered - so a correct
host never leaks nodes or handlers.

## Projects

These are **real, buildable** host projects (not single-file stubs). Each has a
device-free, unit-tested core (command-apply + strict validation) plus the platform
renderer, and each is **compiled + its core tested in CI**:

- [`ios/`](ios/README.md) - a **Swift package** (`MindeesNativeHost`). Decodes the
  command stream (`Codable`), applies + strictly validates it (mirroring the TS
  reference host), renders via `UIKitRenderer` (`UIView`), and includes a
  JavaScriptCore `MindeesRuntimeBridge`. CI (macOS) runs `swift test` (core + JSCore
  bridge, via `ModelRenderer`), compiles the package incl. `UIKitRenderer` for the
  iOS SDK, and runs the UIKit bridge smoke test on an iOS Simulator.
- [`android/`](android/README.md) - a **Gradle/Android library** (`dev.mindees.host`).
  Same host + strict validation, `NativeCommandCodec` (org.json), and an
  `AndroidViewRenderer` (`android.view`, on Google FlexboxLayout). CI (Linux + Android
  SDK) runs `:mindees-host:test` and `:mindees-host:assembleDebug`, plus a **real
  multi-screen example app** (signals + Atlas + the Quantum router + Helix in embedded
  QuickJS) whose instrumented test boots the Activity on an API 35 **emulator**, taps a
  native button, and navigates Home <-> About - asserting the native view tree updates
  and route state survives the swap.

The renderers map Atlas's curated cross-platform `StyleObject` onto native layout +
visuals with broad RN-style parity: flex (Android FlexboxLayout, iOS UIStackView),
vertical + horizontal scroll, text composition + styling, images (data-URI/asset),
TextInput (keyboard/secure/multiline + value-carrying `input`/`change`),
ActivityIndicator, the box model, background/radius/border, opacity, and elevation.
Android additionally implements per-corner radii and a full-screen portal **overlay**
layer (Modal/Toast overlap the app content). iOS has a few honest v1 gaps it documents:
flex-wrap, `space-around`/`evenly`, per-child `alignSelf`/`flexGrow`.

## What is implemented vs. future

| Piece | Status |
| --- | --- |
| Native **command protocol** (TypeScript) | implemented + tested (`@mindees/renderer`) |
| Command-stream **backend** | implemented + tested (Phase 8A) |
| **Reference host** + conformance contract (`createReferenceHost`) | implemented + tested (Phase 8B) |
| iOS host project (`ios/`) - compiles + conformance core | verified in CI (macOS; Phase 8C) |
| Android host project (`android/`) - compiles + conformance core | verified in CI (Linux; Phase 8D) |
| Hosts **render the command stream into correct native view trees** | verified in CI (iOS Simulator XCTest; Android Robolectric, incl. click dispatch; Phase 8E) |
| Android example app (embedded QuickJS + JS<->native command bridge) | Phase 8F-A/B; CI unit-tests bridge + assembles APK + runs a multi-screen, routed app (signals + Atlas + Quantum router + Helix) on an API 35 emulator |
| iOS embedded JavaScriptCore bridge + UIKit button smoke | Phase 8F-C; CI tests model bridge + runs an iOS Simulator counter smoke |
| Renderer parity (flex, scroll, text/styling, images, TextInput, ActivityIndicator, elevation; Android per-corner radii + overlay) | implemented + asserted by the platform render tests |
| Value-carrying native events (`onChangeText` etc.) | implemented + tested (both hosts) |
| Full app **on a physical device** | Phase 8F pending |

**You cannot ship a production mobile app with MindeesNative today.** But the host
projects compile, pass their conformance cores, and are verified to render the command
stream into correct native view trees in CI. Android runs a **real multi-screen,
file-based-routed TypeScript app** in an embedded QuickJS engine with **emulator smoke
testing in CI** (it navigates routes, reacts to input, and re-themes light/dark), and
iOS runs an embedded JavaScriptCore counter app with **iOS Simulator smoke testing in
CI**. What's still missing: physical-device proof and a published native host library
(Maven/SPM) - the rest of Phase 8F.
