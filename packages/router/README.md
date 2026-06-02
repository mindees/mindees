# @mindees/router

**Quantum** — the typed, signals-native router for MindeesNative. **Codegen-free
typed path params**, **typed + runtime-validated search params** (bring any
Zod / Valibot / ArkType schema), and **fine-grained reactive route state** with
selector-based re-render isolation. A modern, type-safe alternative to Expo
Router and React Router for TypeScript cross-platform apps.

> **Status: 🧪 Experimental (Phase 6 — Router I + Phase 7 — Router II).** The
> typed routing core (typed params, Standard Schema search validation, the
> signals-native router, typed + relative navigation, dynamic reconfiguration,
> memory + browser history), **render integration** (`createRouterView` —
> fine-grained, layout-preserving nested rendering; typed `createLink`), and
> **data/guards/transitions** (SWR loaders + `preload`/`invalidate`, navigation
> guards, web view transitions) are implemented and tested. The global typed
> route registry and file-based route scanning are a later phase — see
> [ROADMAP](../../ROADMAP.md).

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

## Render integration — nested routes that actually render

`createRouterView` renders the matched route **chain**; a layout renders its
`children` (the outlet). Navigation is **fine-grained and layout-preserving** —
switching between sibling pages keeps the parent layout (and its state) mounted,
and a same-route param change (`/posts/1` → `/posts/2`) re-mounts *nothing*; only
the bindings that read the changed param update.

```ts
import { createElement } from '@mindees/core'
import { render, createDomBackend } from '@mindees/renderer'
import { createRouter, createRouterView, createLink, type RouteComponentProps } from '@mindees/router'

function DashLayout(props: RouteComponentProps) {
  return createElement('view', null,
    createElement('nav', null, 'sidebar'),
    props.children, // ← the outlet: the matched child route renders here
  )
}
const Settings = () => createElement('text', null, 'settings')

const router = createRouter({
  routes: [{ path: '/dash', component: DashLayout, children: [
    { path: '', component: () => createElement('text', null, 'home') },
    { path: 'settings', component: Settings },
  ] }],
})

const Link = createLink(router)
render(createRouterView(router, { notFound: () => createElement('text', null, '404') }),
  createDomBackend(), document.getElementById('app')!)

// Typed link — params required iff the pattern has them:
Link({ to: '/dash/settings', children: 'Settings' })
```

Components built on `@mindees/core`'s `createElement` — the renderer just renders
the tree, so `@mindees/router` keeps **zero renderer runtime dependency**.

## Codegen-free typed params

```ts
import type { PathParams } from '@mindees/router'

type A = PathParams<'/posts/:postId'>        // { postId: string }
type B = PathParams<'/u/:userId/p/:postId'>  // { userId: string; postId: string }
type C = PathParams<'/files/:rest*'>         // { rest: string }
type D = PathParams<'/about'>                // {}
```

No generated `.d.ts`, no dev server, no stale type files — just TypeScript.

## Data, guards & transitions

```ts
const router = createRouter({
  routes: [
    {
      path: '/posts/:postId',
      // SWR loader: cached, revalidated, abortable; result flows to props.data()
      loader: async ({ params, signal }) => fetch(`/api/posts/${params.postId}`, { signal }).then((r) => r.json()),
      loaderDeps: ({ search }) => search.page, // re-load when ?page changes
      staleTime: 30_000,
    },
  ],
  // Guard: cancel (false) or redirect (string); idempotent nav is automatic
  beforeNavigate: (to) => (isLoggedIn() ? undefined : '/login'),
  viewTransitions: true, // wrap navigations in document.startViewTransition (web)
})

router.preload('/posts/42')   // intent prefetch — runs the loader, no navigation
router.invalidate()           // re-run the current chain's loaders

function Post(props: RouteComponentProps) {
  const d = props.data()      // reactive: { status, data?, error? } — updates in place
  // ...
}
```

Loaders run for every route in the matched chain, cache by route + params +
`loaderDeps` (stale-while-revalidate), abort superseded loads via `AbortSignal`,
and surface results reactively — a resolved load updates the component's data
binding **without re-mounting** it. View transitions are feature-detected and a
transparent no-op outside a DOM (SSR / native).

## API surface

- **Render (Router II)** — `createRouterView`, `createLink`, `RouterViewOptions`,
  `LinkProps`, `LinkComponent`, `LinkOptions`, `RouteComponentProps`.
- **Data / guards / transitions** — route `loader` / `loaderDeps` / `staleTime`,
  `router.loaderData` / `invalidate` / `preload`, `LoaderContext`, `LoaderData`,
  `LoaderFn`, `LoaderStatus`; `BeforeNavigate`, `NavigateOptions` (`force`,
  `viewTransition`), `CreateRouterOptions` (`beforeNavigate`, `viewTransitions`).
- **Router** — `createRouter`, `Router`, `RouteRecord` (with `children` for
  nesting), `RouteMatch`, `RouterState` (with `matches` chain), `NavTarget`,
  `NavigateOptions`, `resolvePath`.
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
