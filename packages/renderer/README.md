# @mindees/renderer

**Helix** — MindeesNative's renderer. It turns the `@mindees/core` element tree
into host nodes through a swappable **host backend**, with **fine-grained
reactive bindings**: a changing signal patches exactly the affected
attribute/text/region — no virtual-DOM diffing.

> **Status: 🧪 Experimental.** Implemented and tested: the reconciler, the
> **web/DOM backend**, **SSR + hydration**, a **headless** test backend, a
> **native command backend** (`createNativeCommandBackend()`), a strict reference
> host (`createReferenceHost()`), and iOS/Android host projects that compile and
> render the command stream into native view trees in CI. A full end-to-end native
> app bridge/embedded JS engine and GPU canvas remain **research tracks**; the
> direct `createNativeBackend()` and `createCanvasBackend()` seams throw
> `NotImplementedError`. APIs may change before `1.0`.

## Why Helix

- **Fine-grained updates** — built on `@mindees/core` signals: updates are
  O(what-changed), not O(tree). A reactive text node is patched in place; a
  reactive prop sets exactly one attribute.
- **Real SSR + SEO** — `renderToString` emits crawlable HTML (`view`→`div`,
  `text`→`span`, …), unlike canvas-based web renderers. `hydrate` attaches
  reactivity on the client.
- **Backend-agnostic** — the reconciler speaks only the `HostBackend` contract,
  so a new platform is "implement `HostBackend<N>`." DOM, headless, native command
  stream, and reference-host validation ship today.

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

> This is the **foundation** for native rendering — it produces the command
> stream, and the host projects in
> [`examples/native-hosts/`](https://github.com/mindees/mindees/tree/main/examples/native-hosts)
> replay/render that stream in CI. You cannot build a native mobile app
> end-to-end yet because Phase 8F still needs an embedded JS engine plus a
> JS↔native bridge running the reactive app on-device.

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

## API

| Export | Kind | Description |
| --- | --- | --- |
| `render(node\|component, [props,] backend, container)` | fn | Mount a tree; returns `Mounted` with `dispose()`. |
| `renderToString(node\|component, [props])` | fn | SSR → crawlable HTML string. |
| `hydrate(container, node\|component, [props,] opts?)` | fn | Attach reactivity to server HTML (developer preview). |
| `createDomBackend(doc?)` | fn | Web/DOM `HostBackend`. |
| `createHeadlessBackend()` / `createHeadlessRoot()` | fn | In-memory backend (tests, snapshots, SSR). |
| `domTagFor(tag)` | fn | Map a semantic tag to its HTML tag. |
| `HostBackend` / `SerializableBackend` | type | The platform seam. |
| `createNativeCommandBackend(opts?)` | fn | Native `HostBackend` that emits a serializable `NativeCommand` stream (Phase 8A). |
| `createReferenceHost(rootId?)` | fn | Strict reference host: replays + validates a `NativeCommand` stream (Phase 8B). |
| `NativeCommand` + `isNativeCommand` / `isNativePropValue` / `normalizeNativeProp` / `createNativeNodeIdFactory` | type/fn | The native command protocol + helpers. |
| `createNativeBackend` / `createCanvasBackend` | fn | 🔬 research tracks (direct runtime native backend + GPU canvas) — throw `NotImplementedError`. |

### Reactive bindings

Pass a **function** as a child or prop value to make it reactive:

```ts
h('view', { class: () => theme() }, () => label())
//          ^ reactive prop           ^ reactive child region
```

Static values (`h('view', { id: 'x' }, 'hello')`) are applied once.

## License

`MIT OR Apache-2.0`
