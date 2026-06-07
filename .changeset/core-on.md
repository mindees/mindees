---
"@mindees/core": minor
---

Add **`on`** — make an `effect`/`memo` react to an *explicit* dependency only. The body runs untracked
(signals it reads don't subscribe); only the `deps` accessor does. The callback gets the current dep
value, the previous, and its own previous return. `{ defer: true }` skips the first run (still tracking),
so you react to *changes* not the initial value. `effect(on(() => id(), (id) => load(id)))`.
