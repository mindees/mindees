---
"@mindees/ai": patch
"@mindees/updates": patch
---

Two correctness fixes from the v1 audit:

- **`@mindees/ai` on-device backend honors the async contract.** It previously threw
  *synchronously* from `generate()`/`stream()`, violating `generate(): Promise` /
  `stream(): AsyncIterable`. Now `generate()` returns a rejecting Promise and `stream()`
  returns an `AsyncIterable` that throws on iteration — the same shape a future native runtime
  has, so callers' `await`/`for await` surface the error as expected.
- **`@mindees/updates` `download()` no longer clobbers concurrent state.** It wrote a spread of
  the *pre-transfer* state snapshot after the (awaited) asset fetches, so a concurrent
  `apply()`/`boot()`/`rollback()` could be silently lost — including a regressed
  `highestVersion` anti-downgrade floor. It now re-reads fresh state before writing and
  re-asserts the floor.
