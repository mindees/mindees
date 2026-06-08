---
"@mindees/cli": patch
---

Build robustness fixes from the v1 integration review:

- **A side-effect asset import no longer bricks the build** — `import "./styles.css"` produced a fatal
  `TS2882` and an empty `dist/`; it's now downgraded (the import is left for the host; assets aren't bundled).
- **`mindees build` cleans `dist/` first** — a renamed/deleted source (or route) no longer leaves a stale
  module or a manifest-vs-chunk drift behind. (Adds `FileSystem.rm`.)
- **`mindees dev` decodes request paths** — a module whose file name is percent-encoded by the browser
  (e.g. a space) now resolves, matching how a static host serves `mindees build` output.
