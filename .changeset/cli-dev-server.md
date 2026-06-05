---
"@mindees/cli": minor
---

`mindees dev` now runs a real build + watch + **live-reload** dev server. New testable building
blocks: `createNodeWatcher` (adapts `node:fs.watch` to the `startDev` orchestrator's `Watcher`,
debounced so one save = one rebuild) and `createDevServer` (a pure request handler that serves the
app HTML with a live-reload client injected, plus a version endpoint the client polls — `bump()` on
each rebuild reloads connected browsers). `renderDevPage` produces a build-status preview page. The
`mindees` binary wires these over `node:http` (port via `MINDEES_DEV_PORT`, default 3000); the
watcher/server/orchestrator are unit-tested independently of the I/O glue.
