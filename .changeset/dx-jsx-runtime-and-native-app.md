---
"@mindees/core": minor
"@mindees/renderer": minor
---

Developer-experience: write apps in plain JSX with a one-call entry point.

- **`@mindees/core`** now ships an **automatic JSX runtime** (`@mindees/core/jsx-runtime`
  and `@mindees/core/jsx-dev-runtime`). Set `"jsx": "react-jsx"` +
  `"jsxImportSource": "@mindees/core"` and write `<View><Text>hi</Text></View>` with **no
  manual `createElement` import** — the compiler/bundler injects `jsx`/`jsxs`/`Fragment`.
  Both delegate to `createElement`, and the package exposes the `JSX` type namespace so
  TSX type-checks.
- **`@mindees/renderer`** adds **`createNativeApp(root, options?)`** — a one-call entry
  for embedded native hosts that wires the native command backend, renders the root,
  flushes command batches to the host, and exposes the `start()`/`dispatchEvent()`
  contract. `rootId` defaults to the host convention (`"host-root"`) and `emit` defaults
  to `globalThis.MindeesHost.emit`, so the app entry is just `createNativeApp(<App />)`.

Together these turn a native app's entry from ~40 lines of backend/host plumbing in
`createElement` calls into idiomatic TSX.
