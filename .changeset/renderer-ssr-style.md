---
"@mindees/renderer": patch
---

Fix SSR style serialization: the headless/server backend emitted style objects with
camelCase CSS names and no units (`backgroundColor:red;marginTop:8`), so server-rendered
markup was invalid and never matched the hydrated DOM. The DOM and headless backends now
share one canonical serializer (`css.ts`) that kebab-cases names and applies `px` units
(`background-color:red;margin-top:8px`), so SSR output equals the client DOM.
