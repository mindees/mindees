# @mindees/core

The reactive runtime foundation of MindeesNative — a fast, fine-grained
**signals** library (the same reactivity model behind SolidJS and modern
frameworks), written in strict TypeScript.

> **Status: 🧪 Experimental (pre-1.0).** Implemented and thoroughly tested:
> the **reactivity** layer (`signal`, `computed`/`memo`, `effect`, `batch`,
> `untrack`, `createRoot`, `onCleanup`, plus `startTransition`/`deferred` and a
> pluggable reactive scheduler), the **component model** (element tree +
> selector-based, re-render-isolated context, portals, keyed regions), the
> **priority scheduler**, a **thread-pool** abstraction (Web Worker backend +
> inline fallback), the **animation engine** (reactive animated values with
> timing/spring drivers + `interpolate`, RN `Animated`/Reanimated + Flutter
> `AnimationController` parity), and **gesture recognizers** (tap, longPress,
> pan, pinch, swipe → reactive state, RN Gesture Handler / Flutter
> `GestureDetector` parity). APIs may still change before `1.0`.

## Install

```bash
pnpm add @mindees/core
```

> 🧪 APIs are experimental (pre-1.0) and may change before `1.0`.

## Quick start

```ts
import { signal, computed, effect, batch } from '@mindees/core'

const count = signal(0)
const doubled = computed(() => count() * 2)

effect(() => {
  console.log(`count=${count()} doubled=${doubled()}`)
}) // logs immediately, then on every change

count.set(1)             // re-runs the effect
count.update((n) => n + 1)

batch(() => {            // coalesce multiple writes into one effect run
  count.set(10)
  count.set(20)
})
```

## Why signals?

Signals give you **fine-grained reactivity**: only the computations that actually
depend on a changed value re-run — no virtual-DOM diffing, no manual
`useMemo`/`useCallback`, no whole-component re-renders. The engine is:

- **Glitch-free** — a diamond dependency recomputes its consumer exactly once;
  no observer ever sees an inconsistent intermediate state.
- **Lazy & cached** — `computed` values recompute only when read *and* a
  dependency changed; an equal recomputation stops propagation.
- **Leak-free** — disposing an owner unlinks every subscription (verified by an
  adversarial disposal test suite).
- **Synchronous & deterministic** — predictable effect ordering, batched writes.

## API

| Export | Kind | Description |
| --- | --- | --- |
| `signal(value, opts?)` | fn | Writable reactive value: `()` read · `.set` · `.update` · `.peek`. |
| `computed(fn, opts?)` / `memo` | fn | Lazy, cached derived value. |
| `effect(fn)` | fn | Re-runs on dependency change; returns a disposer; supports `onCleanup`. |
| `batch(fn)` | fn | Coalesce writes; effects run once at the end. |
| `untrack(fn)` | fn | Read without subscribing. |
| `startTransition(fn)` | fn | Mark writes as low-priority (deferred) updates. |
| `deferred(source)` | fn | A derived accessor that lags `source` to a lower priority lane. |
| `setReactiveScheduler(s)` | fn | Route reactive effects through a custom `Scheduler` (or `null` to reset). |
| `createRoot(fn)` | fn | Non-tracked owner scope with manual `dispose`. |
| `onCleanup(fn)` | fn | Register teardown for the current scope. |
| `getOwner` / `runWithOwner` | fn | Inspect / re-enter an ownership scope. |
| `Signal`, `Memo`, `Accessor`, `EqualsFn`, `Owner`, … | type | Fully-typed public surface. |
| `NotImplementedError` / `notImplemented` | err | Honest markers for unbuilt research tracks. |

Custom equality is supported everywhere (`{ equals: (a, b) => … }`, or
`equals: false` to always notify).

## Component model, scheduler & threading (Phase 2)

```ts
import {
  createContext, createProvider, createElement,
  createScheduler, createInlineThreadPool,
} from '@mindees/core'

// Selector-based context with re-render isolation: a consumer only re-runs
// when its SELECTED slice changes, not on every context update.
const Session = createContext({ user: { name: 'Ada' }, unread: 0 })
const session = createProvider(Session)
const name = session.select((s) => s.user.name) // memo; isolated from `unread`

// Two-lane priority scheduler (sync vs normal), microtask-batched,
// with cancellable + dedup-by-key tasks.
const scheduler = createScheduler()
scheduler.schedule(() => paint(), { priority: 'sync', key: 'frame' })

// Thread-pool abstraction. The inline fallback runs jobs synchronously;
// createWorkerPool({ createWorker }) runs them on real Web Workers (see API below).
const pool = createInlineThreadPool()
await pool.run((n) => fib(n), 40)
```

