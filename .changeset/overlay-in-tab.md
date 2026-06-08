---
"@mindees/atlas": minor
---

**Overlay-in-tab fix** (implements ADR-0025, part 2). A `Modal`/`Toast` opened by a screen inside a
`createTabNavigator` tab no longer floats over other tabs after you switch — it hides with its owning tab and
reappears when you return. Each tab panel provides a tree-scoped `VisibilityScope` (`() => isActive`), and
overlays gate their portal on it (the portal's content lives on the overlay layer, where `display:none` on
the inactive panel can't reach it). `VisibilityScope` is exported for custom keep-alive-hidden containers.
