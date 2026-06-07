---
"@mindees/cli": patch
---

The `mindees create` / `create-mindees` next-steps hint is now template-aware: the `android` template
prints its real two-phase native build flow (build the app-js bundle, then `gradle assembleDebug`)
instead of the web-only `pnpm install && mindees dev`.
