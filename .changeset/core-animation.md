---
"@mindees/core": minor
"@mindees/atlas": minor
---

Add an **animation system** — RN `Animated`/Reanimated + Flutter `AnimationController` parity, built
entirely on the reactive core.

- **`@mindees/core`**: `animate(initial)` returns an `AnimatedValue` that **is a reactive accessor**
  (read it in a `style` fn → only that node re-renders, no renderer surface). Drive it with
  `timing(av, { to, duration, easing })` or `spring(av, { to, stiffness, damping })`; `interpolate`
  maps a value through ranges; `cubicBezier` + named easings. One injected `FrameSource`
  (`setFrameSource` — mirroring `setReactiveScheduler`; `rafFrameSource()` for web, `manualFrameSource()`
  for tests, vsync for native) drives a single loop that ticks all animations in **one `batch` per
  frame** (glitch-free). With **no frame source** (SSR/headless), animations jump to their final value
  synchronously — deterministic, never a hang. Animations started in a component scope auto-stop on
  unmount; springs have a stability cap; `done` + `onComplete` settle exactly once.
- **`@mindees/atlas`**: `motion` (the easing tokens as ready easing fns) + `animateTo` (timing with
  the standard duration/easing token defaults).
