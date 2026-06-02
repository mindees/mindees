# @mindees/router

**Quantum** — the typed, signals-native router for MindeesNative. **Codegen-free
typed path params**, **typed + runtime-validated search params** (bring any
Zod / Valibot / ArkType schema), and **fine-grained reactive route state** with
selector-based re-render isolation. A modern, type-safe alternative to Expo
Router and React Router for TypeScript cross-platform apps.

> **Status: 🧪 Experimental (Phase 6 — Quantum Router I).** The typed routing
> core is implemented and tested: pattern matching + typed params, Standard
> Schema search validation, the signals-native router, typed + relative
> navigation, dynamic reconfiguration, and history (memory + browser).
> Renderer-bound components (`Link`/`Outlet`), file-based route scanning, and
> loaders/data are **Router II** — see [ROADMAP](../../ROADMAP.md).

## Why Quantum?

| | **Quantum** | Expo Router v6 | React Router v7 |
| --- | --- | --- | --- |
| Typed path params | ✅ template-literal types, **no codegen** | ⚠️ codegen; required params typed as *optional* | ✅ codegen (`.react-router/types`) |
| Typed **search** params | ✅ via Standard Schema | ❌ not typed | ❌ raw `URLSearchParams` |
| Validation lock-in | ✅ none — any Standard Schema (Zod/Valibot/ArkType) | — | — |
| Reactivity | ✅ fine-grained signals; select a slice, re-run on *that* change | ⚠️ global-vs-local re-render footgun | React renders |
| Build/dev-server required for types | ❌ pure TypeScript inference | ✅ dev server | ✅ typegen step |

Relative navigation (`navigate('./edit')`, `'../'`) and `#fragment` targets are
supported via href strings (resolved against the current location); the typed
structured form (`navigate({ to, params })`) builds absolute paths.

## Quick start

```ts
import { createRouter, createMemoryHistory } from '@mindees/router'
import { z } from 'zod' // or valibot, arktype — any Standard Schema validator

const router = createRouter({
  routes: [
    { path: '/' },
    { path: '/posts/:postId' },
    { path: '/search', searchSchema: z.object({ q: z.string(), page: z.coerce.number() }) },
    { path: '/files/:rest*' }, // catch-all
  ],
  history: createMemoryHistory({ initialEntries: ['/'] }), // or createBrowserHistory()
})

// Typed navigation — params are required iff the pattern has them (inferred, no codegen):
router.navigate({ to: '/posts/:postId', params: { postId: '42' }, search: { ref: 'home' } })
// router.navigate({ to: '/posts/:postId' })            // ✗ type error: params required
// router.navigate({ to: '/', params: { x: '1' } })     // ✗ type error: no params allowed
router.navigate('./edit')                               // ✓ relative navigation (href string)

// Re-render isolation — re-runs ONLY when the selected slice changes:
const postId = router.select((s) => s.params.postId)
const matched = router.match() // { route, params, search, searchRaw, issues? }
```

## Typed, validated search params

Search params are first-class typed state. Reads are validated against the route's
schema and fully typed — the capability Expo Router and React Router lack:

```ts
import { validateSearch } from '@mindees/router'

const schema = z.object({ page: z.coerce.number(), q: z.string() })
const search = validateSearch(schema, { page: '2', q: 'router' })
//    ^? { page: number; q: string }
```

Invalid params never crash navigation — the match exposes `issues` (Standard
Schema diagnostics) and falls back to the raw parse. Repeated keys
(`?tag=a&tag=b`) become arrays; coercion is delegated to your schema.

## Codegen-free typed params

```ts
import type { PathParams } from '@mindees/router'

type A = PathParams<'/posts/:postId'>        // { postId: string }
type B = PathParams<'/u/:userId/p/:postId'>  // { userId: string; postId: string }
type C = PathParams<'/files/:rest*'>         // { rest: string }
type D = PathParams<'/about'>                // {}
```

No generated `.d.ts`, no dev server, no stale type files — just TypeScript.

## API surface (Router I)

- **Router** — `createRouter`, `Router`, `RouteRecord`, `RouteMatch`,
  `RouterState`, `NavTarget`, `NavigateOptions`, `resolvePath`.
- **Patterns** — `matchPattern`, `buildPath`, `parsePattern`,
  `compareSpecificity`, `PathParams`, `HasPathParams`.
- **Search** — `parseQuery`, `stringifyQuery`, `validateSearch`,
  `safeValidateSearch`, `QueryValue`, `ValidationResult`.
- **History** — `createMemoryHistory`, `createBrowserHistory`, `parseHref`,
  `createHref`, `RouterHistory`, `RouterLocation`.
- **Validation** — `StandardSchemaV1` (vendored, zero runtime dependency).
- **Errors** — `RouterError`, `RouterErrorCode`.

## Design

Route state (location, params, search, matched route) is modeled as the
fine-grained **signal graph** from [`@mindees/core`](../core) — no monolithic
state object, no over-subscription. `select()` applies the same
selector-isolation technique as core's Phase 2 `createProvider` (a `computed`
memo over an `equals:false` source). History is an **injected capability**, so the
whole router is deterministically testable headless. Validation rides on
[**Standard Schema**](https://standardschema.dev) — vendored as types only, so
Quantum adds **zero runtime dependencies** while accepting any compliant
validator. See [ADR-0003](../../docs/adr/0003-router-architecture.md).

## License

Dual-licensed under **MIT OR Apache-2.0**.
