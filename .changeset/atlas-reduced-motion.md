---
"@mindees/atlas": minor
---

Add **`useReducedMotion`** + a `reducedMotion` field on the platform environment — a reactive accessor
for the user's reduced-motion accessibility preference, so apps/animations can honor it (e.g. shorten or
skip transitions). Set via `setEnvironment({ reducedMotion })` from the host (web `prefers-reduced-motion`
/ native OS setting).
