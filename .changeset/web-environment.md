---
"@mindees/atlas": minor
"@mindees/cli": patch
---

**Live device hooks on the web target** (roadmap #4). The platform environment signals (`useColorScheme`,
`useWindowDimensions`, `useSafeAreaInsets`, `useKeyboard`, `useReducedMotion`) previously had no web
wiring — they kept inert defaults (0×0, light, no insets, keyboard hidden) on the framework's primary
target, so three advertised RN-parity capabilities silently no-op'd.

- **atlas:** new `connectWebEnvironment(window?)` subscribes `prefers-color-scheme` (dark mode),
  `prefers-reduced-motion`, `resize` + `devicePixelRatio` (dimensions/scale), `visualViewport` (soft
  keyboard height), and `env(safe-area-inset-*)` (via a hidden probe) — pushing each through
  `setEnvironment` as a fine-grained signal write. SSR-safe (no-op without a DOM); returns a `disconnect()`.
- **cli:** the `atlas` scaffold template's `main.tsx` now calls `connectWebEnvironment()`, so a freshly
  created app has live dark-mode/safe-area/keyboard hooks with zero config.
