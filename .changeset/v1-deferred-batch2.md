---
"@mindees/compiler": patch
"@mindees/core": patch
---

Fix the last clearly-fixable bugs from the v1 bug-hunt, each with a regression test:

- **compiler:** the injected JSX-runtime import is now placed **after** a leading `"use client"`/`"use
  server"` directive (an import before it demoted the directive to a no-op — breaking the RSC/web path).
- **compiler:** the **element budget** (`maxElements`) is now enforced even with `flatten:false` — a
  count-only pass populates `totalElements` so `compileChecked` refuses to emit over-budget regardless
  of the optimizer.
- **core (animation):** `interpolate` with `extrapolate:'extend'` past a **zero-width terminal segment**
  now extends the last real slope (and falls back to the terminal output if all terminal segments are
  degenerate) instead of returning the plateau's start value.
