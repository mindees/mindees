---
"@mindees/atlas": minor
---

Add **`createStackNavigator`** (new `@mindees/atlas/stack` subpath) — animated stack navigation over
the Quantum router, composing the keyed reconciler + animation engine + gesture system (RN stack
navigator / Flutter Navigator parity).

- Drop-in superset of `createRouterView`: `const Stack = createStackNavigator(router); render(Stack(), …)`.
- Pushing a route **slides/fades** the new screen in over the old; back reverses it; an **edge
  swipe-back** gesture drives the pop interactively (release past a threshold completes it with a
  velocity-seeded spring, else cancels).
- Transitions: `'slide'` (default), `'fade'`, `'none'`, or a custom `StackInterpolator`
  (`cardStyleInterpolator` parity); per-screen via `route.meta`.
- Reuses the keyed reconciler (surviving screens are reused, departed ones disposed when their key
  leaves the rendered set); ONE progress `AnimatedValue` drives both cards via `interpolate` (one
  batch/frame, glitch-free). No frame source (SSR/headless) → the destination renders instantly.

v1 limitation: a navigation that changes only params/search of the current screen snaps (remounts);
full in-screen param-state preservation is a follow-up.
