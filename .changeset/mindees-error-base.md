---
"@mindees/core": minor
"@mindees/ai": minor
"@mindees/router": minor
"@mindees/data": minor
"@mindees/updates": minor
"@mindees/renderer": minor
---

**Shared `MindeesError` base** (1.0 error-convention consistency, from the freeze audit). `@mindees/core`
now exports `MindeesError extends Error` (a stable `name` + machine-readable `code`), and every package error
extends it — `AiError`, `RouterError`, `DataError`, `UpdateError`, `SduiError`, `NativeHostError`, and
`NotImplementedError`. So a consumer can `catch (e) { if (e instanceof MindeesError) … }` across the whole
family and branch on `e.code` instead of string-matching messages. Subclasses keep their precise `code`
union (via `declare readonly code`), and `instanceof <SpecificError>` still works.

Also from the audit: `NativeHostError` now carries a `NativeHostErrorCode`; `useRouter()` throws a typed
`RouterError('NO_ACTIVE_ROUTER')` instead of a bare `Error`; `SduiErrorCode` drops its redundant `SDUI_`
prefix to match the bare-code convention of its peers.
