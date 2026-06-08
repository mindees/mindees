---
"@mindees/cli": minor
---

**Wire perf-lint + performance budgets into `mindees build`/`dev`** — the flagship build-time DX (advice
neither RN nor Flutter ships) was previously reachable only from compiler unit tests; now it runs on every
real build, making spec §12's "100% optimized, enforced" true rather than aspirational.

- **perf-lint** runs by default and emits **warnings** (never blocks), e.g. `MDC_PERF_001`: a bare `.map()`
  in JSX re-mounts every row. Disable with `{ "perf": false }`.
- **performance budgets** are opt-in via `mindees.config.json` (`{ "budget": { "maxElements": N } }`); a
  per-module violation is an **error** that fails the build (non-zero exit).
- New `mindees.config.json` loader (tolerant: missing/malformed → defaults, never throws). Supports
  `perf`, `budget`, and `appName` (the emitted index.html title).
