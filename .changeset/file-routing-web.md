---
"@mindees/cli": minor
---

**File-based routing on the no-bundler web target.** A `src/app/` directory now drives routing
(Expo Router-style conventions — `index`/`[param]`/`[...rest]`/`_layout`/`(group)`):

- `mindees dev`/`build` regenerate **`src/routes.gen.ts`** — a static-import module map (the browser has no
  bundler `import.meta.glob`) — and compile it to `dist/routes.gen.js`. The app does
  `import { routes } from './routes.gen.js'` → `createFileRouter(routes, …)`. Write-guarded so `dev`'s
  `src/` watcher doesn't loop.
- New **`--template router`** scaffold: `src/app/` screens + wired `main.tsx` + a getting-started routing
  section.
- **Convention unified on `src/app/`** (matching `createFileRouter` + the native example): the route
  manifest scan moved from `src/routes/` → `src/app/`. (The web manifest was previously unconsumed, so
  real-world impact is nil.)
- Import-resolver fix: a relative import of a dotted-basename module (e.g. `./routes.gen`) is now correctly
  resolved to `.js` instead of `.gen` being mistaken for a file extension.
