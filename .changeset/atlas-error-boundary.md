---
"@mindees/atlas": minor
---

Add **`ErrorBoundary`** — catch errors thrown while rendering a subtree and show a `fallback(error, reset)`
instead of failing the whole app (RN/React's `<ErrorBoundary>`, signals-native). `reset()` retries; a
tracked signal read before the throw also re-runs the boundary when it changes. Catches synchronous
render-time errors.
