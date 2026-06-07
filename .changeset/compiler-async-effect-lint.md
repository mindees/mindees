---
"@mindees/compiler": minor
---

Add perf-lint rule **`MDC_PERF_008`** — flags an `async` function passed to `effect()`. Dependency
tracking stops at the first `await` (signals written afterward won't re-run the effect) and the returned
Promise is ignored rather than used as cleanup. Keep the effect sync and launch the async work inside it.
