---
"@mindees/compiler": minor
---

Add build-time **performance budgets** (spec §12) — `compileChecked(src, { budget: { maxBytes, maxElements } })`
emits an **error** that refuses to emit when a module exceeds its budget, so "100% performance
optimized" is *enforced at build time*, not aspirational. Neither React Native nor Flutter fails a
build on a perf budget. (`MDC_BUDGET_BYTES` / `MDC_BUDGET_ELEMENTS`; exported `checkBudget`.)
