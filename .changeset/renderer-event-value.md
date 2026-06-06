---
"@mindees/renderer": minor
---

`NativeApp.dispatchEvent` now carries an optional text value: `dispatchEvent(handlerId, value?)`. When a
value is present it's wrapped as `{ target: { value } }` so input/change handlers read the typed text via
the standard event shape (`eventValue`); an absent/null value preserves notify-only behavior for
press/click. This unblocks value-carrying native events (e.g. `onChangeText`) — the native hosts pass the
raw string and JS owns the event-object wrapping. Empty-string clears are delivered (not swallowed).
