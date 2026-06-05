---
"@mindees/router": minor
---

`<Link>` now **auto-prefetches** its target's loaders, warming the SWR cache so the destination
renders instantly — the Quantum differentiator vs Expo Router's manual-only `router.prefetch`.
Policy via `prefetch`: `'intent'` (default — on hover, press-in, or keyboard focus), `'render'`
(on mount), or `false`. Deduped per link, and a no-op for routes with no loader.
