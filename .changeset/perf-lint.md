---
"@mindees/compiler": minor
---

Add an opt-in build-time **perf-lint** (`compileChecked(src, { perf: true })`) — honest `warning`
diagnostics for real performance footguns in the fine-grained reactive + Helix render model, a
build-time "this will be slow" signal neither React Native nor Flutter ships. It never blocks the
build (warnings only) and reports structural facts (no invented frame-time numbers).

v1 rules: `MDC_PERF_001` bare `.map()` list child (use `For`/`List` — a `.map` re-mounts every row);
`MDC_PERF_002` `For`/`keyedRegion` missing `key`; `MDC_PERF_003` heavy sync work in a default effect
(use `computed`/`memo` or the deferred lane); `MDC_PERF_004` repeated signal read in a loop;
`MDC_PERF_005` `effect` that subscribes without cleanup; `MDC_PERF_006` constant function-valued prop
(allocates a binding for a value that never changes); `MDC_PERF_007` (off by default) large inline
literal list. Suppress with `// mdc-perf-ignore [CODE]` or `rules: { MDC_PERF_00x: 'off' }`. Exported
`perfLint` for programmatic use.
