---
"@mindees/cli": patch
---

**Fix the scaffold's JSX config + ship a getting-started guide** (roadmap #6).

- The generated `tsconfig.json` used **classic** JSX (`jsx: "react"` + `jsxFactory`) while the compiler
  type-checks with **automatic** JSX and the docs tell you to write import-free JSX — so the editor and the
  build disagreed on a fresh project. The scaffold now emits `jsx: "react-jsx"` +
  `jsxImportSource: "@mindees/core"`, and the templates no longer import `createElement` (the compiler
  injects it at emit). Editor == compiler == docs.
- New [`docs/getting-started.md`](../../docs/getting-started.md): zero → running web app, the
  signals/JSX/components model, Atlas theming, and `mindees.config.json`.
