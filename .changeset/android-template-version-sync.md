---
"@mindees/cli": patch
---

Regenerate the `android` template's vendored module so its scaffolded `app-js` pins `@mindees/*` to the
current release, and run `gen:android-template` as part of `version-packages` so the pin tracks every
future version bump automatically (the drift guard was catching the post-0.20.0 lag).
