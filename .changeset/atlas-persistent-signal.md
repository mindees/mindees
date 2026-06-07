---
"@mindees/atlas": minor
---

Add **`usePersistentSignal`** — a reactive signal that restores from + auto-saves to a key/value store
(web `localStorage` by default; inject any `SignalStorage` for native), so persisting theme/prefs/UI
state is one call. Corrupt payloads fall back to the initial value; storage errors are swallowed.
