---
"@mindees/compiler": patch
---

Fix Windows path corruption in route generation. `fileToRoute` split only on `/`, so a backslash
path (what `path.join` yields on Windows) collapsed the whole route into a single literal segment,
and `buildRouteManifest` stored backslash `file` specifiers that are invalid in `import()`.
Separators are now normalized to POSIX in both, so route paths, chunk names, and import specifiers
are correct regardless of host OS.
