---
"@mindees/atlas": minor
---

Add device hooks + a platform environment — the signal-backed equivalents of React
Native's `useWindowDimensions`, `useColorScheme`, `useSafeAreaInsets`, and `Keyboard`.

- **`useWindowDimensions()`**, **`useColorScheme()`**, **`useSafeAreaInsets()`**,
  **`useKeyboard()`** return Quantum-style reactive accessors, so reads are
  fine-grained — rotating the device or switching theme re-runs only the nodes that
  read that value, never the whole tree (RN re-renders the component).
- **`setEnvironment(partial)`** / **`getEnvironment()`** — the host/runtime feeds the
  environment (on launch and on rotation/theme/keyboard changes); each field is a
  separate signal so updates stay isolated.

Closes a real RN-parity gap (MindeesNative previously had no dimensions/appearance
API). The Android example wires it end-to-end: the host injects window size + color
scheme, and the home screen shows them live.
