---
"@mindees/atlas": minor
---

1.0 error-convention + surface consistency (from the freeze audit):

- New **`AtlasError`** (extends the shared `MindeesError`) with an `AtlasErrorCode`. `createList` (invalid
  `itemHeight`/`height`) and `useForm` (async schema) now throw a typed `AtlasError` with a machine code
  instead of a bare `RangeError`/`TypeError`, matching every other `@mindees/*` package.
- Exported the `Entry` type returned by `flattenSections`, so the public list utilities are fully nameable.
