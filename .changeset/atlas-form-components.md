---
"@mindees/atlas": minor
---

Add **`Checkbox`**, **`RadioGroup`**, and **`Skeleton`** components — common UI building blocks RN
ships none of built-in. All compose from existing primitives (so they render on web + native today),
are accessible (`role="checkbox"`/`"radio"`/`"radiogroup"`/`"status"` with reactive `aria-checked`),
and stay fine-grained (reactive accessor styles). `Checkbox` (controlled, optional label), `RadioGroup`
(single-select string options), `Skeleton` (aria-busy loading placeholder).
