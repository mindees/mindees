---
"@mindees/router": patch
"@mindees/compiler": patch
"@mindees/core": patch
---

Fix four more correctness bugs from the v1 bug-hunt (the deferred batch), each with a regression test:

- **router (loaders):** a route that declares a `searchSchema` no longer runs its **loader on raw,
  unvalidated search** when validation fails — it surfaces a `VALIDATE_SEARCH` error instead (the
  `LoaderContext.search` "validated" contract is now honored; loaders never see attacker-controlled raw strings).
- **router (file routes):** duplicate effective route paths (e.g. `users.tsx` + `users/index.tsx`, or two
  `(group)` indexes) now emit a **dev warning** instead of one route being silently unreachable.
- **compiler (perf-lint):** a **trailing** `// mdc-perf-ignore` no longer bleeds onto the next line's
  finding — the line-above lookback is honored only for a standalone ignore comment.
- **core (gesture):** the pan recognizer now **resets** translation/velocity/position state on the final
  pointer-up (it was stuck at the last drag offset), consistent with tap/long-press.
