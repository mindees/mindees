# @mindees/core

The reactive runtime foundation of MindeesNative — a fast, fine-grained
**signals** library (the same reactivity model behind SolidJS and modern
frameworks), written in strict TypeScript.

> **Status: 🧪 Experimental (Phases 1–2).** Implemented and thoroughly tested:
> the **reactivity** layer (`signal`, `computed`/`memo`, `effect`, `batch`,
> `untrack`, `createRoot`, `onCleanup`), the **component model** (element tree +
> selector-based, re-render-isolated context), the **priority scheduler**, and a
> **thread-pool** abstraction (Web Worker backend + inline fallback). APIs may
> still change before `1.0`.

## Install

> ⚠️ **Not published to npm yet.** `@mindees/core` is pre-1.0 and not on the npm
> registry. The command below is what you'll use **once it's published** (Phase
> 12). For now, work with it from the monorepo via the
> [contributor quick-start](../../README.md#-quickstart-contributors):
> `corepack enable && pnpm install && pnpm verify`.

```bash
# coming soon (not yet published):
pnpm add @mindees/core
```

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
  createScheduler, createWorkerPool, createInlineThreadPool,
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

// Thread-pool abstraction: real Web Worker backend, inline fallback.
const pool = createInlineThreadPool() // or createWorkerPool({ createWorker })
await pool.run((n) => fib(n), 40)
```

| Export | Kind | Description |
| --- | --- | --- |
| `createElement` / `Fragment` / `isElement` | fn | Renderer-agnostic element tree. |
| `createContext` / `createProvider` | fn | Selector-based, **re-render-isolated** context. |
| `renderComponent` | fn | Run a component in a disposable owner scope. |
| `createScheduler` / `Scheduler` | fn | Two-lane priority scheduler (cancellable, dedupable). |
| `createWorkerPool` / `createInlineThreadPool` | fn | `ThreadPool` backends (web + fallback). |
| `createNativeThreadPool` | fn | 🔬 research track — throws `NotImplementedError`. |

> Native multi-threading is a **research track** (honest `NotImplementedError`);
> the Web Worker and inline backends work today.

## License

`MIT OR Apache-2.0`
