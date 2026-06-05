---
"@mindees/compiler": patch
---

Fix the compiler so the framework's own **automatic-JSX** component style compiles and
runs (it didn't). Two correctness bugs:

- The type-check gate used classic JSX (`jsxFactory: createElement`), so an idiomatic
  component that imports nothing failed the gate with `TS2552 Cannot find name 'createElement'`.
  The gate now uses the automatic runtime (`jsx: react-jsx`, `jsxImportSource: '@mindees/core'`)
  with an ambient `@mindees/core/jsx-runtime` declaration, so JSX resolves with no import.
- The transform emitted `createElement`/`Fragment` with **no import**, so emitted modules threw
  `ReferenceError` at runtime. Emit still lowers to `createElement` (the tree-flatten optimizer
  matches it), but now a transformer injects `import { createElement, Fragment } from '@mindees/core'`
  for any runtime name that's referenced but not already imported.

Net: a component written in the documented style now type-checks **and** executes end-to-end
(covered by a new test that compiles a no-import component and runs the output).
