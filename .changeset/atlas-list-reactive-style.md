---
"@mindees/atlas": patch
---

Fix `List`/`SectionList` silently dropping a reactive (accessor) `style`. The scroll
container eagerly `flattenStyle`-d the caller's style, which `Object.assign`-es a function to
nothing — so a `style={() => ({...})}` was lost at runtime despite being typed as supported.
The container now keeps the style reactive when the caller's is (merging the base
height/position into the live accessor), so it updates fine-grained like every other style.
