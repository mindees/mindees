---
"@mindees/cli": minor
---

**Static assets via `public/`.** `mindees build` now copies a conventional `public/` directory verbatim
into `dist/` (binary-safe), so favicons, images, fonts, and CSS referenced by absolute URL (`/logo.png`,
`<link href="/styles.css">`) are served alongside the app. The app's generated `index.html` still takes
precedence over a `public/index.html`. (Adds `FileSystem.copyFile`.)

This turns the "no static assets" limitation into a working, conventional asset story. Transforming
*relative* asset module-imports (`import './x.png'`) remains future work.
