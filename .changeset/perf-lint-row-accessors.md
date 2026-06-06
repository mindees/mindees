---
"@mindees/compiler": patch
---

perf-lint: rules `MDC_PERF_003`/`MDC_PERF_004` now also catch reads of the **row accessor** a keyed
builder passes to its callback (`For`/`List`/`keyedRegion`/… `{ children|renderItem: (item, index) => … }`
where `item()`/`index()` are reads), closing the documented false-negative — without over-firing on a
plain function that merely has an `item` parameter.
