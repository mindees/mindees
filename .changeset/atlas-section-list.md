---
"@mindees/atlas": minor
---

Add `SectionList` (on the `@mindees/atlas/list` subpath) — a **virtualized** sectioned list
built on `createList`. Sections are flattened to a single header/row entry stream and windowed,
so only the visible headers and rows render (RN-parity `SectionList`, perf-optimized). Provides
`SectionList`/`createSectionList`, `Section`, `SectionListOptions`, and the pure `flattenSections`
helper. `renderSectionHeader` is optional (defaults to the section title); fixed row height in v1
(headers share it), matching the List's current model.
