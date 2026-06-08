---
"@mindees/atlas": minor
---

**Accessibility: imperative `announce()` + a real modal focus trap** (roadmap #8 — WCAG gaps).

- `announce(message, politeness?)` — programmatically voice a message to screen readers (results counts,
  "Saved", validation errors) via a persistent visually-hidden `aria-live` region (one per `'polite'`/
  `'assertive'`, reused; clears-then-sets so an identical message re-announces). SSR/native-safe.
- `FocusScope` (and therefore `Modal`) now **traps Tab** within the scope — Tab from the last focusable
  wraps to the first, Shift+Tab from the first wraps to the last (WCAG 2.4.3), so keyboard focus can no
  longer escape an open dialog. It already captured + restored focus; this closes the documented gap.
