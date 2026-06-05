---
"@mindees/core": minor
"@mindees/atlas": minor
---

Add a **gesture system** — RN Gesture Handler / Flutter GestureDetector parity, built on the reactive
core and composing with the animation engine.

- **`@mindees/core`**: `tap`, `longPress`, `pan`, `pinch`, `swipe` recognizer factories. Each returns
  `{ handlers, state, reset }` — spread `handlers` (`onPointerDown/Move/Up/Cancel`) onto an element,
  read `state` (reactive signals: pan's `translationX/Y` + `velocityX/Y`, pinch's `scale`/`focal`, …)
  in a `style` accessor. `composeGestures([...])` merges recognizers onto one element (required since
  the renderer binds a single listener per event). `panAnimated(x, y, { release })` is the headline:
  drag follows the finger and **springs to a target seeded with the gesture velocity** on release.
  Platform differences live only in `normalizePointer` (web PointerEvent + native payload); an
  injectable clock makes long-press deterministic; SSR-safe (pure payload → signal).
- **`@mindees/atlas`**: `GestureView` — attach a recognizer to a view (handlers wired, auto-`reset`
  on unmount).

Native multi-touch payload wiring is a documented research-track follow-up; an explicit exclusive
gesture arena (beyond per-recognizer slop disambiguation) is a follow-up.
