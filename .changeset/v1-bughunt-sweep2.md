---
"@mindees/router": patch
"@mindees/compiler": patch
"@mindees/cli": patch
"@mindees/renderer": patch
"@mindees/core": patch
"@mindees/atlas": patch
---

Fix seven correctness bugs found by a second adversarial bug-hunt (toward stable v1), each with a regression test:

- **router (file routes):** a dynamic/catch-all **directory** name (`posts/[id]/…`) was left literal `[id]`, so
  every Expo-style nested dynamic route was dead — now mapped to `:id`/`:x*` like file names.
- **compiler (transform):** the auto JSX-runtime import no longer **duplicates** a `createElement`/`Fragment`
  already bound by another import or a local declaration (which produced a module that crashes on load).
- **compiler (route codegen):** `generateRouteModule` now JSON-escapes the import specifier — a filename with a
  quote no longer emits a non-parsing module.
- **core (animation):** a throwing `onComplete` can no longer **freeze every animation** — the completion
  callback is isolated and the rAF chain always re-arms.
- **cli (create):** drive-relative / versioned paths (`C:foo`, `app:1.0`) are rejected up front instead of
  crashing `mkdir` (the CLI's "never throws" contract).
- **renderer (SSR):** HTML **void elements** (`img`/`input`) serialize without a closing tag/children, so
  crawlable markup round-trips to the same tree the reconciler builds.
- **atlas (Accordion):** `defaultOpen` now respects single-open mode from the first frame.
