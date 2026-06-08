---
"@mindees/atlas": minor
---

**Tab navigator** (roadmap #8 — mobile-parity navigation). New `@mindees/atlas/tab` exports
`createTabNavigator(router, { tabs })`:

- The **active tab is derived from the URL** (longest matching tab path), so deep-links and
  back/forward navigation Just Work — no separate tab state to keep in sync.
- **Every screen stays mounted**, so each tab's state (scroll, form input, in-flight data) is preserved
  across switches; only visibility toggles.
- Full **ARIA** `tablist`/`tab` (`aria-selected`)/`tabpanel` semantics; an inactive panel is
  `display:none`, which also removes it from the a11y tree and tab order.

Joins `createStackNavigator` (`@mindees/atlas/stack`) for router-backed navigation.
