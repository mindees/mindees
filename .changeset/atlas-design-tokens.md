---
"@mindees/atlas": minor
---

Add a design-token layer + theming (2026 UI/UX handbook §7–24, §31).

- **Primitive scales**: `space` (8pt), `radius`, `fontSize` (1.25 type scale), `lineHeight`,
  `fontWeight`, `duration`/`easing` (motion), and color `palette` ramps — plus a `tokens`
  aggregate of the non-color scales.
- **Semantic theming**: a `Theme` (`bg`/`surface`/`surfaceVariant`/`text`/`textMuted`/`border`/
  `primary`/`onPrimary`/`success`·`warning`·`danger`·`info`) with light & dark variants.
  **Dark mode is a token-set swap** (§23/§31): `useTheme()` returns a reactive theme driven by
  `useColorScheme()`, and `getTheme(scheme)` resolves one non-reactively.
- **Components are now themed**: Card, Divider, Badge, Avatar, Chip, Switch, ProgressBar consume
  the theme, so they re-theme automatically light↔dark — fine-grained (only color nodes update),
  with WCAG-AA tone contrast in both modes.
