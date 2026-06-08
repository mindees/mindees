---
"@mindees/cli": minor
---

**`mindees dev`/`build` now produce and serve a runnable web app** — closing the #1 v1-readiness gap (the
create → dev → see-my-app loop was broken).

- `mindees build` emits a runnable `dist/index.html` when an app entry (`src/main.{tsx,ts}`) compiles: a
  native **import-map** resolves the bare `@mindees/*` specifiers to the published packages on the esm.sh
  CDN (no bundler step), and relative imports in the compiled output are rewritten with explicit `.js`
  extensions so they load as native ES modules in the browser. Subpath imports (`@mindees/atlas/list`) are
  mapped too. (`html: false` opts out.)
- `mindees dev` now serves the built file tree — `index.html` at `/` (live-reload client injected), each
  emitted asset at its path, with extensionless resolution (`/App` → `App.js`). A failed build shows a
  diagnostics overlay at `/` that auto-recovers on the next good build. (Previously it served a static
  build-status page and never the app.)
