# @mindees/renderer

**Helix** — MindeesNative's renderer. It turns the `@mindees/core` element tree
into host nodes through a swappable **host backend**, with **fine-grained
reactive bindings**: a changing signal patches exactly the affected
attribute/text/region — no virtual-DOM diffing.

> **Status: 🧪 Experimental (Phase 3).** Implemented and tested: the reconciler,
> the **web/DOM backend**, **SSR + hydration**, and a **headless** test backend.
> Native (iOS/Android) and the GPU canvas are **research tracks** that throw
> `NotImplementedError`. APIs may change before `1.0`.

## Why Helix

- **Fine-grained updates** — built on `@mindees/core` signals: updates are
  O(what-changed), not O(tree). A reactive text node is patched in place; a
  reactive prop sets exactly one attribute.
- **Real SSR + SEO** — `renderToString` emits crawlable HTML (`view`→`div`,
  `text`→`span`, …), unlike canvas-based web renderers. `hydrate` attaches
  reactivity on the client.
- **Backend-agnostic** — the reconciler speaks only the `HostBackend` contract,
  so a new platform is "implement `HostBackend<N>`." DOM + headless ship today.

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
| `createNativeBackend` / `createCanvasBackend` | fn | 🔬 research tracks — throw `NotImplementedError`. |

### Reactive bindings

Pass a **function** as a child or prop value to make it reactive:

```ts
h('view', { class: () => theme() }, () => label())
//          ^ reactive prop           ^ reactive child region
```

Static values (`h('view', { id: 'x' }, 'hello')`) are applied once.

## License

`MIT OR Apache-2.0`
