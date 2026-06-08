---
"@mindees/core": minor
"@mindees/compiler": minor
---

Final pre-1.0 surface cleanup (freeze audit):

- **`@mindees/core`:** the test-only engine helpers (`_resetAnimation`, `_activeAnimationCount`,
  `_setGestureClock` — they poke process-global frame/gesture state and must never run in an app) are no
  longer exported from the package root. They now live on a dedicated **`@mindees/core/testing`** subpath,
  so they can't leak into app code; import them only from test setup.
- **`@mindees/compiler`:** `MdcPlugin.transformer` is now typed `(ts) => TransformerFactory<SourceFile>`
  instead of `=> unknown`, so plugin authors get type-checking on the factory they return.
