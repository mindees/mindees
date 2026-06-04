---
"@mindees/compiler": minor
---

Add `generateRouteModule(files, options?)` — file-based-routing codegen. It emits a
TypeScript module that statically imports every route file and exposes them as the
module map `@mindees/router`'s `createFileRouter`/`routesFromModules` consume. This is
the build-time glue that makes file-based routing fully automatic on bundlers without
`import.meta.glob` (e.g. an embedded-engine native bundle): scan the `app/` directory,
run this over the file list, write `routes.gen.ts`, and import the map — drop a file in
`app/` and it's a route, with no hand-written route config.
