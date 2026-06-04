---
"@mindees/router": minor
---

Quantum router: file-based routing + ergonomic hooks (Expo-router-level DX, on a better core).

- **`createFileRouter(modules, options?)`** + **`routesFromModules(modules)`** — build a router
  from a file/module map using the same conventions Expo Router uses: `index` → `/`,
  `[param]` → `:param`, `[...rest]` → catch-all, `(group)` → URL-less grouping, `_layout` →
  a layout route that wraps a directory's routes, `+not-found` → a fallback. The map comes
  from a bundler glob (`import.meta.glob('./app/**', { eager: true })`) or a generated table,
  so you never hand-write a route config.
- **Hooks + bound `Link`** — `useRouter()`, `useParams()`, `useSearch()`, `usePathname()`,
  and a typed **`<Link to="…">`** that resolve the active router (no prop-drilling), mirroring
  Expo's `useRouter`/`useLocalSearchParams`/`<Link>`. `createRouter` now registers itself as
  the active router.

Unlike Expo Router these sit on Quantum's stronger core: params are schema-**validated and
coerced** (not raw strings), reads are **fine-grained** via accessors/`select` (no whole-stack
re-renders), and typing is **inferred from the route table with no brittle CLI codegen**.
