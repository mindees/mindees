# mindees-example-app — JS bundle

The **real** UI for the Android example: `@mindees/core` signals + `@mindees/atlas`
primitives driven by the `@mindees/renderer` (Helix) reconciler. It renders against a
`createNativeCommandBackend`, which emits the serializable native command stream the
host (`MindeesNativeHost` + `AndroidViewRenderer`) materializes into real Android views.

This is **not** hand-written commands — it exercises the genuine reconciler, including
fine-grained reactivity (a button press mutates a signal; only the counter's text node
is patched, via a single `updateText`).

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
