# @mindees/renderer

**Helix** — MindeesNative's renderer. It turns the `@mindees/core` element tree
into host nodes through a swappable **host backend**, with **fine-grained
reactive bindings**: a changing signal patches exactly the affected
attribute/text/region — no virtual-DOM diffing.

> **Status: 🧪 Experimental.** Implemented and tested: the reconciler, the
> **web/DOM backend**, **SSR + hydration**, a **headless** test backend, the
> **Helix Canvas strand** (`createCanvas2DBackend()` — a reconciler-driven 2D
> scene graph), a **native command backend** (`createNativeCommandBackend()`), a
> one-call native entry (`createNativeApp()`), and a strict reference host
> (`createReferenceHost()`). The same TypeScript app now runs **end to end on a
> real Android emulator (embedded QuickJS bridge) and a real iOS simulator
> (JavaScriptCore)** — both CI-verified — with native events that carry values
> (e.g. `onChangeText` delivers the typed text). The **GPU** canvas
> (wgpu/WebGPU) and a direct in-process runtime native backend remain **research
> tracks**; the `createNativeBackend()` and `createCanvasBackend()` seams throw
> `NotImplementedError`. APIs may change before `1.0`.

## Install

```bash
pnpm add @mindees/renderer
```

## Why Helix

- **Fine-grained updates** — built on `@mindees/core` signals: updates are
  O(what-changed), not O(tree). A reactive text node is patched in place; a
  reactive prop sets exactly one attribute.
- **Real SSR + SEO** — `renderToString` emits crawlable HTML (`view`→`div`,
  `text`→`span`, …), unlike canvas-based web renderers. `hydrate` attaches
  reactivity on the client.
- **Backend-agnostic** — the reconciler speaks only the `HostBackend` contract,
  so a new platform is "implement `HostBackend<N>`." DOM, headless, the 2D Canvas
  strand, the native command stream (running on a real Android emulator + iOS
  simulator via embedded JS), and reference-host validation all ship today.

## Quick start

```ts
import { signal, createElement as h } from '@mindees/core'
import { createDomBackend, render } from '@mindees/renderer'

function Counter() {
  const n = signal(0)
  return h('button', { onClick: () => n.set(n() + 1) }, () => `count: ${n()}`)
}

const backend = createDomBackend() // uses the global document in a browser
const app = render(Counter, {}, backend, document.getElementById('app'))
// app.dispose() unmounts and tears down every reactive binding (no leaks)
```

### Server-side rendering

```ts
import { renderToString, hydrate } from '@mindees/renderer'

const html = renderToString(Counter, {}) // '<button>count: 0</button>'
// …send `html` in your server response, then on the client:
hydrate(document.getElementById('app'), Counter, {})
```

### Native command backend (Phase 8A)

The same reconciler can target a native host. `createNativeCommandBackend()`
implements the `HostBackend` contract but, instead of touching a DOM, records a
stream of serializable [`NativeCommand`](./src/native-protocol.ts)s
(`createNode`, `insertChild`, `setProp`, `updateText`, `disposeNode`, …) that a
native host (UIKit and Android View today; other surfaces later) can replay. It
runs in Node — no DOM — so the whole native path is testable.

```ts
import { createNativeCommandBackend, render } from '@mindees/renderer'

const backend = createNativeCommandBackend()
const app = render(Counter, {}, backend, backend.root)
const commands = backend.flushCommands() // ship this batch to a native host
// Event handlers cross as stable ids, never as functions; the host calls back:
// backend.dispatchEvent(handlerId, event)
```

