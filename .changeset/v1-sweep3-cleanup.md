---
"@mindees/cli": patch
"@mindees/core": patch
---

Fix the final five bugs from the third v1 bug-hunt — closing the sweep — each with a regression test:

- **cli (build):** source maps now resolve to the real `src/` file — `sources` is rewritten relative to
  the output (was a non-existent `dist/*.tsx`), `sourceRoot` cleared, and the `sourceMappingURL` comment
  points at the literal `.map` filename (TS percent-encodes `[ ]`, which didn't match the written file).
- **cli (build):** two sources whose basenames differ only by extension (`App.ts` + `App.tsx`) now fail
  the build with an `MDC_OUTPUT_COLLISION` error instead of one silently overwriting the other's `dist/App.js`.
- **cli (dev-server):** the live-reload client embeds the **render-time** build version as its baseline
  (built per-request) — a rebuild that lands within the first poll interval no longer misses the reload.
- **core (scheduler):** re-scheduling a keyed task with a **different priority** now relocates it to the
  requested lane (latest priority wins), instead of silently keeping its original lane.
- **core (scheduler):** a recovery task scheduled by `onError` during the runaway-loop guard is no longer
  stranded — the overflow is reported outside the flushing window so the recovery arms a fresh flush.
