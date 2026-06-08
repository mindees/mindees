---
"@mindees/atlas": minor
"@mindees/router": patch
---

Resolve API-consistency contradictions ahead of a 1.0 freeze (roadmap #3):

- **atlas:** removed the orphaned `@mindees/atlas/theme` subpath (`createTheme`/`ThemeContext`/`ThemeTokens`).
  **No built-in component ever read it** — every component themes via `useTheme`/`tokens` (the main entry),
  which stays the single, working theming system (reactive, dark-mode aware). Shipping two incompatible
  theming APIs into 1.0 would have been a trap; this leaves exactly one. **Breaking:** import `useTheme`/
  `tokens` from `@mindees/atlas` instead of `createTheme` from `@mindees/atlas/theme`.
- **router:** `info` is now `Object.freeze`d, matching the frozen package-identity invariant every other
  `@mindees/*` already upholds.