| Export | Kind | Description |
| --- | --- | --- |
| `createElement` / `Fragment` / `isElement` | fn | Renderer-agnostic element tree. |
| `createContext` / `createProvider` | fn | Selector-based, **re-render-isolated** context. |
| `portal` / `isPortal` | fn | Render a subtree into a different host region (overlays/modals/toasts). |
| `keyedRegion` / `isKeyedRegion` | fn | Keyed list region for stable, reconciled reordering. |
| `renderComponent` | fn | Run a component in a disposable owner scope. |
| `createScheduler` / `Scheduler` | fn | Two-lane priority scheduler (cancellable, dedupable). |
| `createWorkerPool` / `createInlineThreadPool` | fn | `ThreadPool` backends (web + fallback). |
| `createNativeThreadPool` | fn | 🔬 research track — throws `NotImplementedError`. |

> Native multi-threading is a **research track** (honest `NotImplementedError`);
> the Web Worker and inline backends work today.

## Animation engine

RN `Animated`/Reanimated + Flutter `AnimationController` parity, built entirely on
the reactive core. An `AnimatedValue` **is a signal**, so reading it inside a
`style` accessor re-renders only that node. One injected `FrameSource` drives a
single loop that ticks every active driver inside one `batch()` per frame — so a
style reading several animated values recomputes once (glitch-free). With no frame
source (SSR / headless / tests until one is wired), animations **jump to their
final value** synchronously: deterministic, never a hang.

```ts
import { animate, timing, spring, interpolate } from '@mindees/core'

const x = animate(0)
timing(x, { to: 100, duration: 250 })      // duration driver
spring(x, { to: 100, stiffness: 180 })     // physics driver (velocity-preserving)

const opacity = interpolate(x, [0, 100], [0, 1]) // map a range to a range
```

| Export | Kind | Description |
| --- | --- | --- |
| `animate(initial)` | fn | Create a reactive `AnimatedValue` (a signal you can drive). |
| `timing` / `spring` | fn | Duration and physics drivers; return an `AnimationHandle` (`stop()` + awaitable `done`). |
| `interpolate(src, inRange, outRange)` | fn | Map an input range to an output range. |
| `linear` / `easeInQuad` / `easeOutQuad` / `easeInOutQuad` / `easeOutCubic` / `cubicBezier` | fn | Easing curves. |
| `setFrameSource` / `getFrameSource` / `rafFrameSource` / `manualFrameSource` | fn | Inject the per-frame clock (rAF on web, vsync on native, manual in tests). |

## Gesture recognizers

RN Gesture Handler / Flutter `GestureDetector` parity, built on the reactive core.
Each factory returns a `Recognizer`: a bag of pointer-event handlers to spread onto
a host element, plus **reactive state** (signals) you read in a `style` accessor or
feed straight into the animation engine. The only platform-aware code is
`normalizePointer`, so recognizers run on web (Pointer Events), native (the
command-backend payload), and tests (synthetic events), and SSR safely.

```ts
import { pan, tap, composeGestures } from '@mindees/core'

const drag = pan({ axis: 'both' })
// drag.state is a bag of accessor signals: drag.state.translationX(), .active(), …
// spread drag.handlers onto a host element. Compose recognizers onto ONE element
// (the renderer binds a single listener per event, so spreading two would drop one):
const merged = composeGestures([drag, tap({})])
// → spread merged.handlers; read each recognizer's own .state
```

| Export | Kind | Description |
| --- | --- | --- |
| `tap` / `longPress` / `pan` / `pinch` / `swipe` | fn | Recognizers → `{ handlers, state }`; `state` is a bag of accessor signals. |
| `panAnimated(x, y, opts?)` | fn | A pan recognizer wired to drive two `AnimatedValue`s directly (with optional release snap). |
| `composeGestures(recognizers)` | fn | Merge an array of recognizers onto one element (one listener per event). |
| `normalizePointer` | fn | Platform-agnostic pointer-sample normalization. |

## License

`MIT OR Apache-2.0`
