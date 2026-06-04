# Benchmark Evidence

MindeesNative makes several performance-shaped claims: fine-grained reactivity,
signals-native stores and routers, a narrow native command stream, virtualized
list windowing, and deterministic OTA delta application. This page records how
to reproduce benchmark evidence for those implemented paths.

These benchmarks are evidence, not a CI gate. Absolute timings vary by CPU,
Node version, thermal state, and background load, so the runner asserts
correctness invariants and reports throughput without enforcing timing budgets.

## Run

```sh
pnpm benchmark
```

The command builds packages first, then runs `scripts/benchmark.mjs` against the
built `dist` artifacts.

Useful knobs:

```sh
BENCHMARK_SAMPLES=7 pnpm benchmark
BENCHMARK_ITERATIONS_MULTIPLIER=2 pnpm benchmark
pnpm benchmark:json
```

## Coverage

| Case | Package | Evidence |
| --- | --- | --- |
| `core.signal.isolated-update` | `@mindees/core` | Creates 1,000 signal/effect pairs and repeatedly updates one signal. The benchmark asserts the target observer runs for every write while an unrelated observer remains at its initial run count. |
| `data.collection.record-update` | `@mindees/data` | Seeds 5,000 records, subscribes to one `collection.get(id)`, and repeatedly updates that record. The benchmark asserts the subscribed accessor observes every update. |
| `router.pattern.match-build` | `@mindees/router` | Repeatedly matches and builds static, dynamic, and catch-all route patterns through the public router pattern exports. |
| `renderer.native-command.reactive-prop` | `@mindees/renderer` | Renders a reactive prop through `createNativeCommandBackend()` and asserts each signal write emits exactly one `setProp` command. |
| `atlas.list.compute-window` | `@mindees/atlas/list` | Runs the fixed-height virtualized list window calculation over a 100,000-item list. |
| `updates.delta.apply` | `@mindees/updates` | Builds a delta for a 32 KiB asset and repeatedly applies it with a max output-size guard, then asserts the round trip matches the target bytes. |

## Local Evidence

Generated on Windows from `phase-6b-performance-evidence` after `pnpm build`.

```text
# MindeesNative Benchmark Evidence

Generated: 2026-06-04T00:47:51.684Z
Node: v24.15.0
OS: win32 10.0.26200 x64
CPU: AMD Ryzen 5 7600X 6-Core Processor
Samples: 5
Iteration multiplier: 1

| Case                                  | Package             | Iterations/sample | Median    | Ops/sec     | Range            | Note                                                           |
| ------------------------------------- | ------------------- | ----------------- | --------- | ----------- | ---------------- | -------------------------------------------------------------- |
| core.signal.isolated-update           | @mindees/core       | 25,000            | 3.07 ms   | 8,154,212   | 2.83-5.43 ms     | 1000 signal/effect pairs; unrelated observer stayed at one run |
| data.collection.record-update         | @mindees/data       | 15,000            | 3.60 ms   | 4,163,660   | 2.36-8.19 ms     | 5000 seeded records; one subscribed record updated             |
| router.pattern.match-build            | @mindees/router     | 120,000           | 120.04 ms | 999,703     | 115.48-142.55 ms | mix of static, dynamic, and catch-all patterns                 |
| renderer.native-command.reactive-prop | @mindees/renderer   | 15,000            | 2.89 ms   | 5,196,605   | 1.81-4.17 ms     | one reactive prop produced one setProp command per write       |
| atlas.list.compute-window             | @mindees/atlas/list | 250,000           | 1.60 ms   | 156,455,348 | 1.50-3.33 ms     | 100000 items, fixed 48px rows, overscan 4                      |
| updates.delta.apply                   | @mindees/updates    | 4,000             | 77.64 ms  | 51,517      | 74.43-78.41 ms   | 32.0 KiB base, 800 B delta                                     |
```
