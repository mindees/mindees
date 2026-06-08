---
"@mindees/compiler": patch
"@mindees/renderer": patch
"@mindees/cli": patch
"@mindees/data": patch
"create-mindees": patch
---

1.0 API-freeze prep (from the freeze-readiness audit) — stop exposing internals and name the unnameable:

- **Dropped leaked internals** from public entry points (they would otherwise freeze under semver):
  `@mindees/compiler` `createFlattenTransformer`/`STATIC_MARKER` (optimizer plumbing; use `compile`),
  `@mindees/renderer` `isEventProp` (reconciler detail), and `create-mindees`'s re-export of
  `naturalLanguageToTemplate` (a CLI internal).
- **Exported previously-unnameable public types**: `@mindees/cli` `DevServerResponse` + the
  `mindees.config.json` surface (`MindeesConfig`/`loadConfig`/`CONFIG_FILE`); `@mindees/renderer`
  `SerializeOptions` + `HeadlessBackendOptions`; `@mindees/data` `RecordState` + `AbortLike`.
