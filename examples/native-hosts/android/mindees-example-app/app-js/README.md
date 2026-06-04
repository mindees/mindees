# mindees-example-app — JS bundle

The **real** UI for the Android example: a multi-screen, TypeScript-only MindeesNative
app with `@mindees/*` end to end —

- `@mindees/core` — signals + component model
- `@mindees/atlas` — UI primitives (View/Text/Button/Column/Row)
- `@mindees/router` — the Quantum router (in-memory history, programmatic navigation)
- `@mindees/renderer` — the Helix reconciler → native command stream

The router's `createRouterView` produces a backend-agnostic node, rendered against a
`createNativeCommandBackend`; navigating between routes (Home ⇄ About) drives the host
(`MindeesNativeHost` + `AndroidViewRenderer`) to swap real Android view subtrees.

This is **not** hand-written commands — it exercises the genuine reconciler, including
fine-grained reactivity (a press mutates a signal; only that text node is patched, via a
single `updateText`) and module-scoped state that survives navigation. No DOM, no browser
globals — it runs in the embedded QuickJS engine.

## Build

From the repo root:

```bash
pnpm run build:android-example-js
```

That builds the framework packages, then bundles [`src/main.ts`](src/main.ts) (see
[`tsdown.config.ts`](tsdown.config.ts)) into a single QuickJS-safe IIFE at:

```
../src/main/assets/mindees-app.bundle.js
```

`MainActivity` loads that asset and runs it in an embedded QuickJS engine. The bundle:

- inlines the `@mindees/*` packages (the framework has no runtime deps),
- targets `es2020` for the embedded engine,
- prepends a `queueMicrotask` polyfill (some embedded engines lack it),
- exposes `globalThis.MindeesApp` with `start()` and `dispatchEvent(handlerId)`.

The generated `mindees-app.bundle.js` asset is committed so the Android build (and CI)
runs without a Node toolchain; regenerate it with the command above whenever the app or
the framework packages change.
