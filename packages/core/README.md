# @mindees/core

The reactive runtime foundation of MindeesNative — a fast, fine-grained
**signals** library (the same reactivity model behind SolidJS and modern
frameworks), written in strict TypeScript.

> **Status: 🧪 Experimental (Phase 1).** The reactivity layer — `signal`,
> `computed`/`memo`, `effect`, `batch`, `untrack`, `createRoot`, `onCleanup` — is
> **implemented and thoroughly tested** (glitch-free, leak-free). The component
> model and scheduler arrive in Phase 2. APIs may still change before `1.0`.

## Install

```bash
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

## License

`MIT OR Apache-2.0`