> This is the engine behind native rendering — it produces the command stream,
> and the host projects in
> [`examples/native-hosts/`](https://github.com/mindees/mindees/tree/main/examples/native-hosts)
> replay/render that stream. Phase 8F is **done**: those hosts now embed a JS
> engine (QuickJS on Android, JavaScriptCore on iOS) plus a JS↔native bridge that
> runs the reactive app **on-device**, so the same app renders + is interactive on
> a real Android emulator and iOS simulator in CI. For an app you'd use the
> higher-level [`createNativeApp()`](#one-call-native-entry-createnativeapp) below
> rather than wiring the command backend by hand.

### Reference host + conformance contract (Phase 8B)

`createReferenceHost()` is the **inverse** of the command backend: it consumes a
`NativeCommand` stream, reconstructs the view tree, and **strictly validates** it
(throws `NativeHostError` on any malformed/leaking sequence). It is the executable
**contract** a real native host implements (in Swift/Kotlin against platform
views). Piping the backend through it proves the stream is valid and non-leaking
end to end:

```ts
import { createNativeCommandBackend, createReferenceHost, render } from '@mindees/renderer'

const host = createReferenceHost()
const backend = createNativeCommandBackend({ rootId: host.rootId, onCommand: (c) => host.apply(c) })
const app = render(Counter, {}, backend, backend.root)
host.serialize()      // the reconstructed tree, e.g. '<button>count: 0</button>'
host.liveNodeCount()  // 0 after app.dispose() — no orphaned/leaked nodes
```

### One-call native entry (`createNativeApp`)

`createNativeApp(<App />)` is the whole entry file for a MindeesNative app on an
embedded native host. It wires the command backend, renders the root, flushes the
initial batch, and exposes the `start()` / `dispatchEvent()` / `frameTick()`
contract the host calls — so on-device it also makes **animations + concurrency
work by default** (it installs the reactive scheduler and a vsync-driven frame
source that runs **only while something is animating**, battery-friendly). Native
events can **carry values**: `dispatchEvent(handlerId, text)` wraps `text` as
`{ target: { value } }` so handlers read it via the standard event shape.

```tsx
import { createNativeApp } from '@mindees/renderer'
import { App } from './App'

createNativeApp(<App />) // host injects MindeesHost.emit + calls MindeesApp.start()
```

The Android (QuickJS) and iOS (JavaScriptCore) hosts in `examples/native-hosts/`
run exactly this on a real emulator/simulator in CI.

### Canvas strand (`createCanvas2DBackend`)

The **same reconciler** can drive a retained-mode 2D scene graph — Flutter-grade
pixel control exactly where you want it. A `canvas-rect` / `canvas-circle` /
`canvas-line` / `canvas-text` subtree is built + fine-grain-diffed by Helix, and
`paint(ctx, w, h)` rasterizes it. The 2D context is an interface, so a real
`CanvasRenderingContext2D` satisfies it on web today and a WebGPU rasterizer can
drive the same scene later without touching app code (the **GPU** backend itself
is still a research track — see `createCanvasBackend` below).

```ts
import { createElement as h } from '@mindees/core'
import { createCanvas2DBackend, render } from '@mindees/renderer'

const backend = createCanvas2DBackend({ onDirty: () => requestRepaint() })
render(() => h('canvas-rect', { x: 8, y: 8, width: 64, height: 64, fill: '#09f' }), backend, backend.root)
backend.paint(ctx, 320, 240) // once for static art, or on a frame loop for animation
```

## API

| Export | Kind | Description |
| --- | --- | --- |
| `render(node\|component, [props,] backend, container)` | fn | Mount a tree; returns `Mounted` with `dispose()`. |
| `renderToString(node\|component, [props])` | fn | SSR → crawlable HTML string. |
| `hydrate(container, node\|component, [props,] opts?)` | fn | Attach reactivity to server HTML (developer preview). |
| `createDomBackend(doc?)` | fn | Web/DOM `HostBackend`. |
| `createHeadlessBackend()` / `createHeadlessRoot()` | fn | In-memory backend (tests, snapshots, SSR). |
| `createCanvas2DBackend(opts?)` | fn | Helix Canvas strand: reconciler-driven 2D scene graph; `paint(ctx, w, h)` rasterizes. |
| `domTagFor(tag)` | fn | Map a semantic tag to its HTML tag. |
| `HostBackend` / `SerializableBackend` | type | The platform seam. |
| `createNativeCommandBackend(opts?)` | fn | Native `HostBackend` that emits a serializable `NativeCommand` stream (Phase 8A). |
| `createNativeApp(node, opts?)` | fn | One-call native entry: wires the command backend + reactive engines + host contract (`start`/`dispatchEvent`/`frameTick`). |
| `createReferenceHost(rootId?)` | fn | Strict reference host: replays + validates a `NativeCommand` stream (Phase 8B). |
| `NativeCommand` + `isNativeCommand` / `isNativePropValue` / `normalizeNativeProp` / `createNativeNodeIdFactory` | type/fn | The native command protocol + helpers. |
| `createNativeBackend` / `createCanvasBackend` | fn | 🔬 research tracks (direct in-process runtime native backend + GPU/WebGPU canvas) — throw `NotImplementedError`. |

### Reactive bindings

Pass a **function** as a child or prop value to make it reactive:

```ts
h('view', { class: () => theme() }, () => label())
//          ^ reactive prop           ^ reactive child region
```

Static values (`h('view', { id: 'x' }, 'hello')`) are applied once.

## License

`MIT OR Apache-2.0`
