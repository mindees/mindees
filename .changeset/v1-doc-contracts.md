---
"@mindees/core": patch
"@mindees/cli": patch
---

Resolve the two v1 doc-contract decisions from the bug-hunt, each with a regression test:

- **core (gesture):** `swipe()` now derives `direction` from the **release velocity** (the flick intent)
  instead of net displacement, so `direction` always agrees with the sign of `velocityX`/`velocityY`. A
  reversing flick (drag one way, fling back) now reports the way it was flung — previously `direction`
  (net travel) and the reported velocity could disagree. Falls back to displacement only at zero velocity.
- **cli (scaffold):** documented `--force`'s real contract — it **overlays/merges** the template onto a
  non-empty target (overwriting same-named files, keeping the user's other files); it does not wipe the
  directory (the FileSystem abstraction has no delete primitive). The misleading "overwrite" wording and
  the not-empty error message are corrected.
