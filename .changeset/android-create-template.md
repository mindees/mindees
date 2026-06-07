---
"@mindees/cli": minor
"create-mindees": patch
---

Add an experimental **`android`** create template: `create-mindees myapp --template android` (or
`mindees create`) scaffolds a **standalone, buildable native Android app** — TSX UI (Atlas + the
Quantum router) running on a real Android view tree via an embedded **QuickJS** runtime, with the
native host **vendored as Kotlin source** (no Maven dependency on MindeesNative).

The template is codegen'd from the CI-verified reference host (`scripts/gen-android-template.mjs`,
`git ls-files` oracle) so it can't drift, with a `check:android-template` guard. The scaffolded
`app-js` resolves `@mindees/*` from npm (synthesized `package.json` + alias-free `tsdown`). A new
`android-template.yml` CI job proves it end-to-end: scaffold → build the bundle from the public npm
registry → `gradle assembleDebug` → assert the APK contains the bundle.
